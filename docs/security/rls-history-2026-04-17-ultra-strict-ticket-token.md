# RLS History — 2026-04-17

Questo documento commenta la revisione **ultra strict** delle policy `reservations` con ownership reale via token ticket.

File SQL associato:

- `supabase/rls-history/2026-04-17-ultra-strict-ticket-token.sql`

---

## Perche' questo update

La prima versione RLS era corretta per bootstrap, ma su `reservations` aveva due aperture:

- `SELECT` anon con `using (true)`
- `UPDATE` anon con `using (true) / with check (true)`

Queste regole non implementano davvero "solo own reservation".

---

## Obiettivo di sicurezza

Per l'utente pubblico, consentire:

1. leggere **solo** la reservation del proprio ticket
2. aggiornare **solo** `ticket_opened_at`
3. farlo **solo una volta**
4. senza esporre la reservation ad altri utenti anon

---

## Strategia tecnica adottata

### 1) Ownership con token per reservation

- Nuova colonna: `reservations.ticket_access_token_hash`
- In DB si salva **solo hash SHA-256** del token (mai il token in chiaro)
- Matching via header HTTP:
  - `x-ticket-token: <token>`

Funzioni introdotte:

- `underclub.hash_ticket_token(token)`
- `underclub.current_ticket_token()`
- `underclub.ticket_token_matches(reservation_id)`
- `underclub.issue_ticket_access_token(reservation_id)` (helper per emissione/rotazione)

### 2) Update anon limitato al solo ticket open

- `grant update (ticket_opened_at) on reservations to anon`
- policy update con:
  - token valido
  - `status = 'confirmed'`
  - `qr_scanned_at is null`
  - `ticket_opened_at` settabile solo se prima era `null`

### 3) Difesa in profondita'

Anche con RLS corretta, si restringono i privilege SQL diretti su `reservations` per `anon`:

- revoca completa
- grant minimi necessari (`insert`, `select`, `update(ticket_opened_at)`)

---

## Compatibilita' applicativa

Questa versione richiede che il client ticket invii il token:

- route: `/ticket/:reservationId`
- header: `x-ticket-token`

Senza header/token valido, `SELECT` e `UPDATE` su `reservations` falliscono per anon.

---

## Rollout consigliato

1. Applicare SQL in ambiente staging
2. Aggiornare flow email ticket per includere token
3. Aggiornare frontend ticket per inviare `x-ticket-token`
4. Testare:
   - token valido -> accesso consentito
   - token assente/errato -> denied
   - secondo update `ticket_opened_at` -> denied
5. Applicare in produzione

---

## Nota

Questo update mantiene intatti i comportamenti pubblici su:

- `events`
- `event_artists`
- `event_entries`
- `reservations insert` su eventi `published`

La modifica e' focalizzata solo sull'ownership reale del ticket e hardening di `reservations`.
