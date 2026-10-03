# Handoff — Underclub 2.0 (aggiornato 2026-10-04)

Repo: `/Users/lucio/Desktop/underclub.it/underclub-2.0`, un monorepo pnpm:
- `apps/web`: sito pubblico, Vite + React, solo mobile, con funzioni Vercel in
  `api/` (logica in `server/`) e Routing Middleware in `middleware.ts`;
- `apps/admin`: backoffice, Vite + React + shadcn, su `admin.underclub.it`;
- `packages/shared`: tipi del DB, mapper, contratto delle API;
- `supabase/`: SQL (`schema.sql`, `rls.sql`, `rls-history/`) e test;
- `scripts/dev-stack/`: stack locale per provare il sito.

Da leggere dopo questo file:
- `docs/CHANGELOG.md`: le voci dal 2026-10-01 al 2026-10-04;
- `docs/presenza-online.md`: SEO, Google, RA, link tracciati;
- `docs/test-manuale-locale.md`: stack locale;
- `docs/dns-underclub.md`.

## Stato in una riga
Sito e admin sono **in produzione**:
- `underclub.it` è ancora **in manutenzione**: il pubblico vede "We'll be back
  soon", il team entra con il link di accesso;
- `admin.underclub.it` è attivo, con il login riservato agli admin in lista.

**Obiettivo: lancio il 2026-10-05.** Lucio guiderà modifiche mirate: poche sul
sito, molte sull'admin.

## Stato nel dettaglio
- **Git:**
  - si lavora su `master`; `main` è il branch di produzione di **entrambi** i
    progetti Vercel;
  - in produzione c'è `main` = `83ae7cc` (rilasciato il 2026-10-04);
  - su `master` ci sono, in più, solo commit di documenti e script, non
    pushati alla chiusura della sessione del 2026-10-04: controllare con
    `git log origin/master..master`;
  - esistono solo `master` e `main`, i branch di lavoro sono stati cancellati.
- **DB (Supabase di produzione):**
  - applicate tutte le migrazioni fino a `2026-10-03-admin-allowlist.sql`;
  - backup giornalieri del cluster alle 05:30 sulla VPS; l'ultimo manuale è
    `pgdumpall_20261001_1417.sql.gz`;
  - contiene solo dati di prova: la serata "TECHNOROOM: Solita serata"
    (11/11/2027) con prenotazioni, contatti e contatori di prova. **Si
    cancellano al lancio** (comandi più sotto).
- **Vercel `underclub-2-0-web`** (team `lucios-projects-aef0021a`, piano
  **Hobby**):
  - Production: env tutte *sensitive*: `PUBLIC_SITE_URL=https://underclub.it`,
    `ALLOWED_ORIGINS=https://www.underclub.it`, `MAINTENANCE_MODE=1`,
    `MAINTENANCE_BYPASS_SECRET`, segreti propri, chiave Resend solo per
    Production. `VITE_BOOKING_API` non è più letta dal codice: si può
    togliere.
  - Preview: env legate al branch `master`, senza manutenzione.
- **Vercel `underclub-2-0-admin`:**
  - dominio `admin.underclub.it`, con certificato `*.underclub.it`; anche
    `underclub-2-0-admin.vercel.app`;
  - branch di produzione `main`, come il sito (cambiato il 2026-10-04 via
    `vercel api`);
  - env `VITE_SUPABASE_URL=https://supabase.luciogratani.it` e la chiave anon;
  - mai indicizzato: `X-Robots-Tag` noindex su ogni risposta più meta
    `robots`;
  - header di sicurezza: niente incorporamento in altre pagine, `no-referrer`,
    `nosniff`, fotocamera concessa solo all'admin (scanner QR);
  - icone proprie: il segno del sito con i colori invertiti.
- **Dominio:**
  - `underclub.it` è il principale; `www` reindirizza alla root con un 308;
  - `admin.underclub.it` punta all'admin;
  - il vecchio progetto Vercel `underclub` è stato cancellato il 2026-10-04.
- **Email e DNS:**
  - Resend per `reservations.` e `news.` (EU), DMARC `p=none`, Google
    Postmaster verificato;
  - `info@underclub.it` è inoltrata con ImprovMX alla Gmail di Lucio;
  - dettagli in `dns-underclub.md`.
- **SEO:**
  - icone, manifest, OG, dati strutturati `NightClub` statici;
  - `MusicEvent` iniettato per la serata in home;
  - `robots.txt` e `sitemap.xml`, `noindex` sulle pagine personali;
  - dettagli in `presenza-online.md`.

## Cosa fa il sito oggi (in breve)
- **Prenotazione senza password:** il form crea una prenotazione `pending` e
  un link email; aprirlo la conferma e crea la sessione (`uc_session`, 12
  mesi). Con la sessione, le prenotazioni successive si confermano subito.
  Ci sono MY BOOKINGS, la disdetta e il recupero via email.
- **Fine serata:** le **06:00 di Roma del giorno dopo** la data, ovunque.
  È la regola SQL `event_ends_at`.
- **Chiusura online:** `events.booking_closes_at`, default **18:00 della data**
  (`event_booking_deadline`). Dopo la chiusura la serata resta in home con
  "BOOKING CLOSED" e "tickets at the door". Un pending chiesto prima della
  chiusura si conferma anche dopo.
- **Home:**
  - all'inizio carica, e si vede solo l'anello (al massimo 5 s);
  - poi la home con la serata, oppure la home **FOLLOW US** con i social,
    se non c'è una serata;
  - in caso di errore, la stessa home con un messaggio neutro.
- **Ticket:** il QR si apre con `open_public_ticket`; a serata finita compare
  il messaggio "expired".
- **Database dal browser:** legge solo le serate pubblicate, il conteggio dei
  posti e il ticket con il token. Le prenotazioni passano solo dagli
  endpoint `/api/*`, con la service role.

## Piano per il lancio (2026-10-05)

### A. Admin (la parte grossa)
Oggi l'admin ha login e check-in funzionanti:
- il check-in conosce `pending` e le formule scadute, e rifiuta chi non è
  in lista;
- Events, Reservations, Guest list, Archive e Analytics sono segnaposto;
- la Home mostra statistiche finte.

**Domande a Lucio ancora aperte**, da chiudere all'inizio:
1. cosa serve per la prima serata, e cosa dopo;
2. dispositivi: telefono alla porta, computer per creare le serate?
3. azioni sulle prenotazioni: disdetta e aggiunta manuale dall'admin?
4. lingua dell'interfaccia: oggi è mista.

Già risposto: l'admin lo usano Lucio e alcuni colleghi o capi. Ognuno avrà
il suo account.

**Proposta minima per la prima serata:**
- creare e modificare le serate: titolo, data, orario, stato
  bozza/pubblicata, lineup, formule (prezzo, nota, quota, `valid_until`) e
  `booking_closes_at`;
- lista delle prenotazioni per serata, che fa anche da guest list con
  ricerca alla porta;
- nel check-in, l'avviso per un ticket di un'altra serata (oggi
  `scan_ticket_check_in` non controlla la data);
- Home con numeri veri.

Dopo: Archive, Analytics, interruttore della manutenzione (`site_settings`).

**Cose tecniche da sapere per l'admin:**
- **Permessi:** l'admin usa supabase-js con la sessione dell'utente
  (`authenticated`). Le policy `admin_all_*` danno CRUD completo su
  `events`, `event_artists`, `event_entries` e `reservations`, ma **solo** se
  `underclub.is_admin()` è vero. Su `contacts` l'admin può solo leggere.
- **Nomi ed email:** `toAdminReservationView` (`packages/shared`) legge ancora
  nome ed email dalle colonne legacy di `reservations`. Le prenotazioni nuove
  hanno nome ed email in `contacts`, collegati con `contact_id`, quindi la
  lista va fatta unendo `contacts`.
- **Pulizia rimandata:** gli step 1b, 4 e 5 della migrazione 2026-10-01
  (togliere le colonne legacy di `reservations`) si fanno solo dopo questo.
- **Dove provare:** in locale l'admin non ha un login di Supabase. Si prova
  con `pnpm dev:admin` (porta 5174) contro la produzione, che oggi contiene
  solo dati di prova: **le scritture sono vere**.
- **Ruoli:** `admin_users.role` oggi ammette solo `admin`. Un ruolo per lo
  staff alla porta, limitato al check-in, richiede una migrazione.
- **Sicurezza da fare** (vedi "Sicurezza"): verifica in due passaggi (MFA)
  nel login, più avanti.

### B. Sito (pochi ritocchi, guidati da Lucio)
In coda, se Lucio vuole:
- la revisione del menu: menu nascosto su Book Now, bottone ticket in basso
  a sinistra;
- un paragrafo vero in `/info`;
- `About`, `Archive` e `Guests`, che non sono montati da nessuna parte;
- se `/lanyard-rapier` e `/demo/lanyard` debbano restare pubblici;
- `GET /api/session` senza sessione risponde 401 (errore rosso nella console,
  solo estetico).

### C. Checklist del lancio, in ordine
1. **Rilascio finale** con `git push origin master:main` (dopo le eventuali
   migrazioni). Porta in produzione sito e admin insieme.
2. **Account admin** per i colleghi. Si crea l'utente in Supabase
   (Authentication → Add user), poi si registra in lista (comando sotto).
3. **Dati di prova:** cancellare serata, prenotazioni, contatti e contatori
   di prova (comando sotto).
4. **Serate vere:** crearle dall'admin, oppure in SQL se l'admin non è pronto.
5. **Manutenzione spenta:** `MAINTENANCE_MODE` tolta o messa a `0` in
   Production su `underclub-2-0-web`, poi Redeploy. Prova da un browser
   senza il cookie di accesso.
6. **Cron:** verificare `/api/cron/cleanup` (log delle 04:00 o "Run" dal
   pannello Cron). **Mai controllato finora.**
7. **Search Console:** proprietà di dominio e invio della sitemap. Prova del
   `MusicEvent` con il Rich Results Test.
8. **Google Business:** rivendicare la scheda. RA è a posto (vedi
   `presenza-online.md`).
9. **Facoltativo:** togliere la env `VITE_BOOKING_API`.

**Da sapere:**
- il piano Hobby di Vercel è riservato all'uso **non commerciale**: un locale
  con prenotazioni è uso commerciale, valutare il piano Pro;
- l'icona del sito nelle card di Vercel dovrebbe comparire a manutenzione
  spenta.

## Sicurezza (stato e aperti)
**Fatto:**
- `anon` non ha accessi a `reservations` né alla vecchia RPC di prenotazione;
- iscrizione a Supabase chiusa (`disable_signup: true`) e utenti anonimi
  spenti;
- lista degli admin: `underclub.admin_users` più `underclub.is_admin()`;
- admin non indicizzato, con gli header di sicurezza.

**Il login di Supabase è condiviso** con foras/University e alex_akashi:
- la lista degli admin è dentro lo schema `underclub` e **non** in
  `public.tenants` di foras. Altrimenti il runner delle migrazioni di foras
  applicherebbe le sue a Underclub;
- oggi in `public.tenants` ci sono solo `template` e `university`;
- l'iscrizione chiusa deve restare così: un nuovo account non vedrebbe
  Underclub, ma potrebbe entrare negli altri progetti.

**Aperti:**
- **Limite dei tentativi di login.** GoTrue (v2.186) gira senza variabili
  `RATE_LIMIT_*`. Senza `GOTRUE_RATE_LIMIT_HEADER`, dietro Caddy e Kong, il
  limite per IP sull'endpoint `/token` probabilmente non protegge: o non
  limita, o usa un unico contatore per tutti, e un bot potrebbe bloccare i
  login di Underclub e foras.
  - Correzione: Caddy imposta un header con l'IP vero non falsificabile
    (per esempio `X-Real-IP`), e si imposta `GOTRUE_RATE_LIMIT_HEADER`.
  - È una modifica di tutta l'istanza: va fatta con foras, la lancia Lucio.
  - Nel frattempo: password lunghe e casuali, un account per persona.
- **MFA** nel login dell'admin (TOTP, supportato da Supabase).
- **`.git` annidata:** in `apps/admin` c'è una vecchia cartella `.git`. La
  repo principale traccia normalmente i file, ma un `git status` lanciato
  dentro `apps/admin` mostra la vecchia repo. Va guardata prima di
  rimuoverla.

## Comandi utili (li lancia Lucio: SSH e DNS sono bloccati per l'assistente)
SQL sulla VPS:
```bash
ssh root@178.104.44.21 "docker exec -i supabase-db psql -v ON_ERROR_STOP=1 -U supabase_admin -d postgres"
```
Migrazione (sempre `--single-transaction`):
```bash
ssh root@178.104.44.21 "docker exec -i supabase-db psql -v ON_ERROR_STOP=1 --single-transaction -U supabase_admin -d postgres" < supabase/rls-history/<file>.sql
```
Registrare un admin (l'utente va prima creato in Supabase):
```bash
ssh root@178.104.44.21 "docker exec -i supabase-db psql -v ON_ERROR_STOP=1 -U supabase_admin -d postgres" <<'SQL'
insert into underclub.admin_users (user_id)
select id from auth.users where email = '<email>'
on conflict (user_id) do nothing;
select u.email, a.role from underclub.admin_users a join auth.users u on u.id = a.user_id;
SQL
```
Cancellare i dati di prova, **solo prima dell'apertura**. Le sessioni e i link
se ne vanno in cascata con i contatti; artisti e formule con la serata:
```bash
ssh root@178.104.44.21 "docker exec -i supabase-db psql -v ON_ERROR_STOP=1 --single-transaction -U supabase_admin -d postgres" <<'SQL'
delete from underclub.reservations;
delete from underclub.contacts;
delete from underclub.request_throttle;
delete from underclub.events where title = 'TECHNOROOM: Solita serata';
SQL
```
Controllare l'iscrizione chiusa (chiave anon pubblica, nel bundle del sito):
```bash
curl -s https://supabase.luciogratani.it/auth/v1/settings -H "apikey: <chiave anon>" | grep -oE '"(disable_signup|anonymous_users)":[a-z]*'
```

## Decisioni già prese (non ridiscutere)
- Overbooking minimo accettato: le prenotazioni pending non tengono il posto.
- I consensi non si cambiano dal sito: si revocano via email a `info@`.
- Privacy di BotID: TODO futuro, non prioritario.
- I segreti di Production sono diversi da quelli del Preview. `TICKET_SECRET` di
  Production non va più cambiato.
- Nessun `rua=` nel DMARC: per il monitoraggio basta Postmaster.
- Il vecchio flusso di prenotazione anonimo è chiuso, e il flag
  `VITE_BOOKING_API` non esiste più.
- La root `underclub.it` è il dominio principale; il sito si apre quando lo
  decide Lucio.
- Statistiche rimandate: per ora basta `reservations.source` (`?src=`).
- Fine serata alle 06:00 di Roma del giorno dopo; chiusura online di default
  alle 18:00 della data, modificabile per serata, senza vincolo nel DB.
- Home senza serate: opzione A, cioè la Hero con la pill "FOLLOW US" e il
  pannello dei social.
- Admin: lista degli admin nello schema `underclub`, un account per persona,
  branch di produzione `main`, mai indicizzato. Niente `Disallow` nel
  `robots.txt`, così i crawler leggono il `noindex`.

## Rilasci
- `master` è il branch di lavoro: ogni push crea i preview di sito e admin.
  `main` è la produzione di entrambi: si rilascia con
  `git push origin master:main`.
- Ordine: prima le migrazioni (le lancia Lucio), poi il push su `main`. Le
  migrazioni si scrivono compatibili con il codice già online.
- Lucio può chiedere di andare "dritti in produzione" senza fermarsi al
  preview.
- Preview di prova del sito senza push, dalla **root del repo**:
  `VERCEL_ORG_ID=team_ZBmn3O0eWhlkzdw29iSyVLDv VERCEL_PROJECT_ID=prj_ts2sgVDwuMA52XRbmAY4YUWjH0D0 vercel deploy --yes`.
  I preview sono protetti: si leggono con `vercel curl` o dal browser di
  Lucio, loggato su Vercel.
- Admin: progetto `prj_YtkXYNpCGA2Pu66WJckSTyhRjV6x`. Le impostazioni che la
  CLI non espone si cambiano con `vercel api`, per esempio il branch di
  produzione con `PATCH /v9/projects/<id>/branch`.

## Manutenzione (cose non ovvie)
- Middleware in `apps/web/middleware.ts`, logica in
  `apps/web/server/maintenance.ts`. Con `MAINTENANCE_MODE=1`: pagine → 503 con
  la pagina di manutenzione, `/api/*` → 503 JSON; restano aperti il cron, i
  file statici e `/ticket/*`.
- Link di accesso: `https://underclub.it/?bypass=<segreto>` (lo ha Lucio nel
  password manager; la env non si rilegge). Dà un cookie httpOnly `uc_bypass`
  di 30 giorni, valido solo per il dominio su cui lo si apre.
- Accendere o spegnere = cambiare la env + Redeploy (1-2 minuti).
- Gli anteprimatori dei link (WhatsApp, Facebook, Telegram, X, LinkedIn,
  Slack, Discord) ricevono la pagina con un 200, per mostrare la scheda di
  condivisione. Google e i visitatori restano sul 503.

## Infrastruttura (cose non ovvie)
- **Supabase self-hosted:** VPS Hetzner `178.104.44.21` (Norimberga), host
  `supabase.luciogratani.it`; `supabase.web-pr.it` è la stessa istanza,
  usata da foras. Schema `underclub`.
  - Va usato `supabase_admin`, proprietario degli oggetti: `postgres` non è
    superuser.
  - Documentazione in `~/Desktop/zukunft/server-vps/`, e per foras in
    `~/Desktop/University/university/docs/university/note/infrastruttura.md`.
  - Mai riavviare `supabase-rest`: interrompe anche gli altri progetti. Per
    ricaricare PostgREST si usa `notify pgrst, 'reload schema'`, che le
    migrazioni già fanno.
- **DNS di `underclub.it`:** zona su Vercel, team `lucios-projects-aef0021a`.
  - Il dominio è di Ezio (registrar): tiene i nameserver Vercel e lo rinnova.
  - Mai `vercel domains rm`: toglierebbe il dominio, con la zona, da tutto il
    team.
  - Un sottodominio si collega a un progetto con
    `vercel domains add <dominio> <progetto>`.
- **Permessi dell'assistente:** il classificatore della modalità auto blocca
  l'SSH verso la VPS e le modifiche DNS. Si preparano i comandi, Lucio li
  lancia e incolla l'output. Funzionano: lettura delle env, deploy di preview,
  `vercel curl`, `vercel api`, `gh`.
- **Browser:** l'estensione Chrome di Claude non è sempre collegata. In quel
  caso si usa Chrome headless con `playwright-core`, installato nella
  scratchpad e puntato su `/Applications/Google Chrome.app`.

## Come lavorare con l'utente
- Rispondere in italiano. Il CLAUDE.md globale è attivo: `## Summary` in testa,
  risposte concise, niente push né branch nuovi senza richiesta.
- Mai toccare Supabase, Vercel o Resend reali senza un ok esplicito, e chiedere
  conferma per ogni passo irreversibile. Le cose che si cancellano (progetti,
  dati) si guardano prima.
- I segreti non passano mai dalla chat: comandi con `openssl rand` o `pbpaste`
  in pipe verso `vercel env add … --sensitive`. Le password le inserisce Lucio.
- Testi nuovi per gli utenti: bozza marcata `COPY-DRAFT`, approvazione di
  Lucio, poi si toglie il marcatore. Oggi nel codice non ce ne sono.
- La cartella di lavoro può essere condivisa con altre sessioni: controllare
  `git status` e il branch prima di committare.

## Trappole note dell'ambiente
- **Postgres locale:** `supabase/tests/run.sh` (con `--keep` resta acceso)
  richiede `LC_ALL=C` e TCP su 127.0.0.1, e l'harness lo gestisce già.
  - Il bootstrap ha uno schema `auth` minimo (`auth.users`, `auth.uid()`).
  - Le fixture hanno due utenti: `…0001`, admin di Underclub, e `…0002`,
    utente di un altro progetto.
  - Per agire come un utente nei test: `test.as_admin()` o
    `test.as_other_project_user()`, poi `set local role authenticated`.
- **Output di `run.sh --keep`:** va mandato su un file, non in una pipe. Il
  Postgres che resta acceso terrebbe la pipe aperta.
- **I processi in background** dell'assistente muoiono con la sessione. Lo
  stack locale si riavvia con `scripts/dev-stack/start.sh`.
- **`pnpm build` / `tsc -b`** riscrivono `apps/*/tsconfig.tsbuildinfo`, che
  sono tracciati: ripristinarli con `git checkout` prima di committare.
- **`vercel link`** crea anche `apps/web/.env.local` (con un token OIDC, e Vite
  lo leggerebbe) e un `apps/web/.gitignore`: vanno tolti.
- **`apps/web/.env` e `apps/admin/.env` locali** puntano a
  `supabase.web-pr.it`, cioè la stessa istanza. Lo stack locale li sovrascrive
  dalla riga di comando.
- **Il terminale di Lucio** apre nella root del repo: per i comandi `vercel env`
  serve `cd apps/web`.
