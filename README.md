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

## Variabili d'ambiente

- **apps/web** e **apps/admin**: in `.env` (vedi `.env.example`)
  - `VITE_SUPABASE_URL` — URL progetto Supabase
  - `VITE_SUPABASE_ANON_KEY` — chiave anonima (pubblica, sicura con RLS)
- Per le **serverless** (es. invio email) userai variabili nel progetto Vercel (es. `RESEND_API_KEY`), non nelle app frontend.

## Deploy su Vercel

1. Crea **due progetti** Vercel collegati allo stesso repo.
2. **Progetto “web”**: Root Directory = `apps/web`. Dominio principale (es. www.dominio.it).
3. **Progetto “admin”**: Root Directory = `apps/admin`. Dominio = `admin.dominio.it`.
4. In Supabase → Authentication → URL Configuration: aggiungi entrambe le URL nei Redirect URLs.

## Struttura repo

```
apps/web      → SPA pubblico
apps/admin     → SPA backoffice
packages/shared → Tipi e client Supabase (uso da web e admin)
```

---

## Note di inizializzazione (chat di setup)

*Questo blocco documenta le scelte fatte in fase di setup; puoi dare questo file in pasto alle chat successive per contesto.*

- **Solo versione mobile** — per ora si sviluppa solo la versione mobile (layout/UX da pensare mobile-first).
- **Tailwind CSS v4** — installato in **web** e **admin**:
  - Pacchetti: `tailwindcss@^4.0.0`, `@tailwindcss/vite@^4.0.0` (devDependencies).
  - Config: plugin `@tailwindcss/vite` in `vite.config.ts`; **niente** PostCSS né `tailwind.config.js`.
  - CSS: in `src/index.css` di entrambe le app c’è `@import "tailwindcss";` in cima (il resto del file è reset/base custom).
  - Per temi/colori custom in v4 si usa la config in CSS (`@theme` in un file CSS), non il config JS.
- **packages/shared** — al momento è uno stub (solo `export {}`); tipi e client Supabase vanno aggiunti quando si inizia a usare il DB.
- **React 19** + **React Router 7** + **Vite 6** + **TypeScript 5.6** — stack confermato per entrambe le app.
- **Frontend solo web** — tutto il lavoro di frontend da qui in poi riguarda **solo** `apps/web`. L’admin si trascura fino a quando non serve ragionarci.

**Quando ha senso ragionare anche sull’admin** (segnalarlo nella chat):
- Definizione o modifica di **tipi/API in `packages/shared`** (auth, modelli DB, client Supabase): web e admin li useranno entrambi.
- **Auth / ruoli**: chi può fare cosa (anonimo, utente, admin) e come l’admin protegge le route.
- **Struttura dati** per serate e prenotazioni: il pubblico le vede/crea, l’admin le gestisce; allineare nomi e campi.
- **Funzioni serverless** (es. invio email, webhook): spesso servono sia al flusso pubblico sia al backoffice.
- Quando si inizia a **buildare le schermate admin** (liste, form, dashboard).
