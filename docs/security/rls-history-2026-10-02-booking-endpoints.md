# RLS History — 2026-10-02 (endpoint di prenotazione passwordless)

File SQL:

- `supabase/rls-history/2026-10-02-booking-endpoints.sql`

Test:

- `supabase/tests/run.sh` — cluster Postgres 16 usa e getta, catena completa,
  suite comportamentale. Non tocca mai il Supabase reale.

Questa nota **completa** [`rls-history-2026-10-01-contacts-sessions-formulas.md`](./rls-history-2026-10-01-contacts-sessions-formulas.md):
lì nascevano tabelle e stati, qui nasce la logica che le usa. Il token del
ticket resta quello di aprile.

---

## Cosa aggiunge

### Funzioni `ep_*` — solo `service_role`

Una funzione per operazione degli endpoint serverless. Ogni scrittura a più
passi è una sola transazione, e l'endpoint resta sottile.

| Funzione | Cosa fa |
| --- | --- |
| `ep_request_booking` | Con sessione: `confirmed` subito + ticket token. Senza: contatto dal form, `pending` 30 minuti + link di attivazione. |
| `ep_activate` | Consuma il link, verifica l'email, applica i consensi, crea la sessione, conferma **solo** la `pending` da cui è partito. |
| `ep_request_login` | Link di accesso se il contatto esiste (`sent`), altrimenti `unknown`. |
| `ep_session` / `ep_logout` | Lettura e rinnovo della sessione; revoca. |
| `ep_my_reservations` | Prenotazioni future, `confirmed` o `pending` non scadute. |
| `ep_cancel_reservation` | Disdetta; quella di un altro risponde come inesistente. |

Revocate **esplicitamente** da `public`, `anon` e `authenticated`: le DEFAULT
PRIVILEGES dello schema esposto concedono ogni funzione nuova direttamente ad
`anon` e `authenticated`, quindi il solo `revoke ... from public` le
lascerebbe chiamabili dal browser. Verificato nei test.

### `get_public_ticket` — `anon` e `authenticated`

La pagina ticket legge la sua riga con id + token in una RPC. Il possesso del
token è l'autorizzazione, esattamente come per l'header `x-ticket-token`, che
resta funzionante. Nome ed email vengono da `contacts`; per le righe legacy
senza contatto, da `to_jsonb(r)`, così la funzione regge il drop delle colonne.

### `scan_ticket_check_in` riscritta — solo `authenticated`

È il passo 1 della pulizia del 2026-10-01, ora fatto:

- nome da `contacts` (o `to_jsonb` per le legacy), mai `r.full_name`;
- esito `pending`: una prenotazione mai confermata non viene scansionata;
- `formula_expired`: oltre `event_entries.valid_until` la cassa fa pagare il
  prezzo pieno, anche su `already_scanned`.

Il tipo di ritorno cambia, quindi `drop` + `create` con le stesse grant.
Verificato nei test che scan e ticket funzionano **dopo** il drop delle colonne
legacy (prova eseguita in una transazione annullata).

---

## Scelte che non stanno nel contratto, o lo interpretano

- **Lock di prenotazione sull'email normalizzata**, non sull'id del contatto:
  la prima prenotazione va serializzata prima che il contatto esista. Lo
  prendono sia `ep_request_booking` sia `ep_activate`, quindi una riprenotazione
  e l'apertura del vecchio link non si intrecciano. Un secondo lock per formula
  rende atomici conteggio quota e conferma. Ordine fisso: persona+evento, poi
  formula.
- **Nessun contatto creato su un rifiuto** (`sold_out`, `invalid_*`,
  `not_bookable`). Viene creato solo quando la richiesta porta a qualcosa:
  `pending`, oppure `already_booked` su una riga legacy, dove serve per appendere
  il link di accesso.
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

Invariata rispetto al 2026-10-01, più `get_public_ticket`. Il percorso anon di
prenotazione (`anon_insert_reservation`, `create_public_reservation`) resta vivo
per scelta: la migrazione è additiva.

---

## Prima della pulizia (passo 5 del 2026-10-01)

`ep_request_booking` **scrive ancora** `full_name`, `date_of_birth` ed `email`
sulla prenotazione, perché oggi sono `NOT NULL`, e **legge** `email` per
riconoscere le prenotazioni legacy. Va sostituita con una versione che non lo
fa **prima** del drop delle colonne, altrimenti ogni prenotazione fallisce.
Annotato anche nel blocco "NEXT STEP" del file del 2026-10-01.

Dopo il drop di `anon_insert_reservation`, va tolta anche da `rls.sql`, che ora
è rieseguibile e la ricreerebbe.
