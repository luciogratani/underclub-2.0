# Test manuale in locale — flusso passwordless

Come provare a mano il sito pubblico senza toccare
Supabase, Vercel o Resend. Usato per il primo giro di test manuali il 2026-10-01.

**Cosa copre:** prenotazione, link di conferma, ticket, menu, `/account`,
disdetta, recupero, quota e limiti.
**Cosa non copre:**
- il check-in admin, perché manca il login di Supabase, che richiederebbe Docker;
- BotID e il cron, che girano solo su Vercel.

## Come funziona

| Pezzo | Al posto di | Porta |
|---|---|---|
| Postgres 16 usa e getta (`supabase/tests/run.sh --keep`) | il database Supabase | 55460 |
| PostgREST (`brew install postgrest`) | le API REST di Supabase | 3010 |
| un piccolo proxy Node che toglie il prefisso `/rest/v1` | il dominio `*.supabase.co` | 54321 |
| il dev server di Vite con `DEV_PG_URL` | le Vercel Functions | 5173 |

Il browser legge eventi e ticket dal proxy, come farebbe con Supabase. Gli
endpoint `/api/*` girano nel dev server contro lo stesso Postgres. Le email non
partono: compaiono nel terminale del dev server, link compresi.

## Passi

Lavorare in una cartella temporanea fuori dal repo, per esempio `$TMPDIR/uc-manual`.

1. **Database** con tutta la catena delle migrazioni. Annotare il comando di
   stop che lo script stampa alla fine:
   ```bash
   PGPORT_TEST=55460 supabase/tests/run.sh --keep
   ```
2. **Svuotare i dati dei test, creare il ruolo di PostgREST e una serata di prova:**
   ```sql
   -- psql postgres://postgres@127.0.0.1:55460/postgres
   truncate underclub.activation_tokens, underclub.contact_sessions, underclub.reservations,
            underclub.contacts, underclub.event_artists, underclub.event_entries,
            underclub.events, underclub.request_throttle cascade;
   create role authenticator login noinherit;
   grant anon, authenticated, service_role to authenticator;
   insert into underclub.events (id, title, date, time, status) values
     ('11111111-1111-4111-8111-111111111111', 'UNDERCLUB TEST NIGHT',
      (now() at time zone 'Europe/Rome')::date + 10, '23:30', 'published');
   insert into underclub.event_entries (event_id, name, note, quota, sort_order, price, valid_until) values
     ('11111111-1111-4111-8111-111111111111', 'RIDOTTO', '+1 drink', 3, 0, 10,
      ((now() at time zone 'Europe/Rome')::date + 11 + time '01:59') at time zone 'Europe/Rome'),
     ('11111111-1111-4111-8111-111111111111', 'INTERO', null, null, 1, 15, null);
   ```
3. **PostgREST.** Generare un segreto (`openssl rand -hex 32`) e scrivere `postgrest.conf`:
   ```
   db-uri = "postgres://authenticator@127.0.0.1:55460/postgres"
   db-schemas = "underclub"
   db-anon-role = "anon"
   jwt-secret = "<segreto>"
   server-host = "127.0.0.1"
   server-port = 3010
   ```
   Avviarlo con `postgrest postgrest.conf`.
4. **Chiave anon**: un JWT HS256 firmato con lo stesso segreto (`anon-jwt.mjs`):
   ```js
   import { createHmac } from 'node:crypto';
   const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
   const h = b64({ alg: 'HS256', typ: 'JWT' }), p = b64({ role: 'anon', exp: 4102444800 });
   const sig = createHmac('sha256', process.argv[2]).update(`${h}.${p}`).digest('base64url');
   console.log(`${h}.${p}.${sig}`);
   ```
   Lanciarlo con `node anon-jwt.mjs <segreto> > anon.jwt`.
5. **Proxy** (`proxy.mjs`), da avviare con `node proxy.mjs`:
   ```js
   import http from 'node:http';
   http.createServer((req, res) => {
     if (!req.url.startsWith('/rest/v1/')) { res.writeHead(404); return res.end(); }
     const up = http.request({ host: '127.0.0.1', port: 3010, method: req.method,
       path: req.url.slice('/rest/v1'.length), headers: { ...req.headers, host: '127.0.0.1:3010' } },
       (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
     up.on('error', () => { res.writeHead(502); res.end(); });
     req.pipe(up);
   }).listen(54321, '127.0.0.1');
   ```
6. **Sito**: le variabili in riga di comando hanno la precedenza sul file `.env`:
   ```bash
   VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_ANON_KEY=$(cat anon.jwt) DEV_PG_URL=postgres://postgres@127.0.0.1:55460/postgres pnpm --filter web dev --port 5173 --strictPort
   ```
7. Aprire http://localhost:5173 in **Chrome**, con i DevTools in vista dispositivo
   (`⌘⇧M`). Safari può rifiutare il cookie `Secure` su localhost.

## Note utili
- **Indirizzi email**: usarne uno diverso a ogni prova (`prova+1@example.com`…).
  Il limite per indirizzo (3 email all'ora) scatta in silenzio: compare "check
  your inbox", ma nel terminale non arriva nessun link.
- **Limite per IP**: 5 link di accesso ogni 10 minuti, poi 429.
- **Doppie chiamate in console**: le chiamate doppie sono lo StrictMode di React in
  sviluppo. La 401 su `/api/session` senza sessione è prevista dal contratto.
- **Spegnere tutto**: fermare il dev server, poi `postgrest` e il proxy, poi il
  Postgres con il comando stampato al passo 1.
