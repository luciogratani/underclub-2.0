# RLS History — 2026-10-01 (contacts, sessioni passwordless, formule)

File SQL:

- `supabase/rls-history/2026-10-01-contacts-sessions-formulas.sql`

Questa nota **supera** il modello di prenotazione descritto in
[`rls-history-2026-04-17-ultra-strict-ticket-token-v2.md`](./rls-history-2026-04-17-ultra-strict-ticket-token-v2.md).
Il token del ticket resta esattamente com'è; cambia **chi crea le prenotazioni**.

---

## Cosa cambia nel modello di fiducia

### Prima (aprile 2026)

`anon` prenotava da solo, tramite la RPC `create_public_reservation`
(`security definer`, execute concesso ad `anon`). Era il compromesso corretto
finché il pubblico non aveva né identità né sessione.

### Adesso

Esiste la persona (`contacts`) con sessione e consensi, quindi le operazioni
utente hanno bisogno di uno stato che `anon` non può custodire in modo sicuro.

- **Sistema passwordless proprietario, non Supabase Auth.** Il progetto Supabase
  è multi-tenant: il ruolo `authenticated` è la porta dell'admin e non va aperto
  agli utenti del sito. Registrare il pubblico in `auth.users` darebbe a
  chiunque il diritto di eseguire `scan_ticket_check_in`.
- **Sessione in cookie `httpOnly`, 12 mesi, rinnovata a ogni uso.** In DB solo
  l'hash del token, come per il ticket. Una sessione annuale in `localStorage`
  sarebbe leggibile da qualunque XSS.
- **Le operazioni utente passano da funzioni serverless su Vercel** con la
  service key: richiesta del link, attivazione, prenotazione, disdetta.
- **Due link distinti**, con scopi diversi per scelta:
  - *attivazione*: monouso, 15-30 minuti, crea la sessione e conferma **solo**
    la prenotazione da cui è partito;
  - *ticket*: lunga durata, mostra il QR e permette la disdetta, ma **non** dà
    accesso a dati e consensi. Le email vengono inoltrate e gli screenshot
    circolano.

---

## Superficie esposta ad `anon`

Resta pubblico, direttamente su Supabase:

- lettura di eventi `published`, artisti e formule d'ingresso;
- `get_public_entry_counts` — soli numeri aggregati, mai righe di prenotazione;
- pagina ticket via header `x-ticket-token`, con le policy di aprile.

Le tabelle nuove (`contacts`, `activation_tokens`, `contact_sessions`) sono
**fail-closed** su due livelli: nessuna policy per `anon`, e `revoke all` dei
privilegi diretti per `anon` e `authenticated`. Solo la service key le
raggiunge, bypassando RLS. L'admin ha la sola lettura dei contatti, per guest
list e dettaglio prenotazione; token e sessioni gli restano invisibili.

Il `revoke` non è ridondante, ed è la lezione dello stress test: **esporre uno
schema dalla dashboard Supabase imposta anche le DEFAULT PRIVILEGES**, quindi le
tabelle create in seguito nascono concesse ad `anon` e `authenticated`. Con i
soli privilegi, e senza policy, RLS regge — misurato: select vuota, insert
rifiutata — ma diventa l'unico argine, e le scritture di `anon` falliscono
**silenziosamente** come `UPDATE 0` invece di essere rifiutate. Con il revoke la
risposta è `permission denied`, che in un log si vede.

Misurato anche il lato `reservations`: la grant di aprile per `anon` è limitata
alla colonna `ticket_opened_at`, e la restrizione **copre automaticamente le
colonne nuove**. `anon` non può scrivere né `status` né `source`, quindi la
provenienza non è falsificabile da fuori.

---

## Cosa viene revocato, e quando

La migrazione è **additiva**: `anon_insert_reservation` e la `grant` su
`create_public_reservation` restano vive, così il sito non si rompe tra lo
schema e gli endpoint. La pulizia è elencata in fondo al file SQL e va eseguita
**solo** quando prenotazione, attivazione, sessione e disdetta passano dalle
funzioni serverless.

Fino a quel momento convivono due percorsi di scrittura su `reservations`: il
vecchio anon e il nuovo service key. È una finestra di transizione voluta, non
uno stato finale.

---

## Vincoli che RLS non può esprimere

- **18+**: `now()` non è immutabile, quindi non può stare in un CHECK. Il
  controllo vive nell'endpoint che crea il contatto, oltre alla validazione già
  presente nel form.
- **Quota**: contata sulle prenotazioni confermate quando si prenota. Le
  `pending` non tengono il posto (decisione 2026-10-01), quindi resta possibile
  un overbooking minimo in caso di prenotazioni simultanee.

---

## Da sistemare prima della pulizia

`scan_ticket_check_in` è ancora quella di aprile:

1. aggiorna solo se `status = 'confirmed'`, e una prenotazione `pending` col
   token uscirebbe come `already_scanned` con timestamp vuoto. Per questo il
   token del ticket va **emesso solo alla conferma**;
2. legge `full_name` dalla prenotazione, colonna che la pulizia elimina: va
   riscritta con il join su `contacts`;
3. deve guadagnare l'esito "formula scaduta", perché oltre
   `event_entries.valid_until` la cassa fa pagare il prezzo pieno.
