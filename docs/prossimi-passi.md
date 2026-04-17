# Prossimi passi — Underclub 2.0

Panoramica del lavoro da fare, divisa per **admin**, **sito pubblico (web)** e **backend / database**.  
Contesto: lo schema SQL in `supabase/schema.sql` e il package `@underclub/shared` (tipi + client Supabase tipizzato + mapper) sono definiti; l'admin ha home + routing + pagine placeholder; il web è collegato a Supabase con fallback ai mock.

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

## Ordine suggerito (prossimi passi rimasti)

1. Verificare submit reale prenotazione da `BookNow` (insert `reservations`) e gestione errori vincoli.
2. Verificare ticket end-to-end (`/ticket/:id`) con aggiornamento `ticket_opened_at`.
3. Admin: client Supabase + lista eventi + CRUD eventi (lineup + entry).
4. Admin: lista prenotazioni per evento + azioni.
5. Email post-prenotazione + auth admin + check-in QR.

---

*Ultimo aggiornamento: fetch evento live OK. Console checkpoint: `fetchNextEvent -> event found (id 099c2ac1-923f-478f-9b16-46dd261fbc51, lineupCount 3, entriesCount 3)` e `App fetchNextEvent resolved hasEvent: true`. I log duplicati sono attesi in dev per React StrictMode.*
