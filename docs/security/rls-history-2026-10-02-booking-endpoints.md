# RLS History — 2026-10-02 (endpoint di prenotazione passwordless)

File SQL:

- `supabase/rls-history/2026-10-02-booking-endpoints.sql`

Test:

- `supabase/tests/run.sh` — cluster Postgres 16 usa e getta, catena completa,
  suite comportamentale. Non tocca mai il Supabase reale.

Questa nota **completa** [`rls-history-2026-10-01-contacts-sessions-formulas.md`](./rls-history-2026-10-01-contacts-sessions-formulas.md):
lì nascevano tabelle e stati, qui nasce la logica che le usa.

Il file non è mai stato applicato: la seconda versione (ticket derivato, limiti,
pulizia, recupero legacy) lo **modifica sul posto**. Resta un unico file
rieseguibile; le funzioni che cambiano firma o tipo di ritorno, e quelle
sostituite, vengono droppate prima.

---

## Cosa aggiunge

### Funzioni `ep_*` — solo `service_role`

Una funzione per operazione degli endpoint serverless. Ogni scrittura a più
passi è una sola transazione, e l'endpoint resta sottile.

| Funzione | Cosa fa |
| --- | --- |
| `ep_request_booking(…, p_source, p_ticket_secret)` | Con sessione: `confirmed` subito + ticket token derivato. Senza: contatto dal form, `pending` 30 minuti + link di attivazione. Nuovo esito `rate_limited` (solo senza sessione). |
| `ep_activate(p_token, p_ticket_secret)` | Consuma il link, verifica l'email, applica i consensi, crea la sessione, conferma **solo** la `pending` da cui è partito, e solo se l'evento è ancora pubblicato e non passato (altrimenti `unavailable`). Ticket token derivato. |
| `ep_request_login(p_email)` | `sent` se il contatto esiste **o viene recuperato da prenotazioni legacy**, `unknown` altrimenti, `rate_limited` oltre il limite per indirizzo. |
| `ep_session_overview(p_token, p_ticket_secret)` | Contatto + prenotazioni future in un `jsonb` (null se la sessione non vale). Sostituisce `ep_session` e `ep_my_reservations`, droppate. |
| `ep_logout(p_token)` | Revoca la sessione. |
| `ep_cancel_reservation(p_token, p_reservation_id)` | Disdetta; quella di un altro risponde come inesistente. |
| `ep_throttle(p_key_hash, p_action, p_limit, p_window_seconds)` | Contatore per IP a finestra fissa (vedi sotto). |
| `ep_cleanup()` | Pulizia quotidiana, restituisce i conteggi cancellati. |

Revocate **esplicitamente** da `public`, `anon` e `authenticated`: le DEFAULT
PRIVILEGES dello schema esposto concedono ogni funzione nuova direttamente ad
`anon` e `authenticated`, quindi il solo `revoke ... from public` le
lascerebbe chiamabili dal browser. Verificato nei test, anche che le vecchie
firme non esistono più.

### Ticket token derivato (HMAC)

Le prenotazioni confermate dagli endpoint (con sessione in
`ep_request_booking`, o all'attivazione) hanno come ticket token
`derive_ticket_token(reservation_id, segreto)`:

- ricetta esatta: HMAC-SHA256 con `pgcrypto.hmac(bytea, bytea, 'sha256')`,
  messaggio = byte UTF-8 dell'uuid in forma testuale canonica (minuscola),
  chiave = byte UTF-8 del segreto; poi base64url **senza padding**
  (`+`→`-`, `/`→`_`, `=` tolti), 43 caratteri. Un vettore di prova calcolato
  fuori da Postgres è nei test;
- il segreto **non sta nel DB**: l'endpoint lo passa a ogni chiamata
  (`p_ticket_secret`, env `TICKET_SECRET`). Solo il DB calcola il token;
- un segreto null o più corto di 32 caratteri solleva un'eccezione
  (`22023`) in ogni `ep_*` che lo riceve, su qualunque percorso: è un errore di
  configurazione, non un esito, e non scrive nulla;
- in tabella resta solo `hash_ticket_token(token)`, come prima: QR, link
  `?t=` e check-in sono identici;
- il percorso legacy (`create_public_reservation`) resta casuale.

Il vantaggio: "le mie prenotazioni" può ricostruire il link del ticket senza
che il token sia mai salvato. Ruotare `TICKET_SECRET` **non** invalida i
ticket già emessi (il loro hash resta valido, il link nell'email funziona);
semplicemente l'overview smette di mostrarne il link.

### `ep_session_overview` e rinnovo una volta al giorno

Restituisce `{ contact: {email, full_name, marketing_consent,
profiling_consent, session_expires_at}, reservations: [...] }` (chiavi
snake_case, sempre presenti; `reservations` vuoto = `[]`). Le prenotazioni:
eventi da oggi in poi (Europe/Rome), `confirmed` o `pending` non scadute,
ordinate per data e ora. `ticket_token` è valorizzato **solo** se la riga è
`confirmed` e l'hash salvato è quello del token derivato; altrimenti `null`
(ticket legacy casuale, pending, segreto ruotato).

`renew_contact_session` ora rinnova (`last_used_at`, `expires_at` = +12 mesi)
solo se l'ultimo rinnovo ha più di un giorno; altrimenti valida e basta, con la
stessa uscita. Vale per tutti gli `ep_*` che usano la sessione: una scrittura
al giorno invece che una per pagina.

### `open_public_ticket` — `anon` e `authenticated`

Sostituisce `get_public_ticket` (droppata) **e** l'update di
`ticket_opened_at` fatto dal client tramite le policy di aprile. Una chiamata:
se id + token combaciano restituisce la riga e, se `confirmed`, non
scansionata e mai aperta, imposta `ticket_opened_at = now()`. Token sbagliato:
zero righe, nessuna scrittura. Non dipende dalle policy RLS col token.

Il `ticket_opened_at` restituito è il valore **prima** dell'aggiornamento:
`null` vuol dire "questa è la prima apertura". La riga è letta `for update`,
quindi di due prime aperture simultanee una sola vede `null`. Nome ed email da
`contacts`, o da `to_jsonb(r)` per le righe legacy: regge il drop delle
colonne (provato nei test, anche la marcatura).

### Recupero delle prenotazioni legacy

`ep_request_login` su un indirizzo **senza contatto** che ha prenotazioni
legacy (`contact_id` null) `confirmed` per eventi da oggi in poi: crea il
contatto dai dati della più recente (nome, data di nascita, email
normalizzata, mai verificato, nessun consenso), collega a quel contatto
**tutte** le righe legacy con quella email (qualunque stato o data), poi
`sent`. Solo eventi passati, o solo disdette: `unknown`, nessuna scrittura.

Il loro ticket resta casuale: in overview `ticket_token` è `null` e il ticket
resta quello dell'email originale.

### Limite per indirizzo

Al massimo **3** link di attivazione per contatto nell'ultima ora e **10**
nelle ultime 24 ore (prenotazione e accesso insieme). Oltre:
`rate_limited`, nessun link, nessuna scrittura (né pending rinfrescata, né
vecchio link bruciato). Vale per `ep_request_booking` senza sessione (anche
sul ramo `already_booked`, che manderebbe un link di accesso) e per
`ep_request_login`. Conta sul contatto esistente: un indirizzo senza contatto
non è limitato qui. L'endpoint risponde comunque `check_email` senza inviare
nulla, per non rivelare che l'indirizzo esiste.

### Limite per IP — `request_throttle` + `ep_throttle`

Tabella `(key_hash, action, window_start, hits)`, RLS attiva, nessuna policy,
`revoke all` da `anon` e `authenticated`. `key_hash` è l'HMAC dell'IP calcolato
dall'endpoint: l'IP in chiaro non arriva mai al DB.

`ep_throttle` conta un colpo nella finestra corrente, allineata
(`floor(epoch / finestra) * finestra`), con un upsert atomico
`hits = hits + 1`, e restituisce `true` finché i colpi (questo incluso) sono
entro il limite. Due colpi simultanei si serializzano sulla chiave primaria e
ognuno vede il proprio conteggio (provato con due sessioni reali). Argomenti
non validi (chiave vuota, finestra ≤ 0, limite null o negativo): eccezione
`22023`. I limiti per azione stanno nel server.

### Pulizia — `ep_cleanup`

Restituisce `{activation_tokens, contact_sessions, request_throttle,
reservations, contacts}` con i conteggi cancellati:

- link di attivazione scaduti da più di 1 giorno (usati o no). Un link vive 30
  minuti, quindi sparisce sempre dopo la finestra di 24 ore del limite per
  indirizzo: la pulizia non abbassa mai un conteggio vivo;
- sessioni revocate, o scadute, da più di 30 giorni;
- finestre di `request_throttle` più vecchie di 1 giorno;
- contatti **mai verificati**, creati da più di 7 giorni, senza alcuna
  prenotazione `confirmed`: prima le loro `pending`/`cancelled`, poi il
  contatto (link e sessioni cadono in cascata e non sono contati).

### Costanti

In testa al file, come piccole funzioni `immutable` `cfg_*` (non chiamabili
dall'API): 3/ora e 10/giorno, rinnovo sessione 1 giorno, conservazione link
1 giorno, sessioni 30 giorni, finestre 1 giorno, contatti non verificati
7 giorni. Si cambia il numero e si riesegue il file.

### `scan_ticket_check_in` riscritta — solo `authenticated`

È il passo 1 della pulizia del 2026-10-01, ora fatto:

- nome da `contacts` (o `to_jsonb` per le legacy), mai `r.full_name`;
- esito `pending`: una prenotazione mai confermata non viene scansionata;
- `formula_expired`: oltre `event_entries.valid_until` la cassa fa pagare il
  prezzo pieno, anche su `already_scanned`.

Il tipo di ritorno cambia, quindi `drop` + `create` con le stesse grant.
Accetta i token derivati come gli altri. Verificato nei test che scan e ticket
funzionano **dopo** il drop delle colonne legacy (prova eseguita in una
transazione annullata).

---

## Scelte che non stanno nel contratto, o lo interpretano

- **Lock di prenotazione sull'email normalizzata**, non sull'id del contatto:
  la prima prenotazione va serializzata prima che il contatto esista. Lo
  prendono sia `ep_request_booking` sia `ep_activate`, quindi una riprenotazione
  e l'apertura del vecchio link non si intrecciano. Un secondo lock per formula
  rende atomici conteggio quota e conferma.
- **Lock per indirizzo** (`lock_contact`), nuovo: lo prendono il percorso senza
  sessione di `ep_request_booking`, `ep_request_login` e la pulizia. Rende
  esatto il limite per indirizzo anche fra serate diverse, e fa sì che due
  richieste di accesso simultanee per lo stesso indirizzo legacy creino un solo
  contatto (provato con due sessioni reali). Ordine fisso: persona+evento,
  poi indirizzo, poi formula.
- **Recupero legacy anche dal ramo `already_booked`** di `ep_request_booking`:
  un indirizzo solo legacy che riprenota riceve il contatto ricostruito dalle
  sue prenotazioni (non dai dati appena digitati nel form) e le righe vengono
  collegate. Altrimenti il contatto nato dal form avrebbe bloccato per sempre
  il recupero, e "le mie prenotazioni" sarebbe rimasta vuota.
- **Contatto già esistente: nessun collegamento** delle righe legacy, come da
  contratto. Collegarle a un contatto creato da chiunque abbia digitato quella
  email farebbe mostrare in cassa il nome scelto da lui.
- **Due righe legacy attive sulla stessa serata** con la stessa email in
  maiuscole/minuscole diverse (l'indice legacy è sull'email grezza): viene
  collegata solo la più recente, l'altra resta senza contatto, invece di
  fallire sull'indice per contatto.
- **Il recupero legge le colonne legacy via `to_jsonb(r)`**: dopo il loro drop
  la richiesta di accesso trova semplicemente nulla da recuperare, invece di
  fallire (provato nei test).
- **La pulizia risparmia i contatti con un link ancora valido** (qualcuno lo
  sta aprendo adesso) e quelli il cui indirizzo è occupato da una richiesta in
  corso (`pg_try_advisory_xact_lock`: si salta, ci pensa il giro dopo).
  Altrimenti una prenotazione alle 4 di notte da un indirizzo vecchio e mai
  verificato perderebbe il contatto a metà.
- **Nessun contatto creato su un rifiuto** (`sold_out`, `invalid_*`,
  `not_bookable`, `rate_limited`). Viene creato solo quando la richiesta porta
  a qualcosa.
- **Una `pending` scaduta con sessione** diventa `confirmed` sulla stessa riga
  (l'indice parziale ammette una sola riga attiva per persona e serata).
- **`source` alla riprenotazione**: un valore valido sostituisce il precedente,
  un valore assente o non valido non cancella quello già noto.
- **`issue_ticket_access_token` revocata ad `anon` e `authenticated`.** Non era
  mai stata revocata: con lo schema esposto chiunque conoscesse l'id di una
  prenotazione poteva ruotarne il token (invalidando il QR del titolare) e
  riceverne uno valido. Nessun client la chiama; le funzioni `security
  definer` che la usano non ne risentono.

---

## Superficie esposta ad `anon`, dopo questa migrazione

Invariata rispetto al 2026-10-01, più `open_public_ticket`. Il percorso anon di
prenotazione (`anon_insert_reservation`, `create_public_reservation`) e le
policy `x-ticket-token` restano vive per scelta: la migrazione è additiva.
`request_throttle` è chiusa come le tabelle del 2026-10-01.

---

## Prima della pulizia (passo 5 del 2026-10-01)

`ep_request_booking` **scrive ancora** `full_name`, `date_of_birth` ed `email`
sulla prenotazione, perché oggi sono `NOT NULL`, e **legge** `email` per
riconoscere le prenotazioni legacy. Va sostituita con una versione che non lo
fa **prima** del drop delle colonne, altrimenti ogni prenotazione fallisce.
Annotato anche nel blocco "NEXT STEP" del file del 2026-10-01.

Quando il web legge il ticket solo con `open_public_ticket`, ad `anon` non
serve più la tabella: si possono togliere le policy
`anon_read_own_reservation_token` / `anon_update_ticket_opened_token_once` e
revocare `select`/`update` su `reservations` (passo 1c dello stesso blocco).

Dopo il drop di `anon_insert_reservation`, va tolta anche da `rls.sql`, che ora
è rieseguibile e la ricreerebbe.
