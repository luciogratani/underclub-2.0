# Underclub 2.0

Monorepo per il sito di prenotazione: **web** (pubblico) e **admin** (backoffice).

**Per ora sviluppiamo solo la versione mobile.**

## Stack

- **apps/web** — Vite + React → www.dominio.it (landing, serate, prenotazione, conferma + QR/email)
- **apps/admin** — Vite + React → admin.dominio.it (gestione serate e prenotazioni)
- **packages/shared** — tipi e client Supabase condivisi
- **Supabase** — database + auth
- **Vercel** — hosting delle app + serverless (es. invio email)

## Prerequisiti

- **Node.js** ≥ 20
- **pnpm** (consigliato) oppure npm

```bash
# Installa pnpm se non ce l'hai
npm install -g pnpm
```

## Setup

```bash
# Dalla root del monorepo
pnpm install

# Copia gli .env e compila con le tue chiavi Supabase
cp apps/web/.env.example apps/web/.env
cp apps/admin/.env.example apps/admin/.env
# Modifica .env con VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY
```

## Comandi (dalla root)

| Comando | Descrizione |
|--------|-------------|
| `pnpm dev` / `pnpm dev:web` | Dev sito pubblico → http://localhost:5173 |
| `pnpm dev:admin` | Dev admin → http://localhost:5174 |
| `pnpm build` | Build di tutte le app |
| `pnpm build:web` | Build solo web |
| `pnpm build:admin` | Build solo admin |
| `pnpm preview:web` | Preview build web |
| `pnpm preview:admin` | Preview build admin |
| `pnpm --filter web test` | Test degli endpoint (vitest). Con `TEST_PG_URL` gira anche l'integrazione su Postgres |
| `supabase/tests/run.sh` | Catena SQL completa + test su un Postgres 16 usa e getta (`--keep` lo lascia acceso e stampa `TEST_PG_URL`) |

## Variabili d'ambiente

- **apps/web** e **apps/admin**: in `.env` (vedi `.env.example`)
  - `VITE_SUPABASE_URL` — URL progetto Supabase
  - `VITE_SUPABASE_ANON_KEY` — chiave anonima (pubblica, sicura con RLS)
- **apps/web**, flag `VITE_BOOKING_API=1`: il funnel usa gli endpoint passwordless in `apps/web/api/`
  invece della RPC diretta. Spento di default.
- **Endpoint serverless** (`apps/web/api/`, solo lato server, mai con prefisso `VITE_`; elenco commentato in
  `apps/web/.env.example`): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PUBLIC_SITE_URL`,
  `ALLOWED_ORIGINS`, `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_TRANSPORT`,
  `TICKET_SECRET`, `IP_HASH_SECRET`, `CRON_SECRET`.
  Su qualunque deploy Vercel (anche preview) le email partono solo via Resend: il trasporto `console`,
  che stampa i link di accesso, è ammesso solo in locale.
- In locale `DEV_PG_URL` fa girare gli endpoint del dev server contro il Postgres di
  `supabase/tests/run.sh --keep`, senza toccare Supabase.

## Deploy su Vercel

1. Crea **due progetti** Vercel collegati allo stesso repo.
2. **Progetto “web”**: Root Directory = `apps/web`. Dominio principale (es. www.dominio.it).
3. **Progetto “admin”**: Root Directory = `apps/admin`. Dominio = `admin.dominio.it`.
4. In Supabase → Authentication → URL Configuration: aggiungi entrambe le URL nei Redirect URLs.

## Struttura repo

```
apps/web        → SPA pubblico
apps/admin      → SPA backoffice
packages/shared → Tipi e client Supabase (uso da web e admin)
supabase/       → schema.sql, rls.sql e migrazioni in rls-history/
docs/           → documentazione (vedi sotto)
```

## Documentazione

| File | Cosa contiene |
|------|----------------|
| [`docs/prossimi-passi.md`](docs/prossimi-passi.md) | **Punto di partenza.** Stato del lavoro e roadmap, con le decisioni tecniche prese e il perché |
| [`docs/CHANGELOG.md`](docs/CHANGELOG.md) | Registro delle modifiche, dalla più recente |
| [`docs/cursor_typescript_code_audit_review.md`](docs/cursor_typescript_code_audit_review.md) | Audit coerenza tipi DB ↔ shared ↔ app (chiuso) |
| [`docs/cursor_react_performance_and_bundle_siz.md`](docs/cursor_react_performance_and_bundle_siz.md) | Analisi bundle e runtime di `apps/web` con roadmap |
| [`docs/modifica-struttura-public.md`](docs/modifica-struttura-public.md) | Refactor del funnel pubblico a colonna singola |
| [`docs/lanyard-physics-ab.svg`](docs/lanyard-physics-ab.svg) | Confronto visivo fra i due motori fisici del lanyard |
| [`docs/test-manuale-locale.md`](docs/test-manuale-locale.md) | Come provare a mano il flusso passwordless in locale, senza Supabase né Vercel |
| `docs/security/` | Note sulle migrazioni RLS (quella del 2026-10-02 non è ancora applicata) |

## Database

Su un database Supabase nuovo gli script vanno eseguiti **in quest'ordine**, tutti
e sette (l'elenco è ripetuto in testa a `rls.sql`):

1. `supabase/schema.sql`
2. `supabase/rls.sql`
3. `supabase/rls-history/2026-04-17-ultra-strict-ticket-token.sql`
4. `supabase/rls-history/2026-04-17-ultra-strict-ticket-token-v2.sql`
5. `supabase/rls-history/2026-04-21-ticket-check-in.sql`
6. `supabase/rls-history/2026-10-01-contacts-sessions-formulas.sql`
7. `supabase/rls-history/2026-10-02-booking-endpoints.sql`

Fermarsi allo step 2 lascia la pagina ticket non funzionante, ma non espone mai
le prenotazioni: `rls.sql` è fail-closed su quella tabella.

## Route non pubblicizzate

Non linkate da nessuna parte, ma raggiungibili: da rimuovere o proteggere prima
della produzione se non servono più. Dettagli in `docs/CHANGELOG.md`.

- `/lanyard-rapier` (web) — la card del ticket col motore fisico precedente
  (Rapier). Il suo WASM (~840 kB gz) si scarica solo su questa route.
- `/demo/lanyard` (web) — confronto A/B fra il motore ufficiale e Rapier.
