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
- [x] **Check-in / QR**: RPC `scan_ticket_check_in` + pagina `/check-in` con scanner camera live (BarcodeDetector + fallback ZXing) e input manuale. Vedi sezioni 4 e 6.
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
- [ ] **Email con link**: flusso serverless (es. Vercel) che invia mail con link `https://…/ticket/{reservationId}` dopo insert prenotazione.

### Coerenza UX
- [x] Allineamento copy e campi al modello DB (date ISO, orari, nomi tier) tramite mapper centralizzati.
- [x] Gestione errori rete / vincoli DB (toast esistente).

---

## 3. Backend / database / wiring

### Supabase (progetto)
- [x] **Schema SQL**: `supabase/schema.sql` definisce tutte le tabelle nello schema `underclub`.
- [x] **Row Level Security (RLS)**: `supabase/rls.sql` pronto con policy:
  - **Pubblico (anon)**: lettura eventi `published` + artisti/entry collegati; insert `reservations`; lettura propria reservation; update `ticket_opened_at`.
  - **Admin (authenticated)**: CRUD completo su tutte le tabelle.
- [x] **Applicare lo schema + RLS**: eseguiti `schema.sql` e `rls.sql` in Supabase SQL Editor.
- [ ] **Trigger / funzioni** (opzionale): aggiornamento `updated_at`, vincoli extra su quote.

### Shared e monorepo
- [x] **`@underclub/shared`**: tipi derivati dal DB (single source of truth), mapper snake_case→camelCase, client Supabase tipizzato.
- [x] **Web**: dipendenza `@underclub/shared` aggiunta, client Supabase + API functions in `apps/web/src/lib/`.
- [x] **Type audit**: completato — tutti i blockers risolti (status union, tipi derivati, mapper, tipi duplicati eliminati).

### Infrastruttura
- [x] **Variabili ambiente locali**: creati `apps/web/.env` e `apps/admin/.env` con `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
- [ ] **Variabili ambiente su Vercel** + **Redirect URLs** in Supabase Auth per entrambi i domini.
- [ ] **Serverless** (invio email, webhook): progetto Vercel + segreti (`RESEND_API_KEY`, ecc.) fuori dal bundle client.

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
- [ ] **Camera scanner**: wiring `BarcodeDetector` nel `/check-in` per scansione live, con fallback a input manuale.
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
- **Password reset / cambio password**: non in UI. Per ora si gestisce da dashboard Supabase.
- **Rate limit login** lato UI: affidato ai default Supabase; valutare throttle custom se emergono attacchi brute-force.

---

## 6. Camera scanner live su `/check-in` (implementato 2026-04-22)

### Decisioni prese
- **Strategia 2-vie**:
  1. `BarcodeDetector` nativo quando disponibile (Chrome/Android, Edge, Firefox recente). Zero payload aggiuntivo, detect quasi gratuito.
  2. Fallback a `@zxing/browser` per Safari iOS e browser senza `BarcodeDetector`. Caricato via **dynamic import**, quindi non entra nel bundle iniziale (ZXing finisce in un chunk a parte di ~107 kB gzip, scaricato solo alla prima attivazione del fallback).
- **Dipendenze aggiunte** (solo `apps/admin`): `@zxing/browser`, `@zxing/library`.
- **UX**:
  - Toggle **Camera / Manual** in alto (`Camera` di default se l'utente sceglie camera). Il paste manuale resta sempre disponibile come fallback lato utente.
  - Viewfinder con bordo colore primary e etichetta di stato (`Avvio camera…`, `Scanning…`, `Errore camera`).
  - `facingMode: environment` (camera posteriore) quando disponibile.
  - **Anti-dup a 2 livelli**: cooldown sullo scanner (stesso token entro 2 s → ignorato) + lock a livello pagina durante l'elaborazione RPC (altri 1.5 s dopo la risposta).
  - **Feedback tattile**: `navigator.vibrate(120)` su `ok`, pattern `[60,60,60]` sugli altri esiti (se il device lo supporta).
  - Stop totale della camera (track `MediaStream` fermati) quando si esce dalla modalità o si smonta il componente.
- **Nessuna dipendenza dal server**: la verifica resta sempre via RPC `scan_ticket_check_in` (stesso identico percorso del flusso manuale).

### File introdotti / modificati
- `apps/admin/src/components/QrCameraScanner.tsx` — nuovo componente riusabile (BarcodeDetector + fallback ZXing, cleanup stream, viewfinder).
- `apps/admin/src/pages/CheckIn.tsx` — toggle Camera/Manual, lock processing, feedback vibrazione, riuso di `ResultCard`.

### Setup / requisiti
- **HTTPS obbligatorio** in produzione: `getUserMedia` è bloccato su `http://` non-localhost. Fai servire l'admin sotto HTTPS (ok in locale via `localhost`).
- Nessuna migrazione SQL richiesta.
- Build: lo chunk ZXing viene code-splittato automaticamente da Vite; nessuna azione manuale.

### Test manuale end-to-end
1. Aprire `/check-in`, cliccare **Camera**. Il browser chiede il permesso camera → concedere.
2. Inquadrare il QR del ticket web → risultato in ~1 s, viene mostrata la `ResultCard` e parte il feedback tattile.
3. Riprovare sullo stesso QR entro 2 s → ignorato (nessuna seconda richiesta RPC).
4. Riprovare dopo 2 s → risponde `already_scanned` come atteso.
5. Toggle a **Manual** → camera si spegne (LED fotocamera si spegne / track rilasciati).
6. Safari iOS: il primo uso scarica il chunk ZXing (visibile in Network), poi il flusso è identico.

### Cosa resta aperto
- **Scelta camera**: attualmente si lascia al browser (`facingMode: environment` hint). Possibile evoluzione: dropdown "Camera X" con `enumerateDevices()` se in futuro ci saranno multiple camere rilevanti.
- **Suono** (beep) su esito: non aggiunto per non caricare asset audio; il feedback tattile basta in ambiente rumoroso?
- **Offline / rete instabile**: la verifica richiede rete. Se necessario, valutare una coda locale (IndexedDB) che tenta la RPC in background e segnala "pending".

---

## Ordine suggerito (prossimi passi rimasti)

1. Admin: **lista eventi + CRUD eventi** (lineup + entry) + **lista prenotazioni per evento** (con colonna `qr_scanned_at`).
2. Admin: **Guest list** A-Z (stesso dataset prenotazioni, ricerca veloce per addetti ingresso).
3. Verificare submit reale prenotazione da `BookNow` (insert `reservations`) e gestione errori vincoli.
4. Verificare ticket end-to-end (`/ticket/:id`) con aggiornamento `ticket_opened_at`.
5. Email post-prenotazione (serverless su Vercel + Resend).
6. **Analytics** admin (prenotazioni, aperture ticket, scan) quando ci sarà dato reale.
7. (Futuro) Allowlist admin via tabella dedicata se cresce il team.
8. (Futuro) Suono/offline queue per lo scanner se emergono esigenze operative.

---

*Ultimo aggiornamento: 2026-04-22 — implementata la sezione 6 (camera scanner live su `/check-in` con BarcodeDetector + fallback ZXing dynamic-imported). Build `pnpm -r build` verde, ZXing splittato in chunk separato (~107 kB gzip, caricato on-demand). Prossimo: CRUD eventi e lista prenotazioni admin.*
