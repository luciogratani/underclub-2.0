# Prossimi passi — Underclub 2.0

Panoramica del lavoro da fare, divisa per **admin**, **sito pubblico (web)** e **backend / database**.  
Contesto: lo schema SQL in `supabase/schema.sql` e il package `@underclub/shared` (tipi + client Supabase tipizzato) sono già definiti; l’admin ha home + routing + pagine placeholder; il web usa ancora dati mock e non chiama Supabase.

---

## 1. Admin (`apps/admin`)

### Fondamenta
- [ ] **Client Supabase**: istanziare `createSupabaseClient` con `import.meta.env` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) e un piccolo modulo/provider riusabile.
- [ ] **Auth (fase successiva alla UI, se confermato)**: login admin (es. email/password o magic link), route protette, logout.

### Eventi
- [ ] **Lista eventi**: tabella o card mobile-first; filtri per stato (`draft` / `published` / `archived`); ordinamento per data.
- [ ] **Creazione / modifica evento**: form per titolo, data, ora, stato; gestione **lineup** (`event_artists`: nome, origine opzionale, ordine); gestione **entry** (`event_entries`: nome, nota, quota, ordine).
- [ ] **Eliminazione** (con conferma) e validazione quote vs prenotazioni esistenti.

### Prenotazioni
- [ ] **Lista prenotazioni per evento**: join con `event_entries`; mostrare nome, email, tier, stato, `ticket_opened_at`, `qr_scanned_at`.
- [ ] **Azioni admin**: annullare prenotazione, aggiungere manualmente, eventuale modifica stato (allineato a `reservations.status`).
- [ ] **Guest list**: vista A–Z / ricerca sullo stesso dataset delle prenotazioni.

### Check-in e analytics
- [ ] **Check-in / QR**: UI scanner (camera) che risolve una prenotazione e aggiorna `qr_scanned_at` (e coerenza con il payload del QR).
- [ ] **Analytics**: pagina con metriche reali (prenotazioni per evento, aperture ticket, scan, trend nel tempo) — dipende da query e eventualmente viste/materializzate in DB.

### Qualità
- [ ] Allineare componenti shadcn dove serve (tabelle, form, dialog) invece di solo markup custom.
- [ ] **RLS**: le policy Supabase devono consentire lettura/scrittura solo agli utenti autenticati con ruolo admin (da definire in Supabase Auth / custom claims o tabella `profiles`).

---

## 2. Sito pubblico (`apps/web`)

### Dati e Supabase
- [ ] **Sostituire i mock** (Next Date, Archive, Book Now, ecc.) con lettura da Supabase: evento “prossimo” pubblicato, archivio, lineup, entry disponibili.
- [ ] **Form prenotazione**: invio insert su `reservations` con `event_id`, `entry_id`, `full_name`, `date_of_birth`, `email`; rispettare `unique (event_id, email)` e quote per tier (controllo lato client + gestione errore server).
- [ ] **Scelta entry tier** nel Book Now: oggi le tier sono solo mock in UI; collegare a `event_entries` reali e disabilitare tier esaurite (`quota` vs conteggio `confirmed`).

### Ticket
- [ ] **Route `/ticket/:id`**: caricare la prenotazione per `id` (UUID); passare i dati a `Lanyard` (`ticketData`) invece del solo mock.
- [ ] **Tracking apertura**: alla prima visita (o ogni visita, da decidere), aggiornare `ticket_opened_at` se ancora null (policy RLS: solo il titolare o anonimo con token — da definire).
- [ ] **Email con link**: flusso serverless (es. Vercel) che invia mail con link `https://…/ticket/{reservationId}` dopo insert prenotazione (non è solo frontend).

### Coerenza UX
- [ ] Allineare copy e campi al modello DB (date ISO, orari, nomi tier).
- [ ] Gestione errori rete / vincoli DB (toast o UI esistente).

---

## 3. Backend / database / wiring

### Supabase (progetto)
- [ ] **Applicare lo schema**: eseguire `supabase/schema.sql` nell’SQL Editor (o migrare con Supabase CLI se adottate le migration).
- [ ] **Row Level Security (RLS)**:
  - **Pubblico**: lettura eventi `published` + entry/artisti collegati; insert `reservations` solo dove consentito; niente lettura libera di tutte le prenotazioni.
  - **Admin**: CRUD completo su eventi, artisti, entry, prenotazioni (tramite ruolo o service role in funzioni controllate — evitare di esporre service key nel browser).
- [ ] **Trigger / funzioni** (opzionale ma utile): aggiornamento `updated_at`, vincoli extra su quote (es. function che verifica cap prima di insert reservation).

### Shared e monorepo
- [ ] **Web**: aggiungere dipendenza `@underclub/shared` e usare gli stessi tipi + `createSupabaseClient` (o wrapper) per coerenza con admin.
- [ ] **Allineamento tipi**: quando lo schema cambia, aggiornare `packages/shared/src/database.ts` e `types.ts`.

### Infrastruttura
- [ ] **Variabili ambiente** su Vercel per web e admin; **Redirect URLs** in Supabase Auth per entrambi i domini.
- [ ] **Serverless** (invio email, webhook): progetto Vercel + segreti (`RESEND_API_KEY`, ecc.) fuori dal bundle client.

---

## Ordine suggerito (dipendenze)

1. Applicare schema + RLS minima (lettura eventi pubblicati + insert reservation).  
2. Web: lettura evento + entry + submit prenotazione.  
3. Web: ticket per UUID + `ticket_opened_at`.  
4. Admin: lista eventi + CRUD eventi (lineup + entry).  
5. Admin: lista prenotazioni per evento + azioni.  
6. Email post-prenotazione + auth admin + check-in QR.

---

*Ultimo aggiornamento: allineato allo stato post-commit admin/shared/schema e ripristino Ticket/Lanyard da `bd47500`.*
