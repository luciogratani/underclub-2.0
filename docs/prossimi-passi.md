# Prossimi passi — Underclub 2.0

Panoramica del lavoro da fare, divisa per **admin**, **sito pubblico (web)** e **backend / database**.  
Contesto: lo schema SQL in `supabase/schema.sql` e il package `@underclub/shared` (tipi + client Supabase tipizzato + mapper) sono definiti; l'admin ha home + routing + pagine placeholder; il web è collegato a Supabase con fallback ai mock.

---

## 1. Admin (`apps/admin`)

### Fondamenta
- [x] **Client Supabase**: `apps/admin/src/lib/supabase.ts` espone un singleton typed, null-safe quando mancano le env vars.
- [x] **Auth**: login admin con **email + password** (decisione 2026-04-22), route protette, logout. Vedi sezione 5.

### Eventi
- [ ] **Lista eventi**: tabella o card mobile-first; filtri per stato (`draft` / `published` / `archived`); ordinamento per data.
- [ ] **Creazione / modifica evento**: form per titolo, data, ora, stato; gestione **lineup** (`event_artists`: nome, origine opzionale, ordine); gestione **entry** (`event_entries`: nome, nota, quota, ordine).
- [ ] **Eliminazione** (con conferma) e validazione quote vs prenotazioni esistenti.

### Prenotazioni
- [ ] **Lista prenotazioni per evento**: join con `event_entries`; mostrare nome, email, tier, stato, `ticket_opened_at`, `qr_scanned_at`.
- [ ] **Azioni admin**: annullare prenotazione, aggiungere manualmente, eventuale modifica stato (allineato a `reservations.status`).
- [ ] **Guest list**: vista A–Z / ricerca sullo stesso dataset delle prenotazioni.

### Check-in e analytics
- [x] **Check-in / QR**: RPC `scan_ticket_check_in` + pagina `/check-in` con scanner camera live (`qr-scanner`) e input manuale. Vedi sezioni 4 e 6.
- [ ] **Analytics**: pagina con metriche reali (prenotazioni per evento, aperture ticket, scan, trend nel tempo) — dipende da query e eventualmente viste/materializzate in DB.

### Qualità
- [ ] Allineare componenti shadcn dove serve (tabelle, form, dialog) invece di solo markup custom.

---

## 2. Sito pubblico (`apps/web`)

### Dati e Supabase
- [x] **Sostituire i mock** (Next Date, Book Now) con lettura da Supabase: evento "prossimo" pubblicato, lineup, entry disponibili. *(fallback automatico a mock quando Supabase non è configurato)*
- [x] **Form prenotazione**: invio insert su `reservations` con `event_id`, `entry_id`, `full_name`, `date_of_birth`, `email`; gestione errore server via ErrorToast.
- [x] **Scelta entry tier** nel Book Now: entry dinamiche con availability (SOLD OUT / N LEFT), selezione tap con highlight, fallback a mock.

### Ticket
- [x] **Route `/ticket/:id`**: carica la prenotazione per UUID; passa `TicketViewData` a `Lanyard` al posto del mock.
- [x] **Tracking apertura**: alla prima visita aggiorna `ticket_opened_at` se ancora null.
- [x] **Email con link**: gli endpoint serverless mandano il link del ticket a ogni conferma (sezione 9). Attivi solo col flag `VITE_BOOKING_API`.

### Coerenza UX
- [x] Allineamento copy e campi al modello DB (date ISO, orari, nomi tier) tramite mapper centralizzati.
- [x] Gestione errori rete / vincoli DB (toast esistente).

---

## 3. Backend / database / wiring

### Supabase (progetto)
- [x] **Schema SQL**: `supabase/schema.sql` definisce tutte le tabelle nello schema `underclub`.
- [x] **Row Level Security (RLS)**: `supabase/rls.sql` pronto con policy:
  - **Pubblico (anon)**: lettura eventi `published` + artisti/entry collegati; insert `reservations`. **Nessun** accesso in lettura/scrittura alle prenotazioni: lettura ticket e `ticket_opened_at` arrivano solo dalle policy token-scoped dello step 3 (vedi sezione 7).
  - **Admin (authenticated)**: CRUD completo su tutte le tabelle.
- [x] **Applicare lo schema + RLS**: eseguiti `schema.sql` e `rls.sql` in Supabase SQL Editor.
  ⚠️ Su un DB nuovo servono **tutti e 5 gli step** nell'ordine indicato in testa a `rls.sql`: fermarsi a `rls.sql` lascia la pagina ticket non funzionante (ma mai i dati esposti).
- [ ] **Trigger / funzioni** (opzionale): aggiornamento `updated_at`, vincoli extra su quote.
  *(2026-10-01: `underclub.touch_updated_at()` esiste e tiene aggiornato
  `contacts.updated_at`; le altre tabelle non hanno la colonna. La quota resta
  applicata in fase di prenotazione, non in DB — sezione 8.)*

### Shared e monorepo
- [x] **`@underclub/shared`**: tipi derivati dal DB (single source of truth), mapper snake_case→camelCase, client Supabase tipizzato.
- [x] **Web**: dipendenza `@underclub/shared` aggiunta, client Supabase + API functions in `apps/web/src/lib/`.
- [x] **Type audit**: completato — tutti i blockers risolti (status union, tipi derivati, mapper, tipi duplicati eliminati).

### Infrastruttura
- [x] **Variabili ambiente locali**: creati `apps/web/.env` e `apps/admin/.env` con `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
- [ ] **Variabili ambiente su Vercel** + **Redirect URLs** in Supabase Auth per entrambi i domini.
- [x] **Serverless**: endpoint in `apps/web/api/` (sezione 9). *Restano da configurare su Vercel i segreti e il dominio Resend.*

---

## 4. Task critica — QR ticket per-user + check-in autorizzato (in corso)

### Obiettivo
- Implementare una prima versione robusta del flusso QR ticket per-user + check-in autorizzato staff, evitando dettagli hardcoded non necessari.

### Risultato atteso
- [x] Ogni ticket ha un QR dinamico per prenotazione (non statico/hardcoded).
- [x] Il check-in QR e' consentito solo a utenti autorizzati (admin/staff), non a utenti pubblici.
- [ ] Lo stato `qrScanned` riflette correttamente `qr_scanned_at` nel flusso admin *(RPC pronta, UI admin scan riflette lo stato; la lista/analytics admin leggeranno automaticamente `qr_scanned_at` appena collegate)*.

### Vincoli
- Non introdurre dipendenze pesanti se non strettamente necessario.
- Mantenere l'architettura coerente con il repo (`Supabase` + `packages/shared`).
- Dove ci sono scelte tecniche non critiche, scegliere la soluzione migliore e procedere.
- Fermarsi e chiedere conferma prima di implementare decisioni di prodotto/policy (regole evento, UX errori, copy, limiti operativi, ruoli staff).

### Decisioni tecniche prese (2026-04-21)
- **Payload QR = token only**. Nessun URL, nessun UUID. Il QR contiene la stessa stringa che gia' oggi è usata come `ticketToken` nel link email (`?t=...`). Vantaggi: QR piu' piccolo (versione 2-3 vs 7-8), scan affidabile anche a distanza; nessun leak di UUID; logica lato admin piu' semplice.
- **Verifica server-side**: nuova RPC `underclub.scan_ticket_check_in(p_token text)` (`security definer`, `search_path = underclub, public, extensions`). Hash del token via `underclub.hash_ticket_token` (gia' esistente), lookup per `ticket_access_token_hash`, UPDATE atomica `set qr_scanned_at = now() where qr_scanned_at is null and status = 'confirmed'` per gestire race condition in modo sicuro.
- **Esiti strutturati**: `'ok' | 'already_scanned' | 'cancelled' | 'invalid'` (+ `'unauthorized'` gestito lato client quando la GRANT nega l'esecuzione).
- **Autorizzazione**: `revoke from public, anon; grant execute to authenticated`. Solo admin loggati potranno eseguire l'RPC (auth admin: milestone successiva).
- **Dipendenza runtime**: aggiunto `qrcode` (+ `@types/qrcode`) su `apps/web`. Zero dipendenze extra lato admin.

### File toccati
- `supabase/rls-history/2026-04-21-ticket-check-in.sql` — RPC + grants.
- `packages/shared/src/types.ts` — `ADMIN_SCAN_RESULT`, `AdminScanResultCode`, `AdminScanResult`.
- `packages/shared/src/database.ts` — firma RPC `scan_ticket_check_in`.
- `packages/shared/src/mappers.ts` — `toAdminScanResult`.
- `packages/shared/src/index.ts` — export costanti/tipi/mapper.
- `apps/web/src/components/Lanyard/Lanyard.tsx` — QR dinamico da `qrToken` (SVG trasparente, primary color).
- `apps/web/src/pages/Ticket.tsx` — passa `qrToken={ticketToken}` al `Lanyard`.
- `apps/admin/src/lib/supabase.ts` — client Supabase admin (anon, null-safe).
- `apps/admin/src/lib/api.ts` — `scanTicketCheckIn(token)` con mapping errori.
- `apps/admin/src/pages/CheckIn.tsx` — pagina `/check-in` con form token + `ResultCard` colorata per esito.
- `apps/admin/src/App.tsx` — route `/check-in` ora puntata a `CheckIn`.

### Come applicare lato Supabase
- Eseguire in SQL Editor (dopo `schema.sql`, `rls.sql`, e gli step 2026-04-17 v1+v2): `supabase/rls-history/2026-04-21-ticket-check-in.sql`.
- Verificare: `select has_function_privilege('authenticated', 'underclub.scan_ticket_check_in(text)', 'execute')` → true; `...'anon'...` → false.

### Test manuale end-to-end
1. Aprire un ticket valido sul web (`/ticket/:id?t=<token>`). Il QR mostrato nel card 3D deve contenere esattamente `<token>` (verificabile con qualsiasi lettore QR).
2. Nell'admin visitare `/check-in` e incollare lo stesso `<token>`.
   - Prima scansione → `Check-in OK` con nome, entry, evento.
   - Seconda scansione → `Already scanned` con il timestamp della prima.
   - Prenotazione cancellata → `Reservation cancelled`.
   - Token farlocco / vuoto → `Invalid token`.
   - Senza auth admin (al momento) → `Not authorized (admin login required)`.

### Domande aperte / prossimi step
- [x] **Auth admin**: implementata con email+password (sezione 5). La RPC `scan_ticket_check_in` ora esegue correttamente per qualsiasi utente loggato (`authenticated`).
- [x] *(fatto il 2026-04-22, sezione 6)* **Camera scanner**: wiring `BarcodeDetector` nel `/check-in` per scansione live, con fallback a input manuale.
- [ ] **Visibilita' qr_scanned_at** nelle liste admin (Reservations, Guest list, Analytics) → gia' presente nel mapper `toAdminReservationView`, manca solo il wiring UI quando quelle pagine verranno implementate.
- [ ] **Vincolo evento/data**: al momento non applicato. Valutare se limitare i check-in a `events.date = current_date` o evento "attivo".
- [ ] **Logging operativo**: chi ha scannerizzato e quando. Non in questa fase (admin unico).
- [ ] **Copy UX finale** (IT/EN) per gli stati di scan.

---

## 5. Auth admin (implementata 2026-04-22)

### Decisioni prese
- **Metodo**: email + password (Supabase Auth provider `email`). Nessun magic link, nessun OAuth.
- **Registrazione**: **disabilitata lato UI**. Gli admin vengono creati manualmente in Supabase (Auth → Users). Consigliato disattivare anche "Enable email signups" nel pannello Supabase per chiudere del tutto la porta di registrazione pubblica.
- **Autorizzazione**: per ora **basta essere `authenticated`**. Nessuna tabella `admin_users` / allowlist. Ok finché gli admin sono pochi e controllati manualmente in Supabase. Se in futuro serviranno ruoli più granulari (staff vs owner) o allowlist, la RPC `scan_ticket_check_in` è già il punto naturale dove aggiungere il controllo.
- **Persistenza sessione**: default Supabase (`localStorage`), refresh automatico del token.
- **Nessuna dep aggiuntiva**: tutto passa dal client già esposto da `@underclub/shared`.

### File introdotti / modificati
- `apps/admin/src/lib/auth.tsx` — `AuthProvider`, `useAuth`, `SessionUser`. Espone `user`, `loading`, `configMissing`, `signIn`, `signOut`.
- `apps/admin/src/components/ProtectedRoute.tsx` — gate rotte: loader durante resolve sessione, messaggio se env mancano, redirect a `/login` con `state.from` altrimenti.
- `apps/admin/src/pages/Login.tsx` — form email+password. Redirect a `state.from` dopo login. Messaggio chiaro se Supabase non configurato.
- `apps/admin/src/App.tsx` — tutte le rotte tranne `/login` protette da `ProtectedRoute`, root wrappato in `AuthProvider`.
- `apps/admin/src/pages/Home.tsx` — header con email utente + pulsante Logout.

### Setup lato Supabase
1. Dashboard → Authentication → Providers → **Email**: attivo. Consigliato disattivare "Enable email signups" per impedire registrazioni pubbliche.
2. Dashboard → Authentication → Users → **Invite user** (o Add user con password): crea ogni admin a mano.
3. `apps/admin/.env` deve contenere `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (già presenti).
4. Nessuna migrazione SQL richiesta: la GRANT sulla RPC è già su `authenticated`.

### Test manuale end-to-end
1. Aprire `/` dell'admin → redirect a `/login`.
2. Login con credenziali errate → errore rosso, nessun redirect.
3. Login con credenziali valide → redirect alla pagina richiesta (default `/`), header mostra l'email.
4. Visitare `/check-in`, scansione token → ora risponde `ok` invece di `unauthorized`.
5. Click **Logout** dalla Home → redirect a `/login` e sessione pulita.
6. Reload pagina autenticato → sessione ripristinata senza re-login.

### Cosa resta aperto
- **Allowlist admin**: non implementata per scelta esplicita. Quando servirà, il pattern è: tabella `underclub.admin_users (user_id uuid primary key references auth.users)` + controllo `exists(select 1 from underclub.admin_users where user_id = auth.uid())` come prima riga della RPC `scan_ticket_check_in`.
  *(2026-10-01: resta un "quando servirà". Gli utenti del sito non entrano in
  `auth.users`, perché il passwordless pubblico è proprietario — sezione 8 —
  quindi `authenticated` continua a significare solo "admin".)*
- **Password reset / cambio password**: non in UI. Per ora si gestisce da dashboard Supabase.
- **Rate limit login** lato UI: affidato ai default Supabase; valutare throttle custom se emergono attacchi brute-force.

---

## 6. Camera scanner live su `/check-in` (implementato 2026-04-22)

### Decisioni prese
- **Engine unico: `qr-scanner` (Nimiq)**. Sotto il cofano usa `BarcodeDetector` nativo quando disponibile (Chrome/Android/Edge) e fallback a un worker WASM su Safari iOS e altri browser privi di `BarcodeDetector`. Caricato via **dynamic import**: libreria + worker finiscono in chunk separati (~5.6 kB + ~10.4 kB gzip) e vengono scaricati solo al primo ingresso in modalità Camera.
- **Perché `qr-scanner` e non ZXing**: ZXing (anche con `TRY_HARDER` e risoluzione alta) sui nostri QR non decodificava in modo affidabile su iPhone (Safari). `qr-scanner` ha una pipeline di image processing più aggressiva (gestione inversione colori, grayscale ottimizzato, `scanRegion` centrata) e testata proprio sui token ticket.
- **Dipendenze (solo `apps/admin`)**: `qr-scanner`. Rimosse `@zxing/browser` e `@zxing/library`.
- **UX**:
  - Toggle **Camera / Manual** in alto (`Camera` di default se l'utente sceglie camera). Il paste manuale resta sempre disponibile come fallback lato utente.
  - Viewfinder con bordo colore primary e etichetta di stato (`Avvio camera…`, `Scanning…`, `Errore camera`).
  - `facingMode: environment` (camera posteriore) quando disponibile.
  - **Anti-dup a 2 livelli**: cooldown sullo scanner (stesso token entro 2 s → ignorato) + lock a livello pagina durante l'elaborazione RPC (altri 1.5 s dopo la risposta).
  - **Feedback tattile**: `navigator.vibrate(120)` su `ok`, pattern `[60,60,60]` sugli altri esiti (se il device lo supporta).
  - Stop totale della camera (track `MediaStream` fermati) quando si esce dalla modalità o si smonta il componente.
- **Nessuna dipendenza dal server**: la verifica resta sempre via RPC `scan_ticket_check_in` (stesso identico percorso del flusso manuale).

### File introdotti / modificati
- `apps/admin/src/components/QrCameraScanner.tsx` — componente riusabile basato su `qr-scanner` (engine unico, cleanup stream/worker, viewfinder, debug logger opzionale).
- `apps/admin/src/pages/CheckIn.tsx` — toggle Camera/Manual, lock processing, feedback vibrazione, pannello debug logs, riuso di `ResultCard`.

### Setup / requisiti
- **HTTPS obbligatorio** in produzione: `getUserMedia` è bloccato su `http://` non-localhost. Fai servire l'admin sotto HTTPS (ok in locale via `localhost`).
- Nessuna migrazione SQL richiesta.
- Build: i chunk `qr-scanner` e `qr-scanner-worker` vengono code-splittati automaticamente da Vite; nessuna azione manuale.

### Test manuale end-to-end
1. Aprire `/check-in`, cliccare **Camera**. Il browser chiede il permesso camera → concedere.
2. Inquadrare il QR del ticket web → risultato in ~1 s, viene mostrata la `ResultCard` e parte il feedback tattile.
3. Riprovare sullo stesso QR entro 2 s → ignorato (nessuna seconda richiesta RPC).
4. Riprovare dopo 2 s → risponde `already_scanned` come atteso.
5. Toggle a **Manual** → camera si spegne (LED fotocamera si spegne / track rilasciati).
6. Safari iOS: il primo uso scarica i chunk `qr-scanner` + worker WASM (visibili in Network), poi il flusso è identico.

### Cosa resta aperto
- **Scelta camera**: attualmente si lascia al browser (`facingMode: environment` hint). Possibile evoluzione: dropdown "Camera X" con `enumerateDevices()` se in futuro ci saranno multiple camere rilevanti.
- **Suono** (beep) su esito: non aggiunto per non caricare asset audio; il feedback tattile basta in ambiente rumoroso?
- **Offline / rete instabile**: la verifica richiede rete. Se necessario, valutare una coda locale (IndexedDB) che tenta la RPC in background e segnala "pending".

---

## 7. Performance web, hardening RLS e fisica lanyard (2026-09-07 / 09-17)

Dettaglio completo con numeri in [`CHANGELOG.md`](./CHANGELOG.md).

### Fatto

- [x] **Code splitting `apps/web`**: `Info`, `PrivacyCookie` e `Ticket` passano a
  `React.lazy`; `Lanyard` è lazy dentro `Ticket`; `manualChunks` in
  `vite.config.ts` con vendor chunk stabili. La landing scende da **1.292 kB gz a
  148 kB gz (−88%)**: lo stack 3D è ora raggiungibile solo da `/ticket/:id`.
  Due trappole di Rollup documentate nel config (React e l'helper
  `vite/preload-helper` vanno pinnati, altrimenti finiscono in `vendor-three` e
  la landing fa `modulepreload` dell'intero stack 3D).
- [x] **`supabase/rls.sql` reso fail-closed** su `reservations`: rimosse le due
  policy anon permissive (`using (true)`) ormai superate dalle migrazioni in
  `rls-history/`, e aggiunto in testa l'ordine di esecuzione dei 5 step.
  Riapplicare `rls.sql` su un DB nuovo non riapre più il buco.

### Lanyard

- [x] **Fisica lanyard: Rapier sostituito** (decisione 2026-09-17, dopo prova su
  device). La pagina ticket usa il solver XPBD
  (`components/Lanyard/Lanyard.tsx` + `lanyardSolver.ts`): route ticket da
  1.286 a 446 kB gz (−65%). Il vecchio motore è in `LanyardRapier.tsx`,
  consultabile su `/lanyard-rapier`, dove soltanto viene scaricato il WASM.
  Sistemato anche il reset della card al resize oltre i 768 px.
- [ ] **Script di taratura persi**: il confronto headless con Rapier va
  riscritto (e stavolta messo nel repo) prima di cambiare dimensioni della card,
  corda, gravità o punto di partenza.
- [ ] Le route `/lanyard-rapier` e `/demo/lanyard` sono pubbliche anche se non
  linkate: rimuoverle o proteggerle prima della produzione, se non servono.

### Debito segnalato, non affrontato

- [ ] Pannello **"Debug logs"** ancora attivo in `apps/admin/src/pages/CheckIn.tsx`
  (+ `highlightScanRegion` / `highlightCodeOutline` in `QrCameraScanner.tsx`):
  residui del debug scanner su Safari iOS, da tenere o rimuovere.
- [ ] **Repo git annidato** in `apps/admin/.git/` (la root traccia comunque i file).
- [ ] `apps/{web,admin}/tsconfig.tsbuildinfo` **tracciati** in git;
  `.tmp-qr-venv/` (165 MB) non in `.gitignore`.
- [ ] ~880 LOC di componenti mai importati in `apps/web` (`About`, `Archive`,
  `Guests`, `PerfMeter`, `TextureOverlay`, `HalftoneOverlay`) e asset orfani
  (`public/ticket/Card.glb` 2,3 MB, `lanyard.png`); GIF hero da 2,2 MB e 1,4 MB
  da convertire in `<video>`.

---

## 8. Registrazione, sessioni e formule d'ingresso (decisioni 2026-10-01)

Le decisioni di marketing e di flusso vivono fuori dal repo, in
`underclub_gestione/26_winter/marketing-analysis/` (`scheda-underclub.md` e
`flussi-prenotazione.md`). Qui resta solo ciò che tocca il codice.

### Decisioni prese
- **Niente account con password.** Accesso passwordless: link di attivazione
  monouso via email, poi sessione lunga. Registrazione obbligatoria per
  prenotare, con consensi GDPR.
- **Sistema passwordless proprietario, non Supabase Auth.** Il progetto Supabase
  è multi-tenant e ospita altri servizi: il pool `authenticated` è la porta
  dell'admin e non va aperto agli utenti del sito. Conseguenza: l'allowlist
  admin **non** serve più come prerequisito.
- **Sessione in cookie `httpOnly`, 12 mesi, rinnovata a ogni uso.** Login,
  attivazione, prenotazione e disdetta passano da **funzioni serverless su
  Vercel** con la service key. Una sessione annuale in `localStorage` sarebbe
  leggibile da qualunque XSS. La parte pubblica (eventi, disponibilità) e la
  pagina ticket col token nell'URL restano dirette verso Supabase.
- **Dati raccolti**: nome completo in **un solo campo** (come già fa il form),
  data di nascita, email. **Nessun numero di telefono.** Due consensi separati,
  marketing e profilazione, ciascuno con data di concessione e di revoca.
- **Formule d'ingresso configurabili per evento**: `event_entries` guadagna
  prezzo e scadenza. Nome, offerta (`note`, già mostrato in BookNow) e quota
  esistevano già; quota nulla significa illimitata. Nel 2026/27 saranno di norma
  due, ridotto e intero, entrambe prenotabili online, ma il numero è libero.
- **La scadenza è un limite d'ingresso, non di prenotazione.** Si prenota sempre;
  passata l'ora, la formula non vale più alla porta. Salvata come timestamp
  pieno, non come orario: il limite cade **dopo la mezzanotte**, quindi un orario
  secco risulterebbe precedente all'apertura.
- **Prenotazione `pending` senza sessione**, valida 30 minuti, confermata
  dall'apertura del link. Il link conferma **solo** la prenotazione da cui è
  partito, così un link vecchio non ne risuscita una dimenticata.
- **La quota conta solo le confermate**: le `pending` non tengono il posto.
  Overbooking minimo accettato in cambio di un conteggio banale.
  `get_public_entry_counts` filtra già `status = 'confirmed'`: nessuna modifica.
- **Un ticket per persona per serata**, e una disdetta libera il posto.
- **`reservations.source`**: da dove arriva la prenotazione (volantino, manifesto,
  campagna Meta, promoter, sponsor), in vista della sezione analytics dell'admin.
  È uno **slug normalizzato**, non testo libero, perché `Volantino X` e
  `volantino-x` spaccherebbero in due la stessa fonte nei raggruppamenti.
  Convenzione: minuscole, cifre, trattino o underscore, 2-64 caratteri —
  `meta-ads`, `volantino-ottobre`, `manifesto-corso-vico`, `pr-giulia`.
  **Null significa diretto o ignoto**, e va lasciato null: scriverci `direct`
  farebbe sembrare uguali "non lo sappiamo" e "ha digitato l'indirizzo".
- **Rimandati** per scelta: anonimizzazione GDPR, incassi e ingressi senza
  prenotazione, limite ai tentativi per indirizzo e dispositivo.

### Schema — fatto
- [x] `supabase/rls-history/2026-10-01-contacts-sessions-formulas.sql`:
  `contacts`, `activation_tokens`, `contact_sessions`; `price` e `valid_until`
  su `event_entries`; `contact_id`, stato `pending`, `confirmed_at`,
  `cancelled_at` e `source` su `reservations`. RLS fail-closed sulle tabelle nuove (zero
  policy `anon`), admin in sola lettura sui contatti.
  **Migrazione additiva**: il percorso anon attuale continua a funzionare, la
  pulizia è elencata in fondo al file e va eseguita solo a endpoint vivi.
- [x] **Difesa in profondità**: `revoke all` sulle tre tabelle nuove per `anon` e
  `authenticated`, più `grant select on contacts to authenticated` per la guest
  list. Serve perché esporre uno schema dalla dashboard Supabase imposta anche
  le DEFAULT PRIVILEGES, quindi le tabelle create dopo nascono concesse ad
  `anon`: RLS reggeva comunque, ma era l'unico argine e le scritture fallivano
  in silenzio come `UPDATE 0` invece di `permission denied`.
- [x] Verificata su un Postgres 16 usa e getta: catena completa delle migrazioni
  di aprile, due prenotazioni create col flusso vecchio, poi la migrazione nuova
  tre volte di fila. 57 controlli, inclusa RLS attaccata come `anon`.
  **Non ancora applicata sul Supabase reale.**

### Trappole trovate nello stress test (preesistenti, non introdotte adesso)
- [x] *(risolto 2026-10-01: `digest` e `gen_random_bytes` qualificati con `extensions`)* **Lo step 3 della catena può abortire su un DB nuovo.** La migrazione di
  aprile dichiara `hash_ticket_token` come funzione `language sql` con `digest`
  non qualificato, e quei corpi vengono validati alla creazione: se pgcrypto sta
  in `extensions` e non è nel `search_path`, il file si ferma **prima** di creare
  le policy del token e le grant finali, e la pagina ticket resta senza policy.
  Con `search_path = underclub, public, extensions` passa tutto. Da decidere se
  qualificare `digest` nel file di aprile, come già fa la v2.
- [x] *(risolto 2026-10-01: `drop policy if exists` prima di ogni policy)* **`rls.sql` non è rieseguibile**: si ferma sul primo `create policy` già
  esistente. È fail-safe, ma non è idempotente come il changelog di settembre
  lasciava intendere.
- [ ] **Data di nascita nel futuro accettata**: nessun vincolo la blocca e
  `now()` non può stare in un CHECK. Resta compito dell'endpoint, insieme al 18+.
- [x] Corretto un bug preesistente: `unique (event_id, email)` includeva anche
  le prenotazioni annullate, quindi una disdetta bloccava per sempre quella
  email su quella serata. Sostituito da un indice parziale.

### Tre cose che il nuovo modello rompe
- [x] *(2026-10-01: esito `pending`, e il token del ticket nasce solo alla conferma)* **`scan_ticket_check_in` fraintende una `pending`**: gestisce `cancelled`,
  poi aggiorna solo se `status = 'confirmed'`, e una `pending` col token
  uscirebbe come `already_scanned` con timestamp vuoto. Soluzione scelta:
  **emettere il token del ticket solo alla conferma**, così una `pending` non ha
  QR.
- [x] *(2026-10-01: nome da `contacts` con fallback che regge il drop, più `formula_expired`)* **La stessa RPC legge `full_name` dalla prenotazione**, colonna che la
  pulizia elimina: va riscritta con il join su `contacts`, oltre ad aggiungere
  l'esito "formula scaduta" per la cassa.
- [x] *(2026-10-01)* **La union `status` nei tipi condivisi non conosce `pending`**:
  `packages/shared/src/database.ts` (quattro punti, incluso il ritorno di
  `create_public_reservation`) e le costanti in `types.ts`.

### Conseguenze sul funnel pubblico
- [x] *(2026-10-01, dietro flag)* La quarta sezione assume la conferma immediata ("YOU'RE IN"). Chi prenota
  **senza sessione non è dentro**: serve la variante "controlla la posta", e
  `goToSummary` in `App.tsx` cambia di conseguenza.
- [x] *(2026-10-01, bozza dietro flag: da rivedere)* Pagina privacy e overlay del data notice vanno riscritti con i due
  consensi nuovi.
- [x] *(2026-10-01: `?src=` o `utm_source`, normalizzato a slug, tenuto per la visita)* **Cattura della fonte**: `source` resta vuoto finché non c'è chi lo
  scrive. Serve leggere `?src=...` (o gli `utm_*`) all'atterraggio, tenerlo per
  la visita e passarlo all'endpoint di prenotazione. Se la stagione parte prima
  degli endpoint, le prime serate non avranno dati di provenienza: in quel caso
  meglio aggiungere il parametro alla RPC attuale come tappabuchi.
- [ ] *(2026-10-01: si è allargato — consensi, blocco "booking as", prezzi — ma lo split non è stato fatto)* `BookNow` si allarga (consensi, stati della prenotazione): è l'occasione
  per lo split già pianificato al punto 14 della roadmap performance, invece di
  rifarlo due volte.
- [x] *(2026-10-01, dietro flag: sezione 9)* Il **menu** rimasto in sospeso dal 18 settembre va fatto **dopo**
  l'autenticazione: con gli account nascono voci che prima non esistevano (la
  mia prenotazione, uscita dall'account). Il bottone info è già stato rimosso
  dalla Hero, quindi al momento `/info` non è raggiungibile dalla home.

### Decisioni ancora aperte
- `About`, `Archive` e `Guests`: tre documenti dicono tre cose diverse
  (cancellarli per la roadmap performance, usarli come voci di menu, spostarli
  in route fuori dal funnel per `modifica-struttura-public.md`). Da chiudere una
  volta sola.
- Lista d'attesa quando i ridotti finiscono, oppure solo prezzo pieno in cassa.
- Si avvisa chi arriva dopo l'orario limite?
- Per quanto tempo si conservano i dati di chi non viene più.

---

## 9. Endpoint passwordless e funnel (implementati 2026-10-01, DB in produzione, sito non ancora deployato)

Branch `feat/passwordless-booking`. La migrazione porta la data 2026-10-02 nel
nome solo per ordinarsi dopo quella del 2026-10-01: è stata scritta lo stesso
giorno. Le due migrazioni sono **applicate in produzione dal 2026-10-01**
(passo 1 sotto); il sito nuovo non è ancora deployato. Dettagli in
[`CHANGELOG.md`](./CHANGELOG.md).

### Cosa c'è
- **SQL** — `supabase/rls-history/2026-10-02-booking-endpoints.sql`: una funzione
  `ep_*` per operazione (prenota, attiva, link di accesso, sessione, logout, le mie
  prenotazioni, disdetta), eseguibili solo da `service_role`; `open_public_ticket`
  per la pagina ticket; `scan_ticket_check_in` riscritta. Il secondo giro
  (sotto) ha cambiato alcune di queste funzioni.
- **Endpoint** — `apps/web/api/` (Vercel Functions) sopra handler puri in
  `apps/web/server/`. Cookie `uc_session` httpOnly 12 mesi a rinnovo, POST solo JSON
  con `Origin` ammesso, nessuna enumerazione delle email.
- **Funnel** — dietro `VITE_BOOKING_API=1`: consensi separati, "check your inbox",
  pagina `/activate`, blocco "booking as" con sessione, prezzo e orario limite delle
  formule, cattura della fonte. Flag spento → funnel di oggi.
- **Admin** — il check-in mostra `pending` e l'avviso "formula scaduta".
- **Test automatici** — `supabase/tests/run.sh` (12 file: attacchi RLS,
  concorrenza reale, token derivato, recupero, limiti, pulizia) e
  `pnpm --filter web test` (105 unit + 10 integrazione sul Postgres dell'harness).
  Più giri end-to-end in Chrome headless contro il Postgres locale.
- **Test manuale** (2026-10-01, sito pubblico, ricetta in
  [`test-manuale-locale.md`](./test-manuale-locale.md)): sono passati prenotazione
  anonima, link di conferma, ticket ed email del ticket, recupero da `/account`
  dopo il logout, una nuova prenotazione mentre un'altra era in attesa (la
  pending non tiene il posto) e la conferma tardiva oltre quota: 4 confermati su
  3, SOLD OUT in home. L'overbooking minimo è confermato come scelta. Non
  provati: check-in admin, BotID e cron, che serviranno il deploy di preview.

### Decisioni tecniche prese in autonomia
- **La logica sta in SQL**, gli endpoint sono sottili: atomicità e race si
  risolvono in una transazione e si testano con psql.
- **Il link email apre una pagina che fa POST**, non un GET che consuma il token:
  i link-scanner delle caselle (Outlook & co.) lo brucerebbero prima dell'utente.
- **I consensi del form valgono solo all'apertura del link**, e un contatto
  esistente non viene mai modificato da una prenotazione anonima: chi digita
  l'email di un altro non può rinominarlo né concedere consensi a suo nome.
- **Una prenotazione col form ignora il cookie di sessione**: un cookie rimasto
  (logout fallito, telefono condiviso) non trasforma mai il form di qualcun altro
  in una prenotazione sull'account del cookie.
- **Email del ticket a ogni conferma**: il token del ticket non è salvato in
  chiaro, quindi l'email è l'unica copia durevole del link.
- **Fix di sicurezza preesistente**: `issue_ticket_access_token` era chiamabile da
  `anon` via PostgREST; chi conosceva l'id di una prenotazione poteva ruotarne il
  token e riceverne uno valido. Revocata, e chiusa in produzione il 2026-10-01.

### Da fare a mano per andare in produzione
1. ~~Applicare le migrazioni~~ — **fatto il 2026-10-01**, prima un dry-run
   (`begin` … `rollback`), poi dopo il backup `pgdumpall_20261001_1417.sql.gz`.
   Supabase è self-hosted (VPS, schema `underclub`), e le migrazioni vanno
   lanciate come **`supabase_admin`**, proprietario di tutti gli oggetti dello
   schema: `postgres` lì non è superuser (`must be owner of table`).
   Come, a grandi linee:
   `(echo 'begin;'; cat file1.sql file2.sql; echo 'commit;'; echo "notify pgrst, 'reload schema';") | ssh root@<vps> "docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -q"`.
   La 2026-10-02 dà a `service_role` l'usage sullo schema, che in produzione
   mancava (senza, PostgREST risponde 403 alla service key).
2. ~~Resend e DNS~~ — **fatto il 2026-10-01**: `reservations.` e `news.`
   verificati, DMARC, Postmaster, inoltro `info@`. Tutto in
   [`dns-underclub.md`](./dns-underclub.md). Manca la API key.
3. Vercel, progetto web: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (sensibile),
   `PUBLIC_SITE_URL`, `ALLOWED_ORIGINS` (es. il `www.`), `RESEND_API_KEY`,
   `EMAIL_FROM`, più tre segreti generati con `openssl rand -base64 48`:
   `TICKET_SECRET` (da non cambiare senza motivo: i QR e i link già inviati
   restano validi, ma per le prenotazioni confermate prima del cambio "MY
   BOOKINGS" non ricostruisce più il ticket e rimanda all'email),
   `IP_HASH_SECRET`, `CRON_SECRET`. Sui preview servono le stesse email
   (il trasporto `console` è rifiutato su ogni deploy) e il loro origin in
   `ALLOWED_ORIGINS`. Verificare che l'OIDC di Vercel sia attivo (serve a BotID)
   e che il cron giornaliero `/api/cron/cleanup` compaia nel progetto.
4. Provare un deploy di preview: le funzioni non sono mai state eseguite su Vercel,
   solo in locale (stessi handler).
5. Rivedere i testi marcati `COPY-DRAFT` (UI, email, privacy) e accendere
   `VITE_BOOKING_API=1`.
6. A endpoint vivi: la pulizia in fondo alla migrazione del 2026-10-01 (prima va
   tolta da `ep_request_booking` la scrittura delle colonne legacy, step 1b; lo
   step 1c chiude del tutto `reservations` ad `anon`).

### Secondo giro (stesso giorno): recupero, limiti, debito
- **Recupero del ticket**: il token del ticket ora è **derivato** (HMAC dell'id
  prenotazione con `TICKET_SECRET`, segreto che il DB non vede mai), quindi con la
  sessione il QR si ricalcola quando serve e il link nell'email resta valido. Le
  prenotazioni del flusso vecchio si recuperano dall'email: il contatto nasce al
  primo "recover booking" e le righe vengono collegate; il loro QR resta solo
  nell'email originale.
- **UI** (dietro flag): menu con `MY BOOKINGS` / `RECOVER BOOKING`, `INFO`,
  `PRIVACY`, `LOG OUT`; pagina `/account` (prenotazioni, ticket, disdetta,
  consensi in lettura, logout; senza sessione il form di recupero); bottone
  ticket in home quando c'è una prenotazione confermata.
- **Limiti**: 3 email all'ora e 10 al giorno per indirizzo (in silenzio, non
  rivela nulla); per IP 20 prenotazioni e 5 link di accesso ogni 10 minuti (429),
  con l'IP salvato solo come HMAC; **BotID** di Vercel sui due moduli.
- **Pulizia notturna** (`/api/cron/cleanup`, 04:00): link scaduti, sessioni
  vecchie, contatori, contatti mai confermati dopo 7 giorni.
- **Debito**: `open_public_ticket` legge e segna l'apertura in una chiamata (il
  web non usa più le policy di aprile); `GET /api/session` è una sola RPC e la
  sessione si riscrive al massimo una volta al giorno.

### Decisioni dopo il secondo giro
- **I consensi non si cambiano dal sito, e resterà così** (decisione
  2026-10-01). `/account` li mostra in sola lettura; la revoca passa
  dall'indirizzo indicato nella privacy. Quando partiranno le email
  promozionali, ognuna dovrà avere il suo link di disiscrizione: la revoca deve
  essere facile quanto il consenso dato con una spunta.

### Aperto
- **Da decidere (piccolo)**: senza sessione `GET /api/session` risponde 401, come
  da contratto, e Chrome lo mostra in rosso in console. Si può passare a `200` con
  `null`: cambia solo l'aspetto della console.
- **TODO futuro**: la sezione cookie della privacy non dice cosa salva nel
  browser lo script di BotID. Da verificare quando si rivedono i testi della
  privacy; non è una priorità adesso.
- Il menu è nascosto sulla sezione Book Now (copriva il bottone Confirm sugli
  schermi piccoli) e assente su ticket, `/activate` e `/info`.

---

## Ordine suggerito (prossimi passi rimasti)

Aggiornato il 2026-10-01: il modello dati, gli endpoint e il funnel esistono sul
branch `feat/passwordless-booking`; DB e DNS sono in produzione.

1. **Messa in produzione degli endpoint**: i passi 3-5 di "Da fare a mano" nella
   sezione 9 (env Vercel, preview, copy, flag), poi lo spostamento di
   `underclub.it` dal vecchio progetto Vercel `underclub` (da ignorare, nessun
   dato da migrare) a `underclub-2-0-web`.
2. Pulizia in fondo alla migrazione del 2026-10-01, dopo lo step 1b.
3. Admin: **lista eventi + CRUD eventi** (lineup + formule con prezzo, quota e
   scadenza) + **lista prenotazioni per evento** (con `qr_scanned_at`).
4. Admin: **Guest list** A-Z e ricerca per nome o email alla porta, che deve
   funzionare anche senza QR.
5. **Analytics** admin quando ci sarà dato reale.
6. Decidere se tenere pubbliche `/lanyard-rapier` e `/demo/lanyard` (sezione 7).
7. (Rimandati) Anonimizzazione GDPR, incassi e ingressi senza prenotazione,
   suono e coda offline per lo scanner, privacy di BotID (sezione 9, "Aperto").

---

*Ultimo aggiornamento: 2026-10-01 — endpoint passwordless, funnel dietro flag,
test SQL e degli endpoint (sezione 9). Migrazioni applicate e DNS completo;
sito nuovo non ancora deployato.*
