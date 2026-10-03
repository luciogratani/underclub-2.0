# Handoff — Underclub 2.0 (aggiornato 2026-10-02, sera)

Repo: `/Users/lucio/Desktop/underclub.it/underclub-2.0`, un monorepo pnpm:
- `apps/web`: sito pubblico, Vite + React, solo mobile, con funzioni Vercel in
  `api/` e Routing Middleware in `middleware.ts`;
- `apps/admin`: backoffice (quello in produzione è ancora di aprile);
- `packages/shared`: tipi condivisi;
- `supabase/`: SQL e test.

Da leggere dopo questo file: `docs/CHANGELOG.md` (voci del 2026-10-01 e 02),
`docs/presenza-online.md` (SEO, Google, RA, link tracciati),
`docs/prossimi-passi.md` sezione 9, `docs/dns-underclub.md`.

## Stato in una riga
Il sito nuovo è **in produzione su `underclub.it`, in manutenzione**: il
pubblico vede la pagina "We'll be back soon", il team entra con il link di
accesso e il sito funziona da capo a fondo (prenotazione, email, ticket, MY
BOOKINGS) sul DB di produzione.

## Stato nel dettaglio
- **Git:** si lavora su `master`; `main` è il branch di produzione di Vercel
  (vedi "Rilasci"). Il branch locale `feat/passwordless-booking` è vecchio e si
  può cancellare.
- **DB:** migrazioni 2026-10-01 e 2026-10-02 applicate in produzione (backup
  `pgdumpall_20261001_1417.sql.gz` sulla VPS). Contiene le prenotazioni di
  prova fatte in manutenzione: si cancellano all'apertura.
- **Vercel `underclub-2-0-web`:**
  - Production: env complete e tutte *sensitive* (impostazione del team), con
    segreti propri e una API key Resend solo per Production;
    `PUBLIC_SITE_URL=https://underclub.it`, `ALLOWED_ORIGINS=https://www.underclub.it`,
    `VITE_BOOKING_API=1`, `MAINTENANCE_MODE=1`, `MAINTENANCE_BYPASS_SECRET`.
  - Preview: env legate al branch `master`, flag acceso, senza manutenzione.
- **Dominio:** `underclub.it` è il principale, `www` reindirizza alla root con
  un 308. Il vecchio progetto Vercel `underclub` è senza domini e si elimina tra
  qualche settimana (usava Supabase cloud, nessun dato da migrare).
- **Email e DNS:** Resend per `reservations.` e `news.` (EU), DMARC `p=none`,
  Google Postmaster verificato, `info@underclub.it` inoltrata con ImprovMX alla
  Gmail di Lucio. Dettagli in `dns-underclub.md`.
- **SEO e condivisione:** icone, manifest, OG, titolo e descrizione, dati
  strutturati `NightClub`, `robots.txt`, `sitemap.xml`, `noindex` sulle pagine
  personali. Dettagli e lavoro fuori dal sito in `presenza-online.md`.

## Prossimi passi
1. **Cron:** verificare `/api/cron/cleanup` (log delle 04:00 o "Run" dal
   pannello Cron). Non ancora fatto.
1b. **Home senza serate, caricamento, fine serata, chiusura prenotazioni**
   (fatto il 2026-10-02 sera sul branch `feat/home-no-events`, mai pushato; da
   rivedere e rilasciare). Il dettaglio è nel CHANGELOG. In breve:
   - **Fine serata:** le 06:00 di Roma del giorno dopo la data, ovunque.
   - **Chiusura online:** colonna `events.booking_closes_at`, default 18:00
     della data, senza vincolo nel DB. Un pending chiesto prima della chiusura
     si conferma anche dopo.
   - **Home:** prima solo l'anello che carica, poi una sola delle due home. Tra
     la chiusura e la fine serata la serata resta in home con "BOOKING CLOSED".
   - **Ticket:** a serata finita mostra il messaggio "expired".

   **Revisione di Lucio (2026-10-03): fatta.**
   - Testato in locale scenario per scenario, tutto superato: caricamento,
     prenotazione e conferma, chiusura, chiusura a form aperto, errore,
     timeout, nessuna serata, ticket senza serata, serata finita.
   - Approvati i testi ("we couldn't load the dates. try again later.",
     "BOOKING CLOSED", "tickets at the door", "hey, this ticket has expired!
     hope you made good use of it!"), la pill chiusa lime al 45 % e la
     posizione del messaggio di errore.
   - Resta: il pannello FOLLOW US non riporta il focus sulla pill quando si
     chiude.

   **Passi per il rilascio, in quest'ordine:**
   1. Migrazione in produzione (la lancia Lucio). È compatibile con il sito
      oggi online, quindi va applicata **prima** del rilascio:
      ```bash
      ssh root@178.104.44.21 "docker exec -i supabase-db psql -v ON_ERROR_STOP=1 --single-transaction -U supabase_admin -d postgres" < supabase/rls-history/2026-10-02-night-end-booking-close.sql
      ```
      Controllo: deve tornare la serata di prova con `booking_deadline` e
      `ends_at`:
      ```bash
      ssh root@178.104.44.21 "docker exec -i supabase-db psql -U supabase_admin -d postgres -c \"select title, date, underclub.booking_deadline(e), underclub.ends_at(e), underclub.is_over(e) from underclub.events e\""
      ```
   2. Merge di `feat/home-no-events` in `master` e push di `master`: il preview
      usa lo stesso DB, quindi si prova lì. Poi `git push origin master:main`.
   3. Cancellazione della serata di prova ("TECHNOROOM: Solita serata"), così
      la home mostra subito FOLLOW US. Prima le sue prenotazioni (le
      `reservations` non vanno in cascata; i link di attivazione sì):
      ```bash
      ssh root@178.104.44.21 "docker exec -i supabase-db psql -v ON_ERROR_STOP=1 --single-transaction -U supabase_admin -d postgres" <<'SQL'
      delete from underclub.reservations r using underclub.events e
       where e.id = r.event_id and e.title = 'TECHNOROOM: Solita serata';
      delete from underclub.events where title = 'TECHNOROOM: Solita serata';
      SQL
      ```
   - **Ancora aperto:** lo scanner (avviso per un ticket di un'altra serata;
     `scan_ticket_check_in` non controlla la data) passa all'admin. Anche la
     chiusura impostata dall'admin arriva con il CRUD degli eventi.
2. **Lavori sul sito prima dell'apertura:** il motivo della manutenzione.
   Lucio dirà quali; in coda c'è la revisione del menu (fatto in autonomia il
   2026-10-01, mai visto da Lucio: menu nascosto su Book Now, bottone ticket in
   basso a sinistra).
3. **Presenza online:** RA fatto (pagina approvata, eventi uniti), scheda
   Google da rivendicare, Search Console all'apertura. Vedi `presenza-online.md`.
4. **Admin, prima della prima serata vera** (oggi l'admin ha solo login e
   check-in funzionanti; Events, Reservations, Guest list, Archive e Analytics
   sono segnaposto, la Home ha statistiche finte; il DB ha già le policy
   `admin_all_*` per scrivere eventi, artisti e formule, e le serate si creano
   in SQL): deploy e prova del check-in
   (l'admin di aprile non conosce lo stato `pending`), poi CRUD di eventi e
   formule, lista prenotazioni, guest list con ricerca alla porta, interruttore
   della manutenzione (flag in una tabella `site_settings` scritto dall'admin e
   letto dal middleware con una cache di ~30 s; `MAINTENANCE_MODE` resta come
   override; cambia solo `readMaintenanceConfig`).
5. **Apertura al pubblico (quando lo decide Lucio):**
   - **serata di prova** ("TECHNOROOM: Solita serata"): se non è già stata
     cancellata al punto 1b, toglierla con il comando che si trova lì;
   - cancellare i dati di prova, in una transazione come `supabase_admin`:
     `delete from underclub.reservations; delete from underclub.contacts;
     delete from underclub.request_throttle;` (sessioni e link vanno via in
     cascata con i contatti). Solo finché ci sono dati di prova: dopo
     l'apertura non va più usato così;
   - `MAINTENANCE_MODE` tolta o a `0` in Production, poi Redeploy;
   - Search Console: proprietà di dominio e invio della sitemap.
6. **Più avanti:**
   - dati strutturati `MusicEvent` per ogni serata e un paragrafo vero in
     `/info` (generi, sale, ex Pancho Villa, tavoli, eventi privati);
   - pulizia in fondo alla migrazione 2026-10-01 (step 1, 1b, 1c, poi 2-5), più
     semplice ora che il flusso vecchio è abbandonato;
   - `About`, `Archive`, `Guests`: tenerle, toglierle o spostarle;
   - `/lanyard-rapier` e `/demo/lanyard`: pubbliche o no;
   - `GET /api/session` senza sessione: 401 o `200 null`;
   - errori TypeScript nei log di build di Vercel (15, tipo "Property 'headers'
     does not exist on type 'Request'" in `server/`): non bloccano, c'erano già
     il 2026-10-01, in locale `tsc` passa; probabile causa i tipi condizionali
     di `@types/node` 22 nel compilatore delle funzioni di Vercel;
   - statistiche delle provenienze nell'admin (per ora basta sapere chi prenota
     da RA, vedi `presenza-online.md`).

## Home senza serate: dove va il testo (scelta A, 2026-10-02, fatta)
La Hero di oggi: card lime al 95 %×88 % con l'anello che gira, pill nera
"NEXT DATE →" in basso al centro, bottone ticket in basso a sinistra, menu in
basso a destra. Il centro dell'anello è vuoto.
- **A (scelta da Lucio):** stessa Hero; al posto della pill "NEXT DATE →" una pill
  uguale "STAY TUNED" o "FOLLOW US" che apre un pannello come quello del menu,
  con Instagram, Facebook e WhatsApp. L'anello (` < NEXT DATE > ??.??`) dice già
  che non ci sono date: nessun altro testo. Etichetta della pill:
  **"FOLLOW US"** (scelta da Lucio), con la freccia come "NEXT DATE".
- **B (scartata):** testo breve dentro l'anello, al centro ("no dates yet" + una riga), e
  sotto, al posto della pill, una riga di icone social cliccabili.
In entrambi i casi menu e bottone ticket restano dove sono.

## Decisioni già prese (non ridiscutere)
- Overbooking minimo accettato: le prenotazioni pending non tengono il posto.
- I consensi non si cambiano dal sito: si revocano via email a `info@`.
- Privacy di BotID: TODO futuro, non prioritario.
- I segreti di Production sono diversi da quelli del Preview. `TICKET_SECRET` di
  Production non va più cambiato.
- Nessun `rua=` nel DMARC: per il monitoraggio basta Postmaster.
- Il flusso di prenotazione vecchio non si usa da mesi e non tornerà: recupero
  delle prenotazioni legacy e flag spento non vanno più curati.
- Il sito va sul dominio in manutenzione e si apre quando Lucio lo decide.
- La root `underclub.it` è il dominio principale.
- Statistiche rimandate: per ora basta `reservations.source` (`?src=`).

## Rilasci
- `master` è il branch di lavoro: ogni push crea un preview con le env del
  Preview (legate a `master`). `main` è il branch di produzione: si rilascia
  con `git push origin master:main` (di solito lo lancia Lucio).
- Il branch di produzione non può essere `master`: Vercel lo rifiuta perché le
  env del Preview sono legate a quel branch.
- Preview di prova senza toccare le env del progetto: dalla **root del repo**
  `VERCEL_ORG_ID=team_ZBmn3O0eWhlkzdw29iSyVLDv VERCEL_PROJECT_ID=prj_ts2sgVDwuMA52XRbmAY4YUWjH0D0 vercel deploy --yes`,
  con `-e NOME=valore` per env solo di quel deploy (il progetto ha Root
  Directory `apps/web`). I preview sono protetti: si leggono con `vercel curl`.
  Vercel aggiunge `noindex` a tutte le pagine dei preview.

## Manutenzione (cose non ovvie)
- Middleware in `apps/web/middleware.ts`, logica in
  `apps/web/server/maintenance.ts`. Con `MAINTENANCE_MODE=1`: pagine → 503 con
  la pagina di manutenzione, `/api/*` → 503 JSON; restano aperti il cron, i
  file statici e `/ticket/*`.
- Link di accesso: `https://underclub.it/?bypass=<segreto>` (lo ha Lucio nel
  password manager; la env non si rilegge). Dà un cookie httpOnly `uc_bypass`
  di 30 giorni, valido solo per il dominio su cui lo si apre. Cambiare il
  segreto revoca tutti i cookie: `vercel env rm` + `vercel env add` + Redeploy.
- Accendere o spegnere = cambiare la env + Redeploy (1-2 minuti).
- Gli anteprimatori dei link (WhatsApp, Facebook, Telegram, X, LinkedIn,
  Slack, Discord) ricevono la stessa pagina con un 200: con il 503 scartano la
  scheda di condivisione. Google e i visitatori restano sul 503.

## Infrastruttura (cose non ovvie)
- **Supabase self-hosted:** VPS Hetzner `178.104.44.21` (Norimberga), host
  `supabase.luciogratani.it`, schema `underclub`. Documentazione in
  `~/Desktop/zukunft/server-vps/`. SQL via
  `ssh root@… "docker exec -i supabase-db psql -U supabase_admin -d postgres"`.
  Va usato `supabase_admin`, proprietario degli oggetti; `postgres` non è
  superuser.
- **DNS di `underclub.it`:** zona su Vercel, team `lucios-projects-aef0021a`,
  si modifica con `vercel dns add`. Il dominio è di Ezio (registrar): tiene i
  nameserver Vercel e lo rinnova. Mai `vercel domains rm`: toglierebbe il
  dominio, con la zona, da tutto il team. I domini tra progetti si spostano
  dalla dashboard.
- **Permessi dell'assistente:** il classificatore della modalità auto blocca
  l'SSH verso la VPS e le modifiche DNS. Si preparano i comandi, Lucio li lancia
  e incolla l'output. Lettura delle env, deploy di preview e `vercel curl`
  funzionano. Chrome (estensione Claude) è loggato anche su RA come Underclub.

## Come lavorare con l'utente
- Rispondere in italiano. Il CLAUDE.md globale è attivo: `## Summary` in testa,
  risposte concise, niente push né branch nuovi senza richiesta.
- Mai toccare Supabase, Vercel o Resend reali senza un ok esplicito, e chiedere
  conferma per ogni passo irreversibile.
- I segreti non passano mai dalla chat: comandi con `openssl rand` o `pbpaste`
  in pipe verso `vercel env add … --sensitive`.
- Testi nuovi per gli utenti: bozza marcata `COPY-DRAFT`, approvazione di
  Lucio, poi si toglie il marcatore. Oggi nel codice non ce ne sono.

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
