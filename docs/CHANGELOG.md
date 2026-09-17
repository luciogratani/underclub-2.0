# Changelog

Registro delle modifiche al repo, dalla piu' recente. Le decisioni di prodotto e
la roadmap restano in [`prossimi-passi.md`](./prossimi-passi.md).

---

## 2026-09-17 — Lanyard: il solver XPBD diventa il motore ufficiale

Dopo la prova su device, la pagina ticket usa il nuovo solver. Rapier non viene
cancellato: resta consultabile su una route dedicata.

### Cambiato

- **File rinominati per ruolo**: `Lanyard.tsx` è ora il motore ufficiale
  (ex `LanyardVerlet.tsx`); il vecchio diventa `LanyardRapier.tsx`, con un
  commento in testa che vieta di importarlo dal flusso ticket. `Ticket.tsx` non
  cambia import, quindi passa automaticamente al nuovo motore.
- **Nuova route `/lanyard-rapier`** (`pages/LanyardRapierDemo.tsx`): la card
  Rapier a schermo intero con dati mock. Il componente è lazy, quindi il WASM di
  Rapier si scarica solo lì (e su `/demo/lanyard` scegliendo Rapier).
- **Fix reset al resize**: il solver veniva ricreato quando la larghezza
  attraversava i 768 px (es. rotazione tablet) e la card ricadeva dall'alto. Ora
  è creato una volta sola e cambia solo il passo di simulazione.
- `/demo/lanyard` resta, con le etichette aggiornate (Rapier "precedente",
  Verlet "ufficiale").

### Verificato

- Build verde. Nel grafo dei chunk `vendor-rapier` è referenziato solo da
  `LanyardRapier`, `LanyardRapierDemo` e `LanyardLab`; `Ticket` e il nuovo
  `Lanyard` non lo toccano, e la home non precarica nulla del 3D.
- A runtime, con la build di produzione: aprendo il motore ufficiale il canvas
  monta e **`vendor-rapier` non viene scaricato**; aprendo `/lanyard-rapier` sì.
  Nessun errore in console sulla route Rapier.
- Non verificato a occhio da qui (tab del browser non visibile, WebGL non
  disegna): il rendering l'hai provato tu su device.

### Peso della route ticket

JavaScript gzip scaricato aprendo `/ticket/:id`, totale reale compresi i chunk
condivisi con la home: **da 1.286 kB a 446 kB (−840 kB, −65%)**. Nella voce del
2026-09-07 avevo stimato ~1.140 → ~298 kB escludendo quei chunk condivisi: i
numeri corretti sono questi.

### Ancora aperto

- Gli **script di taratura** (confronto headless con Rapier) erano in una
  cartella temporanea e sono andati persi. Se in futuro cambiano dimensioni della
  card, corda, gravità o punto di partenza, vanno riscritti per ricalibrare.
- `/lanyard-rapier` e `/demo/lanyard` sono pubbliche anche se non linkate.
- `@react-three/rapier` e `@dimforge/rapier3d-compat` restano dipendenze, perché
  servono alla route di riferimento.

---

## 2026-09-07 — Lanyard: fisica Verlet alternativa + route demo A/B

Rapier pesa 843 kB gz (WASM inlinato in base64) per simulare quattro giunti corda
e un giunto sferico. Scritto un solver dedicato per confrontarlo con l'attuale.

### Cosa c'è di nuovo

- `apps/web/src/components/Lanyard/lanyardSolver.ts` — solver XPBD/position-based:
  catena di 4 punti massa + card come corpo rigido, con tensore d'inerzia reale e
  risoluzione 3x3 del giunto sferico. **11,7 kB non minificati, 0 kB di runtime
  aggiuntivo** (usa solo la matematica di `three`, già presente).
- `apps/web/src/components/Lanyard/LanyardVerlet.tsx` — stesso identico rendering
  di `Lanyard.tsx` (stesso GLB, materiali, meshline, overlay HTML): cambia solo
  la simulazione, così l'A/B confronta la fisica e nient'altro.
- `apps/web/src/pages/LanyardLab.tsx` + route **`/demo/lanyard`** — toggle fra i
  due motori, FPS live, reset. I due motori sono lazy separati: scegliendo Verlet
  da freddo il WASM di Rapier non viene proprio scaricato.
- `docs/lanyard-physics-ab.svg` — contact sheet dei due motori a confronto.

### Come è stato tarato

Non a occhio: **entrambi i motori girano headless in Node** (Rapier gira anche
fuori dal browser) con stesso stato iniziale, stesso timestep e stesso damping,
e le traiettorie vengono confrontate. La taratura è una grid search su
compliance XPBD e cap di correzione, valutata su due scenari (caduta d'ingresso,
drag laterale + rilascio) e su entrambe le configurazioni (1/60 desktop,
1/30 mobile).

Tre cose emerse dalla misura, tutte contro-intuitive:

1. **Un solver position-based puro è troppo rigido.** Rapier lascia allungare la
   corda fino a 2,9x sotto shock, perché il suo TGS fa 4 iterazioni su una catena
   con rapporto di massa 17:1. Snappare i vincoli esatti faceva arrivare la card
   in ~1,2 s invece di ~2,7 s, senza rinculo. Risolto con compliance XPBD.
2. **L'RMS di traiettoria da solo è una metrica cieca.** La configurazione con lo
   scarto minore staccava visibilmente la card dalla cordicella durante
   l'ingresso (0,71 di separazione su desktop, 2,12 su mobile, contro lo 0,14
   peggiore di Rapier). L'errore di giunto è diventato un vincolo rigido.
3. **Serve un cap di correzione separato per corda e giunto.** Con un cap unico i
   due requisiti sono in conflitto. Separandoli, *tutte* le configurazioni
   rientrano nel vincolo e l'errore scende ancora.

Provato e **scartato** un cap sulla correzione angolare: il contact sheet
suggeriva che la card ruotasse troppo durante l'ingresso, ma misurando la
percentuale di tempo passata di taglio Rapier sta al 56,7% e il nuovo solver al
61,1% — non ruota di più, ruota *fuori fase* (l'ingresso è caotico in entrambi).
Il cap avrebbe portato al 22%, cioè più lontano dal riferimento.

### Risultati misurati (contro Rapier reale, 9 s per scenario)

| | desktop (1/60) | mobile (1/30) |
|---|---|---|
| RMS traiettoria complessivo | 0,407 | 0,186 |
| RMS dopo il rilascio del drag | **0,067** | 0,120 |
| RMS a riposo | 0,022 | 0,081 |
| Tempo di assestamento | 2,72 s *(Rapier 2,77 s)* | 2,23 s *(2,40 s)* |
| Errore max giunto sferico | **0,0010** *(Rapier 0,1433)* | 0,0063 *(0,1388)* |
| Allungamento max corda | 2,733 *(Rapier 2,882)* | 3,281 *(2,871)* |
| Jitter a riposo per frame | 1,07e-3 *(1,23e-3)* | 2,11e-3 *(2,35e-3)* |
| CPU per frame | **0,024 ms** *(Rapier 0,035 ms)* | 0,009 ms *(0,013 ms)* |

Partenza senza taratura: RMS 4,57. Dopo il fit: 0,41. Nessun NaN in nessuno
scenario. Il riposo geometricamente esatto è −0,539 (ancora 3 corde da 1 sotto
l'ancoraggio, meno 1,45 di clip); Rapier si ferma a −0,561 per compliance
residua, quindi i 2 cm di scarto sono Rapier che sbaglia, non il nuovo solver.

### Se adottato

La route ticket passerebbe da ~1.140 kB gz a ~298 kB gz (**−74%**): resta solo
`vendor-three`. A quel punto `@react-three/rapier` e `@dimforge/rapier3d-compat`
si disinstallano e `Lanyard.tsx` si sostituisce con `LanyardVerlet.tsx`.

**Nulla di tutto questo tocca la pagina ticket attuale**: `Ticket.tsx` continua a
importare `Lanyard.tsx` (Rapier). Il nuovo motore vive solo sotto `/demo/lanyard`.

### Da decidere

- La route `/demo/lanyard` è pubblica anche se non linkata. Da rimuovere o
  proteggere prima della produzione, se non serve più.
- Il confronto vero va fatto al tatto su un device reale: il drag è la parte che
  i numeri catturano meno.

---

## 2026-09-07 — Code splitting `apps/web` + hardening `rls.sql`

Sessione di ispezione repo/documenti, seguita da due interventi.

### Security

- **`supabase/rls.sql` reso fail-closed su `reservations`.** Il file conteneva
  ancora le policy permissive `anon_read_own_reservation` e
  `anon_update_ticket_opened`, entrambe `using (true)`: anon poteva leggere
  *tutte* le prenotazioni e scrivere *qualsiasi* colonna, incluso `status` e
  `qr_scanned_at`. Erano gia' droppate da
  `rls-history/2026-04-17-ultra-strict-ticket-token.sql`, ma il file canonico non
  lo rifletteva — riapplicarlo su un DB nuovo (o riapplicarlo per errore su
  quello esistente) riapriva il buco.
  Ora `rls.sql` non crea alcuna policy anon di select/update su `reservations`:
  l'accesso al ticket arriva solo dalle policy token-scoped dello step 3.
- **Aggiunto in testa a `rls.sql` l'ordine di esecuzione completo** (schema →
  rls → 3 migrazioni in `rls-history/`), con nota esplicita che fermarsi allo
  step 2 rompe la pagina ticket ma non espone dati.
- Nessuna modifica al DB in produzione: solo ai file SQL versionati.

### Performance — `apps/web`

Applicati gli interventi 1, 2 e 4 della roadmap in
[`cursor_react_performance_and_bundle_siz.md`](./cursor_react_performance_and_bundle_siz.md).

- **`src/main.tsx`**: `Info`, `PrivacyCookie` e `Ticket` passano a `React.lazy` +
  `Suspense`. Prima `Ticket` era importato staticamente e trascinava tutto lo
  stack `three` / `@react-three/*` / `rapier` / `meshline` nel bundle servito su
  `/`. Fallback dedicato per la route ticket (stessa schermata `Loading ticket…`
  gia' esistente), fallback neutro nero per le pagine statiche.
- **`src/pages/Ticket.tsx`**: `Lanyard` caricato con `React.lazy`; la scena 3D
  parte solo dopo che la prenotazione e' stata risolta. Chi apre un link ticket
  scaduto/invalido non scarica piu' nulla del 3D.
- **`vite.config.ts`**: aggiunto `build.rollupOptions.output.manualChunks` con
  vendor chunk stabili (`vendor-react`, `vendor-router`, `vendor-supabase`,
  `vendor-three`, `vendor-rapier`), utili anche per la cache tra deploy.
  Due accorgimenti non ovvi, entrambi commentati nel file:
  - React va pinnato in un chunk suo, altrimenti Rollup lo assorbe in
    `vendor-three` (condiviso con `@react-three/fiber`) e `/` finisce per fare
    `modulepreload` dell'intero stack 3D solo per avviarsi;
  - stesso problema con l'helper `vite/preload-helper`, condiviso tra entry e
    chunk lazy: pinnato anch'esso su `vendor-react`.

#### Risultato misurato (`pnpm --filter web build`)

| | JS su `/` | gzip |
|---|---|---|
| Prima | 1 bundle da 3.840,79 kB | **1.292,54 kB** |
| Dopo | entry + 3 vendor chunk | **147,76 kB** |

Circa **−1.145 kB gzip (−88%)** sulla landing. `vendor-three` (283,65 kB gz) e
`vendor-rapier` (843,47 kB gz) sono ora raggiungibili solo da `/ticket/:id`, e
`index.html` non li mette piu' in `modulepreload`.

#### Verifica

- `pnpm --filter web build` verde.
- Smoke test runtime su `vite preview`: `/` (overlay data notice → Hero),
  `/info` (route lazy) e `/ticket/:id` con token assente (schermata "Invalid or
  expired ticket link") renderizzano correttamente, zero errori in console.

### Note / non toccato in questa sessione

Emerso dall'ispezione, lasciato intenzionalmente fuori scope:

- `apps/admin/src/pages/CheckIn.tsx` espone ancora il pannello **"Debug logs"**
  con Copy/Clear, e c'e' una modifica non committata su `QrCameraScanner.tsx`
  che riattiva `highlightScanRegion` / `highlightCodeOutline`. Residui del debug
  scanner su Safari iOS: da decidere se tenerli o rimuoverli prima della prod.
- Esiste un **repo git annidato** in `apps/admin/.git/`. La root traccia
  comunque i file dell'admin, ma confonde tooling e CLI.
- `apps/{web,admin}/tsconfig.tsbuildinfo` sono **tracciati** in git;
  `.tmp-qr-venv/` (165 MB) non e' in `.gitignore`.
- `apps/web` contiene ~880 LOC di componenti mai importati (`About`, `Archive`,
  `Guests`, `PerfMeter`, `TextureOverlay`, `HalftoneOverlay`) e asset orfani
  (`public/ticket/Card.glb` 2,3 MB, `public/ticket/lanyard.png`), piu' i GIF hero
  da 2,2 MB e 1,4 MB. Tree-shaking li esclude dal bundle, ma restano costo di
  manutenzione e di banda sugli asset statici.
- `vendor-rapier` pesa 843 kB gz perche' il WASM e' inlinato in base64: e' il
  prossimo collo di bottiglia reale della route ticket.
- `import * as THREE` in `Lanyard.tsx` non e' stato convertito a named import:
  ora che il file vive in un chunk lazy il guadagno marginale e' basso.
