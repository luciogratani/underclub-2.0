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
- **Vercel Production: non toccata.** Gira ancora il deploy di aprile
  (`df95948`). Il branch di produzione del progetto è `main`, che non esiste,
  quindi ogni push crea solo preview.
- **Dominio:** `underclub.it` e `www` sono ancora collegati al vecchio progetto
  `underclub`, che va ignorato: usa Supabase cloud e non ha dati da migrare.

## Prossimi passi (in ordine)
1. **Revisione dei testi `COPY-DRAFT`** (`git grep COPY-DRAFT`, circa 133, tra UI,
   email e privacy). Idea: raccoglierli in una pagina per schermata da far
   approvare in blocco.
2. **Env di Production** su `underclub-2-0-web`, con segreti **nuovi**:
   - `TICKET_SECRET`, `IP_HASH_SECRET`, `CRON_SECRET`;
   - `SUPABASE_SERVICE_ROLE_KEY` e `RESEND_API_KEY` (si possono riusare);
   - `SUPABASE_URL=https://supabase.luciogratani.it`;
   - `PUBLIC_SITE_URL=https://underclub.it`;
   - `ALLOWED_ORIGINS=https://www.underclub.it`;
   - `EMAIL_FROM="Underclub <tickets@reservations.underclub.it>"`;
   - `EMAIL_REPLY_TO=info@underclub.it`;
   - `VITE_BOOKING_API=1`.

   I segreti li carica Lucio dalla cartella `apps/web`, che è già collegata con
   `vercel link`, così:
   `openssl rand -base64 48 | tr -d '\n' | vercel env add NOME production --sensitive`.
   La service role va prima letta in una variabile e poi passata alla CLI: se
   arriva in pipe direttamente da `ssh`, la CLI non la riceve in tempo e chiede
   `? Value?`. Comando completo nella chat del 2026-10-01; in sintesi:
   `k=$(ssh … "grep '^SERVICE_ROLE_KEY=' /opt/supabase/supabase/docker/.env | cut -d= -f2- | tr -d '\"\n'")`.
3. **Pulizia:** cancellare le prenotazioni di prova (`delete` da `reservations`,
   `contacts`, `request_throttle`, come `supabase_admin`, dentro una transazione).
4. **Passaggio:**
   - deploy di produzione di `master` (impostare il branch di produzione su
     `master`, oppure promuovere a mano);
   - spostare `underclub.it` e `www` da `underclub` a `underclub-2-0-web`;
   - verifica dal dominio vero.

   Rollback: rimettere i domini sul vecchio progetto. Il vecchio progetto si
   elimina solo settimane dopo.
5. **Dopo il passaggio:** verificare il cron `/api/cron/cleanup`, con "Run"
   dal pannello Cron o dai log delle 04:00.
6. **Admin (rimandato):** deploy e prova del check-in prima della prima serata
   vera, perché l'admin di produzione è quello di aprile e non conosce lo stato
   `pending`. Poi CRUD di eventi e formule, lista prenotazioni, guest list.
7. **Più avanti:**
   - la pulizia in fondo alla migrazione 2026-10-01 (step 1, 1b, 1c, poi 2-5);
   - `/lanyard-rapier` e `/demo/lanyard`;
   - la scelta per `About`, `Archive`, `Guests`;
   - `GET /api/session`: 401 o `200 null`.

## Decisioni già prese (non ridiscutere)
- Overbooking minimo accettato: le prenotazioni pending non tengono il posto.
- I consensi non si cambiano dal sito: si revocano via email a `info@`.
- Privacy di BotID: TODO futuro, non prioritario.
- I segreti di Production sono diversi da quelli del Preview. `TICKET_SECRET` di
  Production non va più cambiato dopo il passaggio.
- Nessun `rua=` nel DMARC: per il monitoraggio basta Postmaster.

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
