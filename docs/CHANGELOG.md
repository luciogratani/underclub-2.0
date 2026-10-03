# Changelog

Registro delle modifiche al repo, dalla piu' recente. Le decisioni di prodotto e
la roadmap restano in [`prossimi-passi.md`](./prossimi-passi.md).

---

## 2026-10-02 (sera, 2) — Vecchio flusso chiuso, MusicEvent, build pulita

Branch `feat/pre-season`, impilato su `feat/home-no-events`. Migrazioni e web
sono in produzione dal 2026-10-03 (commit `654c01a`): vedi `handoff.md`, punto 6b.

### Sicurezza
- **`2026-10-02-retire-anon-booking.sql`** (step 1c, 2 e 3 della pulizia del
  2026-10-01). Fino a questa migrazione `anon` poteva:
  - inserire prenotazioni direttamente (policy `anon_insert_reservation`);
  - inserirle con `create_public_reservation`, senza conferma via email, senza
    controllo dei 18 anni, senza lock sulla quota e senza limiti.

  La migrazione toglie ad `anon` ogni privilegio su `reservations`, insieme
  alle policy `x-ticket-token`. Il ticket si legge solo con
  `open_public_ticket`. `rls.sql` non ricrea più la policy di insert.

- **`2026-10-03-admin-allowlist.sql`** (aggiunta il 2026-10-03, durante la
  revisione). Il login di Supabase è condiviso con gli altri progetti
  dell'istanza (foras/University, alex_akashi). Le policy admin
  `to authenticated using (true)` aprivano quindi contatti, prenotazioni,
  serate e check-in a qualunque account dell'istanza.
  - Ora serve essere in `underclub.admin_users`; il controllo è
    `underclub.is_admin()`, che usa `auth.uid()` come `is_tenant_owner()` di
    foras ma senza passare da `public.tenants`.
  - `scan_ticket_check_in` risponde 42501 a chi non è in lista.
  - `rls.sql` e la migrazione 2026-10-01 definiscono già le policy con
    `is_admin()`.
  - Test: nel bootstrap ci sono uno schema `auth` minimo e due utenti di
    prova (admin Underclub e utente di un altro progetto); una prova a mano
    conferma che una policy riaperta con `using (true)` fa fallire `07`.

### Tolto
- Il flag `VITE_BOOKING_API` e il percorso con il flag spento:
  - prenotazione via RPC diretta;
  - ticket via header `x-ticket-token`;
  - `markTicketOpened`;
  - testi della privacy di aprile.

### Aggiunto
- **Dati strutturati `MusicEvent` per la serata in home:**
  - inizio in ora di Roma (un orario prima di mezzogiorno vale come dopo
    mezzanotte);
  - il club come luogo, la lineup e le formule come offerte valide fino alla
    chiusura online.
- ESLint (`pnpm --filter web lint`): 0 errori, restano 17 avvisi, quasi tutti
  `any` nel codice 3D del lanyard.
- Vitest raccoglie anche i test di `src/lib`.

### Corretto
- **Errori TypeScript nei log di build di Vercel:** `@vercel/node` controlla i
  tipi senza seguire i symlink di pnpm. Per questo non trovava `undici-types`
  dentro `@types/node`, e `Request`/`Response` restavano vuoti. Il fix è
  `undici-types` come devDependency diretta: ho riprodotto il controllo in
  locale, 13 errori prima e 0 dopo.
- Toast di errore in inglese ("code", "Close").

---

## 2026-10-02 (sera) — Home senza serate, caricamento, fine serata, chiusura prenotazioni

Branch `feat/home-no-events`. Migrazione e sito sono in produzione dal
2026-10-03 (commit `654c01a`): vedi `handoff.md`, punto 1b.

### Aggiunto
- **Fine serata unica:** una serata vale fino alle 06:00 (ora di Roma) del
  giorno dopo la sua data. La regola è `event_ends_at(date)` ed è usata da
  prenotazione, conferma, MY BOOKINGS, disdetta, recupero legacy e ticket.
- **Chiusura delle prenotazioni online per serata:** colonna
  `events.booking_closes_at`. Se è vuota vale il default delle 18:00 della data;
  non c'è nessun vincolo nel DB, ma un valore oltre la fine serata viene
  limitato a lei. La regola è `event_booking_deadline(date, closes_at)`. Un
  pending chiesto prima della chiusura si conferma anche dopo.
- **Computed fields** per il sito su `events`: `ends_at`, `booking_deadline`,
  `is_over`. Il browser non fa più calcoli sulle date.
- **`open_public_ticket` restituisce `event_ended`:** a serata finita la pagina
  ticket mostra un avviso al posto del QR, e il ticket non viene più segnato
  come aperto.
- **Home scelta una volta sola dopo il caricamento:**
  - finché non rispondono la serata e la sessione (al massimo 5 s) si vede solo
    l'anello `UNDERCLUB.IT - `, senza bottoni né menu;
  - poi parte l'intro;
  - senza serata pubblicata, una sola schermata con il ciclo
    ` < NEXT DATE > ??.??` e la pill `FOLLOW US →`, che apre i social nel
    pannello lime del menu;
  - in caso di errore o timeout, stessa home con un messaggio neutro.
- **Book Now chiuso:** dopo la chiusura, o senza formule, al posto di
  `BOOK NOW` compaiono "BOOKING CLOSED" e "tickets at the door"; il form non è
  più raggiungibile. Un `not_bookable` ricevuto alla conferma ricarica la
  serata.
- `supabase/tests/13-night-end-booking-close.sql`.

### Cambiato
- Il guscio del pannello lime (fade, focus, Esc, chiusura) è ora
  `OverlayPanel`, usato dal menu e da FOLLOW US.
- I link social stanno in `src/lib/social.ts`, usato anche da `/info`.
- `2026-10-02-booking-endpoints.sql` non va più rieseguito dopo la nuova
  migrazione: `run.sh` riesegue solo quella.

### Tolto
- I dati finti: la serata di esempio in `NextDate`, le tre formule di Book Now,
  la conferma "YOU'RE IN!" senza salvataggio e i ripieghi dell'anello.

---

## 2026-10-02 — Sito in produzione in manutenzione, SEO, presenza online

### Aggiunto
- **SEO e condivisione**: favicon e icone, manifest, scheda Open Graph con
  `og.png`, titolo e descrizione, dati strutturati `NightClub`, `robots.txt`,
  `sitemap.xml`, `noindex` sulle pagine personali. Canale WhatsApp in `/info`
  e nella pagina di manutenzione.
- **Modalità manutenzione** (Routing Middleware): `MAINTENANCE_MODE=1` chiude
  pagine e API con un 503, lascia aperti cron, file statici e ticket; il link
  `?bypass=` con `MAINTENANCE_BYPASS_SECRET` fa entrare il team. Pagina con il
  logo del club e i contatti (email, Instagram, Facebook, WhatsApp).
- `docs/presenza-online.md`: dati del locale, bio, Google, RA, link tracciati.

### Produzione
- Env di Production caricate su `underclub-2-0-web` (segreti nuovi, API key
  Resend dedicata), comprese quelle della manutenzione.
- Cancellate dal DB di produzione le prenotazioni, i contatti e i contatori
  delle prove sul Preview.
- Primo deploy di produzione del sito nuovo, da `main` (branch di rilascio),
  con la manutenzione accesa.
- `underclub.it` e `www` spostati da `underclub` a `underclub-2-0-web`: la root
  è il dominio principale, `www` reindirizza con un 308. Prenotazione completa
  provata dal dominio vero con il link di accesso.
- Fuori dal repo: pagina del locale su Resident Advisor
  (https://ra.co/clubs/304274), in attesa del supporto RA; trovata la scheda
  Google "UNDERCLUB", da rivendicare.

### Corretto
- Con la manutenzione, WhatsApp e Facebook non mostravano la scheda di
  condivisione perché ricevevano un 503: ora gli anteprimatori dei link
  ricevono la pagina con un 200.
- `/info`: i link a Instagram e Facebook puntavano alle home generiche.

### Cambiato
- Rilasci: `main` è il branch di produzione (`git push origin master:main`),
  `master` resta il branch di lavoro con i preview.
- Approvati tutti i testi `COPY-DRAFT` (UI, email, privacy, check-in admin) e
  tolti i marcatori.
- Privacy: tra i responsabili, Hetzner (il server del database) sostituisce
  Supabase; con il flag acceso la data di aggiornamento è il 2 ottobre 2026.
- "booking" al posto di "reservation" nei testi nuovi; titoli delle email in
  maiuscolo; "You're logged in" dopo un link di accesso; "tailored" al posto
  di "personalised" nei consensi di `/account`.

---

## 2026-10-01 (sera) — Migrazioni in produzione, DNS

### Produzione
- Applicate sul Supabase self-hosted `2026-10-01-contacts-sessions-formulas.sql`
  e `2026-10-02-booking-endpoints.sql`, come `supabase_admin`, dopo dry-run e
  backup. Chiuso il buco di `issue_ticket_access_token`.
- DNS di `underclub.it` (zona su Vercel): Resend per `reservations.` e
  `news.`, DMARC `p=none`, Google Postmaster, `info@` inoltrata con ImprovMX.
  Dettagli in [`dns-underclub.md`](./dns-underclub.md).

- `feat/passwordless-booking` unito in `master` (fast-forward) e pushato.
  Preview di `underclub-2-0-web` con env legate al branch `master` e flag
  acceso, provato sul DB di produzione: prenotazione, conferma, ticket,
  email (SPF, DKIM e DMARC `PASS`), menu, logout, recupero. La produzione di
  Vercel non è cambiata (branch di produzione `main`, inesistente).
- Cancellate le prenotazioni di test preesistenti (15) dal DB di produzione.

### Corretto
- `service_role` non aveva usage sullo schema `underclub` in produzione:
  grant aggiunto alla migrazione 2026-10-02; il bootstrap dei test ora
  rispecchia la produzione e il test dei privilegi lo controlla.

### Aggiunto
- `EMAIL_REPLY_TO` (facoltativa): Reply-To delle email, perché il
  sottodominio di invio non ha una casella.

---

## 2026-10-01 (pomeriggio) — Recupero del ticket, limiti ai tentativi, menu

Stesso branch, dopo la prima revisione. Dettagli nella sezione 9 di
[`prossimi-passi.md`](./prossimi-passi.md), "Secondo giro".

### Aggiunto
- **Token del ticket derivato** (HMAC con `TICKET_SECRET`): chi ha la sessione
  ritrova il QR in ogni momento e il link nell'email resta valido.
- **Menu, `/account` e bottone ticket in home** (dietro flag), con il recupero
  della prenotazione via email, anche per quelle del flusso vecchio.
- **Limiti**: per indirizzo in SQL (3/ora, 10/giorno, silenzioso), per IP con
  HMAC dell'indirizzo (429), BotID di Vercel su prenotazione e link di accesso.
- **Pulizia notturna** via Vercel Cron: link, sessioni, contatori e contatti mai
  confermati dopo 7 giorni.

### Cambiato
- `open_public_ticket` sostituisce `get_public_ticket` e segna la prima apertura
  nella stessa chiamata; `ep_session_overview` sostituisce `ep_session` +
  `ep_my_reservations`; il rinnovo della sessione si scrive al massimo una volta
  al giorno.
- Nuove variabili obbligatorie su Vercel: `TICKET_SECRET`, `IP_HASH_SECRET`,
  `CRON_SECRET`.

---

## 2026-10-01 (notte) — Endpoint passwordless, funnel dietro flag, test

Branch `feat/passwordless-booking`. Il modello dati della voce sotto prende vita:
endpoint serverless, funnel che sa dire "controlla la posta", check-in che
conosce le `pending`. **Niente applicato su Supabase né deployato**: i passi per
andare in produzione sono nella sezione 9 di [`prossimi-passi.md`](./prossimi-passi.md).

### Aggiunto

- **`supabase/rls-history/2026-10-02-booking-endpoints.sql`** (passo 7 della
  catena; il nome lo ordina dopo quello del mattino):
  - funzioni `ep_*` per prenotazione, attivazione, link di accesso, sessione,
    logout, le mie prenotazioni, disdetta. Solo `service_role`, ognuna una
    transazione, con lock consultivi su persona+evento e sulla quota;
  - `get_public_ticket` per la pagina ticket, che legge il nome da `contacts` e
    regge il futuro drop delle colonne legacy;
  - `scan_ticket_check_in` riscritta: esito `pending`, colonna `formula_expired`.
- **Endpoint Vercel** in `apps/web/api/` sopra handler puri in `apps/web/server/`:
  cookie `uc_session` httpOnly a rinnovo, POST solo JSON con `Origin` ammesso,
  risposte identiche per email nuove e già prenotate, email via Resend.
- **Funnel web dietro `VITE_BOOKING_API=1`**: consensi separati, "check your
  inbox", pagina `/activate`, blocco "booking as", prezzo e orario limite delle
  formule, cattura di `?src=` / `utm_source`. Bozze di privacy e data notice.
- **Admin**: card `pending` e avviso "formula scaduta" nel check-in.
- **Tipi condivisi**: `pending`, tabelle e RPC nuove, contratto HTTP in
  `packages/shared/src/api.ts`.
- **Test**: `supabase/tests/run.sh` (catena completa su Postgres 16 usa e getta,
  8 file con attacchi RLS e concorrenza via dblink) e vitest per gli endpoint
  (78 unit + 7 integrazione sullo stesso Postgres).

### Corretto

- **`issue_ticket_access_token` era eseguibile da `anon`**: chi aveva l'id di una
  prenotazione poteva ruotarne il token e riceverne uno valido. Revocata nella
  migrazione nuova: **in produzione resta aperta finché non la si applica**.
- Il file del 2026-04-17 ora qualifica `digest` e `gen_random_bytes` con
  `extensions`, e `rls.sql` è rieseguibile.
- Il ticket token non viene più stampato in console dopo la prenotazione.
- Un errore di prenotazione non svuota più il form.

### Scelte non ovvie

- Il link email apre `/activate`, che fa **POST**: un GET verrebbe consumato dai
  link-scanner delle caselle prima dell'utente.
- I consensi del form valgono **solo all'apertura del link**, e una prenotazione
  anonima non modifica mai un contatto esistente.
- Una prenotazione col form **ignora il cookie di sessione**, così un cookie
  rimasto non prenota a nome di qualcun altro.
- Il trasporto email `console` (stampa i link) è rifiutato su **ogni** deploy
  Vercel, preview compresi.

---

## 2026-10-01 — Schema per registrazione, sessioni e formule d'ingresso

Il flusso pubblico passa da "compila e vai" a utenti registrati con sessione e
consensi. Questa voce copre solo lo schema: gli endpoint non esistono ancora.
Le decisioni complete sono nella sezione 8 di
[`prossimi-passi.md`](./prossimi-passi.md).

### Aggiunto

- **`supabase/rls-history/2026-10-01-contacts-sessions-formulas.sql`**:
  - `contacts` — la persona, separata dalla singola prenotazione: email unica e
    normalizzata, nome completo in un campo, data di nascita, consensi marketing
    e profilazione con data di concessione e revoca, trigger su `updated_at`.
  - `activation_tokens` — link monouso, con il riferimento alla prenotazione da
    confermare: conferma solo quella, quindi un link vecchio non ne risuscita
    una dimenticata.
  - `contact_sessions` — sessione a rinnovo dietro cookie `httpOnly`; in DB solo
    l'hash del token.
  - `event_entries` — aggiunti `price` e `valid_until`. `note` resta il campo
    offerta già mostrato in BookNow, `quota` nulla significa illimitata.
  - `reservations` — `contact_id`, stato `pending` con scadenza obbligatoria,
    `confirmed_at`, `cancelled_at`, `source`.
  - `reservations.source` — da dove arriva la prenotazione, per la futura
    sezione analytics: slug normalizzato (minuscole, cifre, trattino o
    underscore, 2-64 caratteri) tipo `meta-ads`, `volantino-ottobre`,
    `pr-giulia`. Non testo libero, altrimenti `Volantino X` e `volantino-x`
    diventano due fonti diverse. Null = diretto o ignoto, e resta null.
    Nessun indice: una stagione intera sta in poche migliaia di righe.
  - RLS **fail-closed** sulle tabelle nuove: nessuna policy `anon`, gli endpoint
    le raggiungono con la service key. L'admin legge solo i contatti.

### Corretto

- **`unique (event_id, email)` contava anche le prenotazioni annullate**, quindi
  una disdetta bloccava per sempre quell'email su quella serata. Sostituito da
  un indice parziale che ignora gli annullati. Bug preesistente, trovato dai
  test sui vincoli.

### Scelte non ovvie

- **Migrazione additiva**: niente viene rimosso, così il sito non si rompe tra
  questo passo e gli endpoint. La pulizia (policy anon, vecchia RPC, colonne
  denormalizzate, `contact_id` obbligatorio) è elencata in fondo al file e va
  eseguita dopo.
- `valid_until` è un **timestamp pieno**, non un orario: il limite del ridotto
  cade dopo la mezzanotte, quindi un orario secco sembrerebbe precedente
  all'apertura.
- **18+ e quota non sono in SQL.** Il primo perché `now()` non è immutabile e
  non può stare in un CHECK; la seconda perché si conta sulle confermate in fase
  di prenotazione. Entrambi finiscono negli endpoint.

### Aggiunto dopo lo stress test

- **`revoke all` su `contacts`, `activation_tokens` e `contact_sessions`** per
  `anon` e `authenticated` (difesa in profondità, come l'hardening di aprile su
  `reservations`), più `grant select on contacts to authenticated` per la guest
  list. Motivo misurato: esporre uno schema dalla dashboard Supabase imposta
  anche le **DEFAULT PRIVILEGES**, quindi le tabelle create dopo nascono
  concesse ad `anon`. RLS regge comunque, ma senza revoke sarebbe l'unico
  argine, e i tentativi di scrittura di `anon` fallivano **silenziosamente**
  come `UPDATE 0` invece di essere rifiutati. Ora rispondono
  `permission denied`. `service_role` resta intatto: è la via degli endpoint.
- **Ordine del blocco di pulizia corretto**: la riscrittura di
  `scan_ticket_check_in` era in coda, ma va **prima** del drop delle colonne.

### Verificato

- `schema.sql` + `rls.sql` + migrazione su un **Postgres 16 locale usa e getta**,
  eseguita **due volte** per l'idempotenza: nessun errore.
- **Stress test su catena completa e database con dati**: le cinque migrazioni
  di aprile, poi due prenotazioni create col flusso vecchio, poi la migrazione
  nuova tre volte di fila. Righe preesistenti intatte, `price` backfillato,
  e il flusso vecchio ancora funzionante: `create_public_reservation`,
  `get_public_entry_counts`, rifiuto degli eventi `draft` e delle entry di un
  altro evento. 57 controlli passati.
- **RLS attaccata come `anon`** con le DEFAULT PRIVILEGES di Supabase emulate:
  zero righe da contatti, sessioni e token, insert rifiutata, nessuna
  prenotazione leggibile senza token, e `update` su `status` e `source` negata
  anche a livello di privilegio di colonna (la grant di aprile è limitata a
  `ticket_opened_at`, e vale anche per le colonne nuove).
- Test di inserimento sui vincoli: email non normalizzata respinta, `pending`
  senza scadenza respinta, seconda prenotazione attiva per lo stesso contatto
  respinta, disdetta con riprenotazione ammessa, trigger `updated_at` attivo,
  zero policy `anon` sulle tabelle nuove.
- `source`: accettati `volantino-ottobre`, `pr_giulia` e null; respinti
  `Volantino X`, stringa vuota, un solo carattere e trattino finale. Provato
  anche il raggruppamento per fonte con i null etichettati.
- **Non applicata sul Supabase reale**: lo esegui tu in SQL Editor.

### Emerso, non risolto

- `scan_ticket_check_in`, **misurato, non dedotto**: su una prenotazione
  `pending` con token risponde `already_scanned` con timestamp vuoto e il nome
  giusto, cioè alla porta sembra "già entrato" uno che non ha mai confermato.
  E dopo il drop delle colonne ogni scan muore con
  `record "v_reservation" has no field "full_name"`. Va riscritta **prima**
  della pulizia.
- **`rls.sql` non è rieseguibile**: si ferma sul primo `create policy` già
  esistente. È fail-safe, ma il changelog di settembre lasciava intendere che
  riapplicarlo fosse innocuo: è innocuo perché si interrompe subito, non perché
  sia idempotente.
- **Lo step 3 della catena può abortire su un DB nuovo.** La migrazione di
  aprile dichiara `hash_ticket_token` come funzione `language sql` con `digest`
  non qualificato, e quei corpi vengono validati alla creazione: se pgcrypto sta
  in `extensions` e non è nel `search_path`, il file si ferma **prima** di creare
  le policy del token e le grant in coda, e la pagina ticket resta senza policy.
  Il prerequisito è ora annotato in testa a `rls.sql`; la correzione del file di
  aprile (qualificare `digest`, come già fa la v2) è da decidere.
- La union `status` in `packages/shared` non conosce `pending`.
- La quarta sezione del funnel assume la conferma immediata: serve la variante
  "controlla la posta".

---

## 2026-09-17 — Lanyard: il solver XPBD diventa il motore ufficiale

Dopo la prova su device, la pagina ticket usa il nuovo solver. Rapier non viene
cancellato: resta consultabile su una route dedicata.

### Cambiato

- **File rinominati per ruolo**: `Lanyard.tsx` è ora il motore ufficiale
  (ex `LanyardVerlet.tsx`); il vecchio diventa `LanyardRapier.tsx`, con un
  commento in testa che vieta di importarlo dal flusso ticket. `Ticket.tsx` non
  cambia import, quindi passa automaticamente al nuovo motore.
- **Nuova route `/lanyard-rapier`** (`pages/LanyardRapierDemo.tsx`): la card
  Rapier a schermo intero con dati mock. Il componente è lazy, quindi il WASM di
  Rapier si scarica solo lì (e su `/demo/lanyard` scegliendo Rapier).
- **Fix reset al resize**: il solver veniva ricreato quando la larghezza
  attraversava i 768 px (es. rotazione tablet) e la card ricadeva dall'alto. Ora
  è creato una volta sola e cambia solo il passo di simulazione.
- `/demo/lanyard` resta, con le etichette aggiornate (Rapier "precedente",
  Verlet "ufficiale").

### Verificato

- Build verde. Nel grafo dei chunk `vendor-rapier` è referenziato solo da
  `LanyardRapier`, `LanyardRapierDemo` e `LanyardLab`; `Ticket` e il nuovo
  `Lanyard` non lo toccano, e la home non precarica nulla del 3D.
- A runtime, con la build di produzione: aprendo il motore ufficiale il canvas
  monta e **`vendor-rapier` non viene scaricato**; aprendo `/lanyard-rapier` sì.
  Nessun errore in console sulla route Rapier.
- Non verificato a occhio da qui (tab del browser non visibile, WebGL non
  disegna): il rendering l'hai provato tu su device.

### Peso della route ticket

JavaScript gzip scaricato aprendo `/ticket/:id`, totale reale compresi i chunk
condivisi con la home: **da 1.286 kB a 446 kB (−840 kB, −65%)**. Nella voce del
2026-09-07 avevo stimato ~1.140 → ~298 kB escludendo quei chunk condivisi: i
numeri corretti sono questi.

### Ancora aperto

- Gli **script di taratura** (confronto headless con Rapier) erano in una
  cartella temporanea e sono andati persi. Se in futuro cambiano dimensioni della
  card, corda, gravità o punto di partenza, vanno riscritti per ricalibrare.
- `/lanyard-rapier` e `/demo/lanyard` sono pubbliche anche se non linkate.
- `@react-three/rapier` e `@dimforge/rapier3d-compat` restano dipendenze, perché
  servono alla route di riferimento.

---

## 2026-09-07 — Lanyard: fisica Verlet alternativa + route demo A/B

Rapier pesa 843 kB gz (WASM inlinato in base64) per simulare quattro giunti corda
e un giunto sferico. Scritto un solver dedicato per confrontarlo con l'attuale.

### Cosa c'è di nuovo

- `apps/web/src/components/Lanyard/lanyardSolver.ts` — solver XPBD/position-based:
  catena di 4 punti massa + card come corpo rigido, con tensore d'inerzia reale e
  risoluzione 3x3 del giunto sferico. **11,7 kB non minificati, 0 kB di runtime
  aggiuntivo** (usa solo la matematica di `three`, già presente).
- `apps/web/src/components/Lanyard/LanyardVerlet.tsx` — stesso identico rendering
  di `Lanyard.tsx` (stesso GLB, materiali, meshline, overlay HTML): cambia solo
  la simulazione, così l'A/B confronta la fisica e nient'altro.
- `apps/web/src/pages/LanyardLab.tsx` + route **`/demo/lanyard`** — toggle fra i
  due motori, FPS live, reset. I due motori sono lazy separati: scegliendo Verlet
  da freddo il WASM di Rapier non viene proprio scaricato.
- `docs/lanyard-physics-ab.svg` — contact sheet dei due motori a confronto.

### Come è stato tarato

Non a occhio: **entrambi i motori girano headless in Node** (Rapier gira anche
fuori dal browser) con stesso stato iniziale, stesso timestep e stesso damping,
e le traiettorie vengono confrontate. La taratura è una grid search su
compliance XPBD e cap di correzione, valutata su due scenari (caduta d'ingresso,
drag laterale + rilascio) e su entrambe le configurazioni (1/60 desktop,
1/30 mobile).

Tre cose emerse dalla misura, tutte contro-intuitive:

1. **Un solver position-based puro è troppo rigido.** Rapier lascia allungare la
   corda fino a 2,9x sotto shock, perché il suo TGS fa 4 iterazioni su una catena
   con rapporto di massa 17:1. Snappare i vincoli esatti faceva arrivare la card
   in ~1,2 s invece di ~2,7 s, senza rinculo. Risolto con compliance XPBD.
2. **L'RMS di traiettoria da solo è una metrica cieca.** La configurazione con lo
   scarto minore staccava visibilmente la card dalla cordicella durante
   l'ingresso (0,71 di separazione su desktop, 2,12 su mobile, contro lo 0,14
   peggiore di Rapier). L'errore di giunto è diventato un vincolo rigido.
3. **Serve un cap di correzione separato per corda e giunto.** Con un cap unico i
   due requisiti sono in conflitto. Separandoli, *tutte* le configurazioni
   rientrano nel vincolo e l'errore scende ancora.

Provato e **scartato** un cap sulla correzione angolare: il contact sheet
suggeriva che la card ruotasse troppo durante l'ingresso, ma misurando la
percentuale di tempo passata di taglio Rapier sta al 56,7% e il nuovo solver al
61,1% — non ruota di più, ruota *fuori fase* (l'ingresso è caotico in entrambi).
Il cap avrebbe portato al 22%, cioè più lontano dal riferimento.

### Risultati misurati (contro Rapier reale, 9 s per scenario)

| | desktop (1/60) | mobile (1/30) |
|---|---|---|
| RMS traiettoria complessivo | 0,407 | 0,186 |
| RMS dopo il rilascio del drag | **0,067** | 0,120 |
| RMS a riposo | 0,022 | 0,081 |
| Tempo di assestamento | 2,72 s *(Rapier 2,77 s)* | 2,23 s *(2,40 s)* |
| Errore max giunto sferico | **0,0010** *(Rapier 0,1433)* | 0,0063 *(0,1388)* |
| Allungamento max corda | 2,733 *(Rapier 2,882)* | 3,281 *(2,871)* |
| Jitter a riposo per frame | 1,07e-3 *(1,23e-3)* | 2,11e-3 *(2,35e-3)* |
| CPU per frame | **0,024 ms** *(Rapier 0,035 ms)* | 0,009 ms *(0,013 ms)* |

Partenza senza taratura: RMS 4,57. Dopo il fit: 0,41. Nessun NaN in nessuno
scenario. Il riposo geometricamente esatto è −0,539 (ancora 3 corde da 1 sotto
l'ancoraggio, meno 1,45 di clip); Rapier si ferma a −0,561 per compliance
residua, quindi i 2 cm di scarto sono Rapier che sbaglia, non il nuovo solver.

### Se adottato

La route ticket passerebbe da ~1.140 kB gz a ~298 kB gz (**−74%**): resta solo
`vendor-three`. A quel punto `@react-three/rapier` e `@dimforge/rapier3d-compat`
si disinstallano e `Lanyard.tsx` si sostituisce con `LanyardVerlet.tsx`.

**Nulla di tutto questo tocca la pagina ticket attuale**: `Ticket.tsx` continua a
importare `Lanyard.tsx` (Rapier). Il nuovo motore vive solo sotto `/demo/lanyard`.

### Da decidere

- La route `/demo/lanyard` è pubblica anche se non linkata. Da rimuovere o
  proteggere prima della produzione, se non serve più.
- Il confronto vero va fatto al tatto su un device reale: il drag è la parte che
  i numeri catturano meno.

---

## 2026-09-07 — Code splitting `apps/web` + hardening `rls.sql`

Sessione di ispezione repo/documenti, seguita da due interventi.

### Security

- **`supabase/rls.sql` reso fail-closed su `reservations`.** Il file conteneva
  ancora le policy permissive `anon_read_own_reservation` e
  `anon_update_ticket_opened`, entrambe `using (true)`: anon poteva leggere
  *tutte* le prenotazioni e scrivere *qualsiasi* colonna, incluso `status` e
  `qr_scanned_at`. Erano gia' droppate da
  `rls-history/2026-04-17-ultra-strict-ticket-token.sql`, ma il file canonico non
  lo rifletteva — riapplicarlo su un DB nuovo (o riapplicarlo per errore su
  quello esistente) riapriva il buco.
  Ora `rls.sql` non crea alcuna policy anon di select/update su `reservations`:
  l'accesso al ticket arriva solo dalle policy token-scoped dello step 3.
- **Aggiunto in testa a `rls.sql` l'ordine di esecuzione completo** (schema →
  rls → 3 migrazioni in `rls-history/`), con nota esplicita che fermarsi allo
  step 2 rompe la pagina ticket ma non espone dati.
- Nessuna modifica al DB in produzione: solo ai file SQL versionati.

### Performance — `apps/web`

Applicati gli interventi 1, 2 e 4 della roadmap in
[`cursor_react_performance_and_bundle_siz.md`](./cursor_react_performance_and_bundle_siz.md).

- **`src/main.tsx`**: `Info`, `PrivacyCookie` e `Ticket` passano a `React.lazy` +
  `Suspense`. Prima `Ticket` era importato staticamente e trascinava tutto lo
  stack `three` / `@react-three/*` / `rapier` / `meshline` nel bundle servito su
  `/`. Fallback dedicato per la route ticket (stessa schermata `Loading ticket…`
  gia' esistente), fallback neutro nero per le pagine statiche.
- **`src/pages/Ticket.tsx`**: `Lanyard` caricato con `React.lazy`; la scena 3D
  parte solo dopo che la prenotazione e' stata risolta. Chi apre un link ticket
  scaduto/invalido non scarica piu' nulla del 3D.
- **`vite.config.ts`**: aggiunto `build.rollupOptions.output.manualChunks` con
  vendor chunk stabili (`vendor-react`, `vendor-router`, `vendor-supabase`,
  `vendor-three`, `vendor-rapier`), utili anche per la cache tra deploy.
  Due accorgimenti non ovvi, entrambi commentati nel file:
  - React va pinnato in un chunk suo, altrimenti Rollup lo assorbe in
    `vendor-three` (condiviso con `@react-three/fiber`) e `/` finisce per fare
    `modulepreload` dell'intero stack 3D solo per avviarsi;
  - stesso problema con l'helper `vite/preload-helper`, condiviso tra entry e
    chunk lazy: pinnato anch'esso su `vendor-react`.

#### Risultato misurato (`pnpm --filter web build`)

| | JS su `/` | gzip |
|---|---|---|
| Prima | 1 bundle da 3.840,79 kB | **1.292,54 kB** |
| Dopo | entry + 3 vendor chunk | **147,76 kB** |

Circa **−1.145 kB gzip (−88%)** sulla landing. `vendor-three` (283,65 kB gz) e
`vendor-rapier` (843,47 kB gz) sono ora raggiungibili solo da `/ticket/:id`, e
`index.html` non li mette piu' in `modulepreload`.

#### Verifica

- `pnpm --filter web build` verde.
- Smoke test runtime su `vite preview`: `/` (overlay data notice → Hero),
  `/info` (route lazy) e `/ticket/:id` con token assente (schermata "Invalid or
  expired ticket link") renderizzano correttamente, zero errori in console.

### Note / non toccato in questa sessione

Emerso dall'ispezione, lasciato intenzionalmente fuori scope:

- `apps/admin/src/pages/CheckIn.tsx` espone ancora il pannello **"Debug logs"**
  con Copy/Clear, e c'e' una modifica non committata su `QrCameraScanner.tsx`
  che riattiva `highlightScanRegion` / `highlightCodeOutline`. Residui del debug
  scanner su Safari iOS: da decidere se tenerli o rimuoverli prima della prod.
- Esiste un **repo git annidato** in `apps/admin/.git/`. La root traccia
  comunque i file dell'admin, ma confonde tooling e CLI.
- `apps/{web,admin}/tsconfig.tsbuildinfo` sono **tracciati** in git;
  `.tmp-qr-venv/` (165 MB) non e' in `.gitignore`.
- `apps/web` contiene ~880 LOC di componenti mai importati (`About`, `Archive`,
  `Guests`, `PerfMeter`, `TextureOverlay`, `HalftoneOverlay`) e asset orfani
  (`public/ticket/Card.glb` 2,3 MB, `public/ticket/lanyard.png`), piu' i GIF hero
  da 2,2 MB e 1,4 MB. Tree-shaking li esclude dal bundle, ma restano costo di
  manutenzione e di banda sugli asset statici.
- `vendor-rapier` pesa 843 kB gz perche' il WASM e' inlinato in base64: e' il
  prossimo collo di bottiglia reale della route ticket.
- `import * as THREE` in `Lanyard.tsx` non e' stato convertito a named import:
  ora che il file vive in un chunk lazy il guadagno marginale e' basso.
