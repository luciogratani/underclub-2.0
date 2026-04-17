# TypeScript code audit review
_Exported on 17/04/2026 at 4:11:30 CEST from Cursor (3.1.15)_

---

**User**

Sei un agente di code audit TypeScript. Devi fare una review approfondita della coerenza tipi tra DB schema, package shared e app consumer (web/admin) nel repo Underclub 2.0.

## Obiettivo
Verificare che:
1) i tipi esistenti siano coerenti tra loro
2) non ci siano mismatch naming/shape (snake_case vs camelCase)
3) non manchino tipi necessari ai flussi attuali
4) i contratti siano sufficienti per i prossimi wiring steps (web/admin + Supabase)
5) eventuali tipi ridondanti/ambigui vengano segnalati

## Contesto tecnico
- Monorepo:
  - apps/web
  - apps/admin
  - packages/shared
  - supabase/schema.sql
- Schema DB target: `underclub` (non `public`)
- Shared package espone:
  - `types.ts`
  - `database.ts`
  - `supabase.ts`
  - `index.ts` re-exports

## File da analizzare (obbligatori)
- supabase/schema.sql
- packages/shared/src/types.ts
- packages/shared/src/database.ts
- packages/shared/src/supabase.ts
- packages/shared/src/index.ts
- apps/web/src/**/* (focus: App, NextDate, BookNow, ReservationSummary, Ticket, Lanyard)
- apps/admin/src/**/* (anche se placeholder)

## Cosa devi controllare in dettaglio
1. **Schema vs Database type**
   - Tutte le tabelle/colonne in `schema.sql` sono rappresentate in `database.ts`?
   - Tipi colonna corretti (nullable, status, date/time, uuid)?
   - Ci sono campi in `database.ts` non presenti nello schema o viceversa?

2. **Schema name correctness**
   - Verifica che il typing sia coerente con schema `underclub`.
   - Verifica che il client Supabase usi schema `underclub` in modo corretto.

3. **Domain types consistency**
   - `Event`, `EventArtist`, `EventEntry`, `Reservation` allineati a DB.
   - Enum/status allineati ai check constraints SQL.
   - Relazioni aggregate (`EventWithDetails`, ecc.) coerenti.

4. **Application contract completeness**
   - Verifica i nuovi tipi “view/input/command”.
   - Individua eventuali tipi mancanti per:
     - NextDate UI
     - Entry availability (sold out/left/unlimited)
     - BookNow form -> create reservation command
     - Ticket page data contract
     - Admin event/reservation pages

5. **Naming and mapping boundaries**
   - Segnala dove serve esplicitamente un mapper:
     - DB snake_case -> UI camelCase
     - date formats (DD/MM/YYYY vs ISO)
   - Evidenzia se alcuni tipi confondono layer (DB row type usato direttamente in UI).

6. **Redundancy and risk**
   - Tipi duplicati o quasi-duplicati.
   - Tipi troppo generici o fragili.
   - Punti in cui un refactor piccolo ridurrebbe bug futuri.

## Output richiesto (formato rigido)
### A) Findings (ordinati per severità)
Per ogni finding:
- Severity: `high` | `medium` | `low`
- File/i coinvolti
- Problema
- Impatto
- Fix consigliata

### B) Missing types (lista concreta)
- Nome tipo suggerito
- Dove definirlo (file)
- Shape proposta (campi essenziali)

### C) Mapping plan
- Elenco mapper necessari (input/output)
- Signature consigliata di ogni mapper

### D) Verdict finale
- `READY` o `NOT READY` per il wiring dati reale
- breve motivazione (max 8 righe)

## Vincoli
- Non fare modifiche al codice.
- Nessuna supposizione generica: cita file/simboli concreti.
- Se non trovi problemi, dichiaralo esplicitamente e segnala rischi residui.

---

**Cursor**

I'll start by reading all the required files in parallel to build a complete picture of the type system.

Now let me read the web app components and the admin app in parallel.

Let me check for Ticket/Lanyard components and any imports from the shared package across the apps.

I now have a complete picture of the entire type system. Here is the full audit report.

---

## A) Findings (ordinati per severita)

### F1 - HIGH: Tipi duplicati tra `apps/web` e `packages/shared`

**File coinvolti:** `apps/web/src/App.tsx` (L16-20), `apps/web/src/components/Lanyard/Lanyard.tsx` (L22-28), `apps/web/src/components/ErrorToast.tsx` (L3-8), `packages/shared/src/types.ts`

**Problema:**
Tre tipi in `apps/web` ricalcano tipi gia definiti (o definibili) in `shared`, senza importarli:

| Tipo locale (web) | Tipo shared equivalente | Delta |
|---|---|---|
| `ReservationData` (App.tsx) | `PublicReservationFormInput` | Shape identica |
| `TicketData` (Lanyard.tsx) | `TicketViewData` | Nomi campi divergenti (`date` vs `eventDate`, `entry` vs `entryName`, manca `reservationId`) |
| `ErrorToastData` / `ToastError` (ErrorToast + App) | nessuno in shared | Duplicazione interna a web |

**Impatto:**
Quando si wireer il fetch reale, il rename dei campi generera runtime mismatch (il componente `Lanyard` si aspetta `date` ma shared emette `eventDate`). Inoltre `ReservationData` e `PublicReservationFormInput` drifteranno inevitabilmente.

**Fix consigliata:**
- Eliminare `ReservationData` da `App.tsx`, importare `PublicReservationFormInput` da `@underclub/shared`.
- Allineare `TicketData` in `Lanyard.tsx` a `TicketViewData` di shared (o importarlo direttamente).
- Centralizzare `ErrorToastData`/`ToastError`: scegliere un'unica definizione (in web va bene, non e un contratto DB) ed eliminare il duplicato.

---

### F2 - HIGH: `database.ts` — status typed as `string` instead of union

**File coinvolti:** `packages/shared/src/database.ts` (L15, L96), `packages/shared/src/types.ts` (L7, L14-15)

**Problema:**
In `database.ts`, `events.Row.status` e `reservations.Row.status` sono `string`, mentre in `types.ts` gli stessi campi sono tipizzati come `EventStatus` (`'draft' | 'published' | 'archived'`) e `ReservationStatus` (`'confirmed' | 'cancelled'`). Lo stesso vale per i sotto-tipi `Insert` e `Update`.

Quando si fa una query via il Supabase client tipizzato con `Database`, il risultato avra `status: string`, perdendo la type-safety del dominio. Qualsiasi `as Event` successivo e un cast implicito unsafe.

**Impatto:**
Un valore errato (e.g. `'active'`) supererebbe il type-check a compile-time se si usa il client Supabase direttamente. Lo switch/match sul campo status non sarebbe exhaustive.

**Fix consigliata:**
In `database.ts`, sostituire:

```typescript
// events.Row / Insert / Update
status: 'draft' | 'published' | 'archived';

// reservations.Row / Insert / Update
status: 'confirmed' | 'cancelled';
```

Oppure importare `EventStatus` e `ReservationStatus` da `types.ts`.

---

### F3 - HIGH: Nessun mapper esiste — solo type declarations

**File coinvolti:** `packages/shared/src/types.ts`, tutti i consumer (`NextDate.tsx`, `BookNow.tsx`, `ReservationSummary.tsx`, `Lanyard.tsx`)

**Problema:**
I tipi di layer boundary (`ArtistView`, `EntryTierView`, `PublicEventView`, `TicketViewData`, `CreateReservationCommand`) sono dichiarati ma **nessuna funzione mapper** esiste nel codebase. Quando il wiring reale partira, ogni componente dovra reinventare la conversione snake_case -> camelCase, il calcolo availability, e il format date.

**Impatto:**
Senza mapper centralizzati, la logica di trasformazione verra duplicata in ogni app (web, admin), causando inconsistenze e bug subtili (es. un `DD/MM/YYYY` passato dove si aspetta ISO).

**Fix consigliata:**
Creare un file `packages/shared/src/mappers.ts` con le funzioni di conversione (vedi sezione C).

---

### F4 - MEDIUM: `BookNow` non cattura `eventId` / `entryId`

**File coinvolti:** `apps/web/src/components/BookNow.tsx` (L122-124, L236), `packages/shared/src/types.ts` (`CreateReservationCommand`)

**Problema:**
Il form `BookNow` emette `{ fullName, dateOfBirth, email }` via `onConfirm`. Ma `CreateReservationCommand` richiede anche `eventId` e `entryId`. L'entry tier e hardcoded nel mock UI (L421-452) senza alcun meccanismo di selezione — non c'e uno stato `selectedEntryId`.

**Impatto:**
Quando si colleghera il form a Supabase, mancheranno i due FK obbligatori per l'insert nella tabella `reservations`.

**Fix consigliata:**
- Aggiungere uno state `selectedEntryId` in `BookNow`.
- Far ricevere l'`eventId` corrente come prop.
- Estendere il payload di `onConfirm` a `PublicReservationFormInput & { entryId: string }`, oppure passare `eventId` + `entryId` come argomenti separati.

---

### F5 - MEDIUM: `ReservationSummary` insufficiente per il flusso reale

**File coinvolti:** `apps/web/src/components/ReservationSummary.tsx` (L3-8), `packages/shared/src/types.ts` (`TicketViewData`)

**Problema:**
`ReservationSummary` accetta `{ fullName, dateOfBirth, email }`, ma il flusso reale (post-insert) dovrebbe mostrare anche: nome evento, data evento, entry tier selezionata, e `reservationId` (per generare link al ticket). Il tipo `TicketViewData` copre esattamente questo, ma non e usato.

Inoltre, `dateOfBirth` e nelle props ma non viene renderizzato nel componente (L12-16: destructuring lo ignora).

**Impatto:**
La UI post-conferma sara incompleta. Il link alla pagina Ticket non potra essere generato senza `reservationId`.

**Fix consigliata:**
Cambiare le props di `ReservationSummary` a `TicketViewData & { onGoHome?: () => void }` o un sottoinsieme adeguato.

---

### F6 - MEDIUM: Ticket page non riceve dati

**File coinvolti:** `apps/web/src/pages/Ticket.tsx`, `apps/web/src/components/Lanyard/Lanyard.tsx`

**Problema:**
`Ticket.tsx` renderizza `<Lanyard />` senza passare `ticketData`. Il componente `Lanyard` usa un `MOCK_TICKET` hardcoded come default. Non c'e routing con parametri (e.g. `/ticket/:reservationId`), ne fetch della reservation.

**Impatto:**
La pagina ticket non e wirable cosi com'e. Serve un meccanismo per caricare i dati dal DB via `reservationId`.

**Fix consigliata:**
- Aggiungere una route `/ticket/:reservationId`.
- In `Ticket.tsx`, fare il fetch della reservation + event e mappare a `TicketViewData`, poi passare come `ticketData` a `Lanyard`.

---

### F7 - MEDIUM: `Event` / `Reservation` domain types e `database.ts` Row — definizioni duplicate non collegate

**File coinvolti:** `packages/shared/src/types.ts` (L17-24, L43-54), `packages/shared/src/database.ts` (L9-17, L84-96)

**Problema:**
`Event` in `types.ts` e `events.Row` in `database.ts` hanno la stessa shape (a parte `status`) ma sono interfacce completamente indipendenti. Se si aggiunge un campo al DB, bisogna ricordarsi di aggiornare entrambi. Stesso discorso per `EventArtist`/`event_artists.Row`, `EventEntry`/`event_entries.Row`, `Reservation`/`reservations.Row`.

**Impatto:**
Schema drift silenzioso: un campo aggiunto in `database.ts` ma dimenticato in `types.ts` non genera errori a compile-time.

**Fix consigliata:**
Derivare i domain types da `database.ts`:

```typescript
import type { Database } from './database';
type Tables = Database['underclub']['Tables'];

export type Event = Tables['events']['Row'];
export type EventInsert = Tables['events']['Insert'];
```

Poi applicare override solo dove serve (narrowing di `status`).

---

### F8 - LOW: `ReservationWithEntry` usa `event_entry` (singolare) come chiave

**File coinvolti:** `packages/shared/src/types.ts` (L63-65)

**Problema:**

```65:65:packages/shared/src/types.ts
  event_entry: EventEntry;
```

Il nome `event_entry` e singolare, ma la tabella e `event_entries`. Funziona con Supabase se si usa l'alias syntax (`event_entry:event_entries!entry_id(*)`), ma il naming puo confondere.

**Impatto:** Basso, purche la query Supabase usi l'alias corrispondente. Rischio di confusione per chi legge il codice.

**Fix consigliata:** Documentare con un commento che `event_entry` e un alias Supabase, oppure rinominare in `entry` per coerenza semantica.

---

### F9 - LOW: `PublicEventView.date` — formato ambiguo

**File coinvolti:** `packages/shared/src/types.ts` (L117)

**Problema:**

```117:117:packages/shared/src/types.ts
  date: string; // display-ready or ISO based on mapper
```

Il commento "display-ready or ISO based on mapper" indica indecisione. In assenza di un mapper, i consumer non sanno se aspettarsi `2026-03-07` o `SATURDAY MARCH 07`.

**Impatto:** Fragile a runtime, ma basso finche il mapper non e scritto.

**Fix consigliata:** Decidere un formato unico (ISO) e fare il formatting display-side, oppure aggiungere un campo separato `displayDate`.

---

### F10 - LOW: Admin app — zero tipi condivisi importati

**File coinvolti:** `apps/admin/src/**/*`

**Problema:**
L'intera admin app non importa nulla da `@underclub/shared`. `Home.tsx` usa `ANALYTICS_MOCK` con shape locale. `EventsList.tsx` e `Placeholder.tsx` sono pagine vuote.

**Impatto:** Nessuno ora, ma quando si costruiranno le pagine admin (lista eventi, reservations, check-in), serviranno tipi come `EventWithDetails`, `ReservationWithEntry`, `Reservation[]`, potenzialmente tipi admin-specifici.

**Fix consigliata:** Nessuna azione immediata, ma pianificare i tipi admin-specific (vedi sezione B).

---

## B) Missing Types (lista concreta)

### B1. `AdminEventView`

**Dove:** `packages/shared/src/types.ts`

```typescript
interface AdminEventView {
  id: string;
  title: string;
  date: string;         // ISO
  time: string;
  status: EventStatus;
  createdAt: string;
  artistCount: number;
  entryCount: number;
  reservationCount: number;
}
```

Necessario per la lista eventi in admin e le stat cards nella Home.

---

### B2. `AdminReservationView`

**Dove:** `packages/shared/src/types.ts`

```typescript
interface AdminReservationView {
  id: string;
  fullName: string;
  email: string;
  entryName: string;
  status: ReservationStatus;
  ticketOpened: boolean;
  qrScanned: boolean;
  createdAt: string;
}
```

Necessario per la lista prenotazioni, guest list, e check-in.

---

### B3. `CreateReservationResult`

**Dove:** `packages/shared/src/types.ts`

```typescript
interface CreateReservationResult {
  reservationId: string;
  status: ReservationStatus;
  ticketUrl: string;     // /ticket/:reservationId
}
```

Necessario come response type dopo l'insert, per navigare alla pagina Ticket.

---

### B4. `AdminDashboardStats`

**Dove:** `packages/shared/src/types.ts`

```typescript
interface AdminDashboardStats {
  nextEventTitle: string | null;
  nextEventDate: string | null;
  totalReservations: number;
  ticketsOpened: number;
  qrScanned: number;
}
```

Per sostituire `ANALYTICS_MOCK` in `apps/admin/src/pages/Home.tsx`.

---

### B5. `BookNowPageData`

**Dove:** `packages/shared/src/types.ts`

```typescript
interface BookNowPageData {
  eventId: string;
  eventTitle: string;
  entries: EntryTierView[];
}
```

Necessario come input alla sezione BookNow per selezionare entry e conoscere l'`eventId`.

---

## C) Mapping Plan

### M1. `toArtistView`

```typescript
function toArtistView(row: EventArtist): ArtistView
// event_id -> eventId, sort_order -> sortOrder
```

---

### M2. `toEntryTierView`

```typescript
function toEntryTierView(
  row: EventEntry,
  reservationCount: number
): EntryTierView
// event_id -> eventId, sort_order -> sortOrder
// calcola availability: soldOut = quota != null && reservationCount >= quota
// left = quota != null ? quota - reservationCount : null
```

---

### M3. `toPublicEventView`

```typescript
function toPublicEventView(event: EventWithDetails, reservationCounts: Map<string, number>): PublicEventView
// mappa event fields (date/time stay ISO), lineup = event_artists.map(toArtistView), entries = event_entries.map(e => toEntryTierView(e, counts))
```

---

### M4. `toCreateReservationCommand`

```typescript
function toCreateReservationCommand(
  input: PublicReservationFormInput,
  eventId: string,
  entryId: string
): CreateReservationCommand
// dateOfBirth DD/MM/YYYY -> dateOfBirthIso YYYY-MM-DD
// fullName, email pass-through
```

---

### M5. `toReservationInsert`

```typescript
function toReservationInsert(
  cmd: CreateReservationCommand
): Database['underclub']['Tables']['reservations']['Insert']
// camelCase -> snake_case: eventId -> event_id, entryId -> entry_id,
// fullName -> full_name, dateOfBirthIso -> date_of_birth, email -> email
```

---

### M6. `toTicketViewData`

```typescript
function toTicketViewData(
  reservation: Reservation,
  event: Event,
  entry: EventEntry
): TicketViewData
// reservation.id -> reservationId, reservation.full_name -> fullName,
// event.title -> eventName, event.date -> eventDate, entry.name -> entryName
```

---

### M7. `toAdminReservationView`

```typescript
function toAdminReservationView(
  row: ReservationWithEntry
): AdminReservationView
// full_name -> fullName, entry.name -> entryName,
// ticket_opened_at != null -> ticketOpened, qr_scanned_at != null -> qrScanned
```

---

Tutti i mapper vanno in `packages/shared/src/mappers.ts` e ri-esportati da `index.ts`.

---

## D) Verdict finale

**NOT READY** per il wiring dati reale.

I tipi fondamentali (schema <-> domain) sono ben strutturati e lo schema `underclub` e correttamente configurato nel client Supabase. Tuttavia tre blockers impediscono un wiring sicuro:

1. **`database.ts` usa `string` per i campi status** — il client Supabase restituira tipi larghi che i domain types narrano come union, creando un buco di sicurezza compile-time.
2. **Nessun mapper esiste** — i tipi view/command sono dichiarati ma la logica di conversione snake_case/camelCase e calcolo availability non c'e. Ogni consumer dovra improvvisare.
3. **I componenti web definiscono tipi locali duplicati** (`ReservationData`, `TicketData`) che divergono dai tipi shared — collegare il fetch reale causera mismatch a runtime.

Una volta fixati F1, F2, F3, e aggiunto il meccanismo di selezione entry (F4), il sistema sara pronto per il primo wiring end-to-end.

