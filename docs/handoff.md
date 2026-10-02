# Handoff — Underclub 2.0, messa in produzione (aggiornato 2026-10-01, sera)

Repo: `/Users/lucio/Desktop/underclub.it/underclub-2.0`, un monorepo pnpm:
- `apps/web`: sito pubblico, Vite + React, solo mobile, con funzioni Vercel in `api/`;
- `apps/admin`: backoffice;
- `packages/shared`: tipi condivisi;
- `supabase/`: SQL e test.

Da leggere per primi: `docs/prossimi-passi.md` sezione 9, poi `docs/CHANGELOG.md`,
poi `docs/dns-underclub.md`.

## Stato
- **Git:** `feat/passwordless-booking` unito in `master` (fast-forward) e
  pushato. `master` locale ha qualche commit di sola documentazione non ancora
  pushato. Il branch `feat/passwordless-booking` locale è rimasto indietro e si
  può cancellare.
- **DB (fatto):** le migrazioni 2026-10-01 e 2026-10-02 sono applicate in
  produzione, prima con un dry-run, poi dopo il backup
  `pgdumpall_20261001_1417.sql.gz`. Il buco di `issue_ticket_access_token` è
  chiuso.
- **DNS (fatto):** Resend per `reservations.` e `news.` (verificati, regione EU),
  DMARC `p=none`, Google Postmaster (verificato), `info@underclub.it` inoltrata
  con ImprovMX alla Gmail di Lucio (provato).
- **Vercel `underclub-2-0-web`, Preview (fatto):** env legate al branch `master`
  e flag `VITE_BOOKING_API=1` acceso, provato da capo a fondo sul DB di
  produzione.
  - Passati: prenotazione, conferma, ticket, email (SPF, DKIM e DMARC `PASS`,
    Reply-To `info@`), MY BOOKINGS, logout, recupero.
  - URL: `https://underclub-2-0-web-git-master-lucios-projects-aef0021a.vercel.app`
    (protetto da Vercel Authentication).
- **Vercel Production:** dal 2026-10-02 gira il sito nuovo, rilasciato da
  `main`, con la manutenzione accesa.
- **Dominio:** dal 2026-10-02 `underclub.it` (principale) e `www` (308 verso
  la root) sono su `underclub-2-0-web`, con la manutenzione accesa. Il vecchio
  progetto `underclub` resta senza domini: usa Supabase cloud, non ha dati da
  migrare e si elimina tra qualche settimana.

## Prossimi passi (in ordine)
1. ~~Revisione dei testi `COPY-DRAFT`~~ — **fatta il 2026-10-02**: tutti
   approvati, marcatori tolti. In privacy, Hetzner ha preso il posto di Supabase
   tra i responsabili e la data è ora quella del 2 ottobre (con il flag acceso):
   se il passaggio slitta di molto, va aggiornata.
2. ~~Env di Production~~ — **fatte il 2026-10-02** su `underclub-2-0-web`, tutte
   *sensitive* (lo impone il team): `TICKET_SECRET`, `IP_HASH_SECRET` e
   `CRON_SECRET` nuovi; `SUPABASE_SERVICE_ROLE_KEY` letta dalla VPS;
   `RESEND_API_KEY` **nuova**, una chiave Resend solo per Production (quella del
   Preview si può revocare senza toccare la produzione); `SUPABASE_URL`,
   `PUBLIC_SITE_URL=https://underclub.it`, `ALLOWED_ORIGINS=https://www.underclub.it`,
   `EMAIL_FROM`, `EMAIL_REPLY_TO`, `VITE_BOOKING_API=1`. Le env *sensitive* non
   si rileggono né si copiano tra ambienti: per ricaricarle si rigenerano.
3. ~~Pulizia~~ — **fatta il 2026-10-02**: cancellate in una transazione le
   prenotazioni di prova (1), i contatti (1, con sessioni e link in cascata) e
   i contatori (2). Il DB di produzione parte vuoto.
4. **Passaggio, con la manutenzione accesa** (decisione 2026-10-02: il sito
   va sul dominio ma resta chiuso al pubblico finché non è pronto):
   - in Production `MAINTENANCE_MODE=1` e `MAINTENANCE_BYPASS_SECRET` (hex,
     così il link non va codificato; Lucio lo salva perché la env *sensitive*
     non si rilegge);
   - ~~deploy di produzione~~ — **fatto il 2026-10-02**: `main` è il branch
     di rilascio (vedi "Rilasci" sotto), primo deploy con la manutenzione
     accesa, provato senza cookie (503 su pagine e API, ticket e file statici
     aperti);
   - ~~spostare i domini~~ — **fatto il 2026-10-02**: `underclub.it` e `www`
     sono su `underclub-2-0-web`. La root è il dominio principale (come
     `PUBLIC_SITE_URL`), `www` reindirizza alla root con un 308. Prima era il
     contrario (root → `www` con 307);
   - ~~verifica dal dominio vero~~ — **fatta il 2026-10-02**: senza cookie 503
     su pagine e API; con il link di accesso Lucio ha fatto una prenotazione
     completa (form, email, conferma, ticket, MY BOOKINGS), andata a buon fine.

   Rollback: rimettere i domini sul progetto `underclub` (con `www` principale).
   Il vecchio progetto si elimina solo settimane dopo.
5. **Dopo il passaggio:** verificare il cron `/api/cron/cleanup`, con "Run"
   dal pannello Cron o dai log delle 04:00.
6. **Admin (rimandato):** deploy e prova del check-in prima della prima serata
   vera, perché l'admin di produzione è quello di aprile e non conosce lo stato
   `pending`. Poi CRUD di eventi e formule, lista prenotazioni, guest list, e
   l'interruttore della manutenzione: flag in una tabella `site_settings`
   scritta dall'admin, letto dal middleware con una cache di ~30 s;
   `MAINTENANCE_MODE` resta come override. Cambia solo `readMaintenanceConfig`.
7. **Più avanti:**
   - la pulizia in fondo alla migrazione 2026-10-01 (step 1, 1b, 1c, poi 2-5);
   - `/lanyard-rapier` e `/demo/lanyard`;
   - la scelta per `About`, `Archive`, `Guests`;
   - `GET /api/session`: 401 o `200 null`.
   - gli errori TypeScript nei log di build di Vercel (15, tipo "Property
     'headers' does not exist on type 'Request'" in `server/`): non bloccano,
     c'erano già il 2026-10-01, in locale `tsc` passa. Probabile causa i tipi
     condizionali di `@types/node` 22 nel compilatore delle funzioni di Vercel.

## Decisioni già prese (non ridiscutere)
- Overbooking minimo accettato: le prenotazioni pending non tengono il posto.
- I consensi non si cambiano dal sito: si revocano via email a `info@`.
- Privacy di BotID: TODO futuro, non prioritario.
- I segreti di Production sono diversi da quelli del Preview. `TICKET_SECRET` di
  Production non va più cambiato dopo il passaggio.
- Nessun `rua=` nel DMARC: per il monitoraggio basta Postmaster.
- Il flusso di prenotazione vecchio non si usa da mesi e non tornerà: le
  prossime prenotazioni passeranno tutte dal flusso nuovo. Il recupero delle
  prenotazioni legacy e il flag spento non vanno più curati.

## Rilasci
- `master` è il branch di lavoro: ogni push crea un preview con le env del
  Preview (legate a `master`). `main` è il branch di produzione di Vercel:
  si rilascia con `git push origin master:main`.
- Il branch di produzione non può essere `master`: Vercel lo rifiuta perché
  le env del Preview sono legate a quel branch.

## Manutenzione (cose non ovvie)
- Routing Middleware in `apps/web/middleware.ts`, logica in
  `apps/web/server/maintenance.ts`. Con `MAINTENANCE_MODE=1`: pagine → 503 con
  la pagina di manutenzione, `/api/*` → 503 JSON; restano aperti il cron, i
  file statici e `/ticket/*`. `?bypass=<segreto>` dà un cookie httpOnly
  `uc_bypass` di 30 giorni (hash del segreto: cambiarlo revoca tutti).
- Accendere o spegnere = cambiare la env + Redeploy (circa 1-2 minuti).
- Provato il 2026-10-02 su un preview CLI con le env solo di runtime
  (`vercel deploy -e …`, lanciato dalla root del repo con `VERCEL_ORG_ID` e
  `VERCEL_PROJECT_ID`, perché il progetto ha Root Directory `apps/web`), e
  `vercel curl` per superare la protezione dei preview.

## Infrastruttura (cose non ovvie)
- **Supabase self-hosted:** VPS Hetzner `178.104.44.21`, host
  `supabase.luciogratani.it`, schema `underclub`. Documentazione in
  `~/Desktop/zukunft/server-vps/`. SQL via
  `ssh root@… "docker exec -i supabase-db psql -U supabase_admin -d postgres"`.
  Va usato `supabase_admin`, proprietario degli oggetti; `postgres` non è
  superuser.
- **DNS di `underclub.it`:** la zona è su Vercel, nel team
  `lucios-projects-aef0021a`, e si modifica con `vercel dns add`. Il dominio è
  di Ezio (registrar): deve solo tenere i nameserver Vercel e rinnovarlo, ed è
  già stato avvisato.
- **Permessi dell'assistente:** il classificatore della modalità auto blocca
  l'SSH verso la VPS, le modifiche DNS e il `dig` subito dopo una modifica, e
  anche la cancellazione di file locali. Si preparano i comandi, Lucio li lancia
  e incolla l'output. Lettura delle env e deploy di preview con la Vercel CLI
  invece funzionano.

## Come lavorare con l'utente
- Rispondere in italiano. Il CLAUDE.md globale è attivo: `## Summary` in testa,
  risposte concise, niente push né branch nuovi senza richiesta.
- Mai toccare Supabase, Vercel o Resend reali senza un ok esplicito, e
  chiedere conferma per ogni passo irreversibile.

## Trappole note dell'ambiente
- **Postgres locale per i test:** `supabase/tests/run.sh` (con `--keep` resta
  acceso) richiede `LC_ALL=C` e TCP su 127.0.0.1, ma l'harness lo gestisce già.
  Il bootstrap rispecchia i permessi della produzione: `service_role` senza
  usage sullo schema finché non lo concede la migrazione.
- **`pnpm build` / `tsc -b`** riscrivono `apps/web/tsconfig.tsbuildinfo`, che è
  tracciato: ripristinarlo con `git checkout` prima di committare.
- **`vercel link`** crea anche `apps/web/.env.local` (con un token OIDC, e Vite
  lo leggerebbe) e un `apps/web/.gitignore`: vanno tolti.
- **Il terminale di Lucio** apre nella root del repo: per i comandi `vercel env`
  serve `cd apps/web`.
