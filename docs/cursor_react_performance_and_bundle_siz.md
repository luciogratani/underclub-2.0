# React performance and bundle size optimization
_Exported on 18/04/2026 at 3:35:16 CEST from Cursor (3.1.15)_

---

**User**

Sei un engineer esperto in performance React e bundle size. Su apps/web: individua componenti “pesanti” (dipendenze three/WebGL, canvas, librerie grandi, import non lazy), alberi di render costosi, context che forzano re-render ampi, file monolitici da spezzare. Per ogni hotspot: perché pesa (bundle vs runtime), chi lo importa, opzioni (dynamic import, split route, memo, estrazione sotto-albero, code splitting). Suggerisci una roadmap: cosa alleggerire subito vs frammentare in un secondo momento.

---

**Cursor**

Ho letto i file chiave (`main.tsx`, `App.tsx`, `Hero`, `TextRing`, `Lanyard`, `HalftoneOverlay`, `BookNow`, `NextDate`, `Ticket`, `vite.config.ts`, `package.json`, e gli assets `public/`). Di seguito trovi la mappa dei punti pesanti con diagnosi, importatori, opzioni concrete e una roadmap ordinata per rapporto impatto/sforzo.

---

## 1) Panoramica peso reale

Dipendenze runtime dichiarate in `apps/web/package.json`:

```1:1:apps/web/package.json
{"name":"web",…"dependencies":{"@underclub/shared":"workspace:*","@react-three/drei":"^10.7.7","@react-three/fiber":"^9.5.0","@react-three/rapier":"^2.2.0","@supabase/supabase-js":"^2.47.0","meshline":"^3.3.1","react":"^19.0.0","react-dom":"^19.0.0","react-router-dom":"^7.0.0","three":"^0.183.2"}…}
```

Stime gzipped tipiche su un build prod:
- `three` core: ~160–180 KB gz
- `@react-three/fiber`: ~20 KB gz
- `@react-three/drei` (con `Environment` + `Lightformer` + `Html` + `useGLTF` + `useTexture`): ~70–120 KB gz + HDR/RGBE loader + GLTFLoader + DRACO stubs
- `@react-three/rapier` + WASM Rapier: ~250–400 KB (wasm) + ~30 KB gz JS
- `meshline`: ~5 KB gz
- `@supabase/supabase-js`: ~45 KB gz (+ `@supabase/realtime-js`, `@supabase/auth-js` se non shakeati)
- `react-router-dom` v7: ~20 KB gz

In totale il 3D stack vale facilmente **~300–400 KB gz di JS + un WASM Rapier grosso** che oggi entra nel *main bundle*.

---

## 2) Router: tutte le route nel bundle iniziale — hotspot bundle #1

```1:15:apps/web/src/main.tsx
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import App from './App.tsx'
import Info from './pages/Info.tsx'
import PrivacyCookie from './pages/PrivacyCookie.tsx'
import Ticket from './pages/Ticket.tsx'
…
const router = createBrowserRouter([
  { path: '/', element: <App /> },
  { path: '/info', element: <Info /> },
  { path: '/info/privacy-cookie', element: <PrivacyCookie /> },
  { path: '/ticket/:id', element: <Ticket /> },
])
```

**Perché pesa (bundle):** `Ticket` importa staticamente `components/Lanyard/Lanyard` che tira dentro tutto lo stack `three / r3f / drei / rapier / meshline`. Essendo importato direttamente in `main.tsx`, **chi apre `/` scarica anche il 3D**. È la singola vittoria più grande disponibile.

**Chi lo importa:** `main.tsx` → `pages/Ticket.tsx` → `Lanyard.tsx`.

**Opzioni (in ordine di impatto):**
1. Passare a **`createBrowserRouter` con `lazy`** per tutte le route non di atterraggio:
   ```ts
   { path: '/ticket/:id', lazy: async () => ({ Component: (await import('./pages/Ticket')).default }) }
   ```
   Solo questa modifica sposta l’intero stack 3D + WASM in un chunk separato. `Info` e `PrivacyCookie` idem: sono statiche, puro JSX.
2. Anche dentro `Ticket`, caricare `Lanyard` con `React.lazy` + `Suspense` (fallback = il `<p>Loading ticket…</p>` già esistente) così se la fetch fallisce non paghi nemmeno il download del 3D.
3. In `vite.config.ts` aggiungere `build.rollupOptions.output.manualChunks` per isolare `three`, `@react-three/*`, `rapier` in chunk stabili e cacheabili tra deploy.

---

## 3) `components/Lanyard/Lanyard.tsx` — hotspot bundle + runtime #2

```1:21:apps/web/src/components/Lanyard/Lanyard.tsx
import { Canvas, extend, useFrame } from '@react-three/fiber';
import { useGLTF, useTexture, Environment, Lightformer, Html } from '@react-three/drei';
import {
  BallCollider, CuboidCollider, Physics, RigidBody,
  useRopeJoint, useSphericalJoint, RigidBodyProps
} from '@react-three/rapier';
import { MeshLineGeometry, MeshLineMaterial } from 'meshline';
import * as THREE from 'three';
```

**Perché pesa:**
- Bundle: vedi §1. `drei`’s `Environment` + `Lightformer` impongono `RGBELoader` e pipeline IBL; spesso puoi vivere con due `pointLight` + `ambientLight` e togliere `Environment` (risparmio di diversi KB + primo frame più rapido).
- Runtime: `Physics` di Rapier runa a 60 fps con 4 RigidBody + joints + `useFrame` che calcola una CatmullRom a ogni frame, ricostruisce `MeshLineGeometry.setPoints` ogni frame (32 punti desktop). Inoltre il componente pesante **non è mai unmountato** quando l’utente torna indietro nel flusso e poi riapre il ticket in nuova tab (comportamento attuale è già separate tab, quindi ok). 
- `import * as THREE from 'three'` disabilita in parte il tree‑shaking di three; `three` esporta già ES modules — conviene importare solo ciò che serve: `Vector3`, `Color`, `CatmullRomCurve3`, `RepeatWrapping`.

**Opzioni:**
1. **`React.lazy`** di `Lanyard` dentro `Ticket`. Prima grande vittoria.
2. `import { Vector3, Color, CatmullRomCurve3, RepeatWrapping } from 'three'` invece del namespace.
3. Preload del `.glb`/`.png` con `useGLTF.preload('/ticket/_Card.glb')` e `<link rel="preload" as="fetch">` nell’HTML solo sulla route ticket.
4. Valutare di rimuovere `Environment + Lightformer` (4 lightformers molto intensi su una scena piccola) e usare `<directionalLight>` + `<ambientLight>`: si taglia pezzo di `drei` + HDR machinery e il ticket carica in meno tempo.
5. Se vuoi restare con Rapier: abbassare `timeStep` su mobile è già fatto; considerare `paused` quando il tab non è visibile (`document.visibilityState`) per non bruciare CPU se la tab rimane aperta.
6. Due chunk dedicati in `manualChunks`: `three-core` e `three-physics` (Rapier). Meglio per la cache tra deploy.

---

## 4) `components/TextRing.tsx` — hotspot runtime #1 (sempre attivo)

```69:78:apps/web/src/components/TextRing.tsx
useEffect(() => {
  startRef.current = typeof performance !== "undefined" ? performance.now() : Date.now();
  let rafId: number;
  const tick = () => {
    setNow(typeof performance !== "undefined" ? performance.now() : Date.now());
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(rafId);
}, []);
```

**Perché pesa (runtime):**
- `setState(now)` ogni frame **a 60 Hz** → re-render del componente e ricostruzione di 60 `<li>`. A ogni frame ricalcola `WORDS`, `elapsed`, `cycle`, `waveFront`, scorre 60 indici, aggiorna lo style `transform` di ogni `<li>` (layout/compositing leggero ma costante). Tutto questo è **sempre attivo sulla Hero**, che è la prima schermata e il posto peggiore dove bruciare CPU/batteria.
- Ma il contenuto visibile cambia davvero solo ~ogni 500 ms (blink) e durante le transizioni (3 s ogni 5 s). Il 95% dei frame è inutile.

**Chi lo importa:** `Hero.tsx` (sezione sempre montata in `App`).

**Opzioni:**
1. **Zero-React animation loop**: tenere l’effetto rAF ma aggiornare direttamente `textContent` delle `<li>` via `ref` (array di HTMLElement) senza toccare lo state React. Il diff di React scompare, resta solo un write diretto al DOM. È il cambio con miglior rapporto effort/guadagno.
2. Se invece preferisci stare in React: throttlare rAF a 15 Hz (`if (time - lastTime < 66) return;`). Alternativa: re-render solo quando `cycle`, `blinkOff` o `transitionElapsed` "discreto" cambiano, non ad ogni frame.
3. Estrarre il loop in un custom hook `useTextRingFrame()` che esporta solo le primitive che servono (char per index) e far rendere React solo i cambi "discreti".
4. `React.memo(TextRing)` con confronto delle due prop `nextDateIso`/`nextEventTitle`: in `App` queste cambiano una volta dopo `fetchNextEvent`, non deve propagarsi altro.

---

## 5) `App.tsx` (436 LOC) — monolite con re-render ampi — hotspot runtime #2

Tutto lo stato dell’app vive qui: data notice, hero intro, exit animations per 4 sezioni, `nextEvent`, reservation result, confirm error, toast closing, touch/wheel. Ogni `setState` (es. apertura toast, focus su input via figlio non possibile — ok — ma qualunque fetch/refresh) **re-renda tutte e 4 le sezioni**, nessuno memoizzato.

Esempi critici:
- `refreshNextEvent` dopo conferma → `setNextEvent(new obj)` → il prop `entries` arriva a `BookNow` come nuova reference, scatta l’`useEffect([entries])` che riseleziona il primo tier.
- `heroCtaVisible`, `heroExited`, `nextDateExited`, `bookNowExited` sono 4 boolean diversi mantenuti in parallelo: rendering della sezione sbagliata re-fired su transizione di qualunque altra.

**Opzioni:**
1. Spezzare in sotto-alberi:
   - `HeroSection` incapsula `Hero`, riceve solo `nextDateIso`, `nextEventTitle`, `isExited`, `showCta`, `onNext`.
   - `BookNowSection` incapsula `BookNow` + gestione locale di `selectedEntryId`, `touched*`, `ghost` — quasi tutto lì dentro può vivere senza toccare `App`.
   - `ReservationFlow` separato (summary + toast + createReservation).
2. Passare a un `useReducer` per la macchina di sezione (`currentSection`, `exited[4]`) invece di 4 state booleani duplicati.
3. Wrappare i figli con `React.memo` (Hero, NextDate, BookNow, ReservationSummary, DataNoticeOverlay, ErrorToast).
4. `useMemo` per `nextEvent?.entries` passato a BookNow se l’oggetto è re-fetchato (meglio: fetch con SWR pattern con equality + stable id).
5. Toglie i `setState` dal listener `scroll` (linea 219-244): oggi setta `heroExited/false/...` a ogni scroll in cima. Usare un `ref` + riconciliazione lazy riduce i re-render inutili. Se il valore va in stile CSS, spostare in `ref.current.style`.
6. Estrarre gli handler gesture (wheel/touch) in un custom hook `useSectionGestures(scrollRefV, { onNavigate })`: nessun vantaggio di performance diretto ma riduce `App.tsx` a ~150 LOC e semplifica memoizzazione.

---

## 6) `BookNow.tsx` (525 LOC) — monolite + I/O su ogni keystroke

```186:201:apps/web/src/components/BookNow.tsx
useEffect(() => {
  saveFormToStorage(fullName, dateOfBirth, email);
}, [fullName, dateOfBirth, email]);

useEffect(() => {
  const cardEl = cardRef.current;
  if (!cardEl) return;
  const updateCardSize = () => { … setGhostSize(…) };
  updateCardSize();
  const ro = new ResizeObserver(updateCardSize);
  ro.observe(cardEl);
  return () => ro.disconnect();
}, [isExited]);
```

**Perché pesa:**
- `saveFormToStorage` scrive su `localStorage` + `JSON.stringify` **ad ogni carattere digitato**. Minimo, ma su iOS Safari `localStorage` blocca il main thread e può produrre jank durante l’animazione di ingresso del tasto.
- Due ResizeObserver (uno su card, uno su sezione) + un IntersectionObserver. Funzionano, ma `setGhostSize` causa re-render con tutti i children del form (input, animate-line, tiers) — se si ridimensiona la finestra è costoso. `ghostSize` è usato solo come style su un `<div>` fantasma: può diventare un CSS var scritta via ref (`--ghost-w`, `--ghost-h`) senza state React.
- Ogni `onChange` scrive 3 state separati (`fullName`, `dateOfBirth`, `email`). Spostare in un unico `useReducer` riduce le re-render chain.

**Opzioni:**
1. Debounce della persistenza: `setTimeout(save, 400)` + flush on blur/unmount.
2. Convertire `ghostSize` → CSS custom properties via `ref` (azzera il secondo re-render del form durante animazioni di uscita).
3. Spezzare in: `BookNowForm` (solo input + validazioni), `BookNowTiers` (lista entries, memoizzata), `BookNowShell` (ghost + intersection + layout). `React.memo` sulla lista dei tier.
4. La funzione `clearTextLetterByLetter` ri-renderizza 30 volte a lettera × 3 campi durante la conferma. È la feature, va bene. Ma considera di dichiarare questi three stato in un ref durante l’animazione e poi committare una volta sola — a meno che la UI richieda di vedere ogni carattere scomparire (ok, allora lascia).

---

## 7) `HalftoneOverlay.tsx` (322 LOC) — hotspot runtime *potenziale*, attualmente dormiente

```1:3:apps/web/src/components/HalftoneOverlay.tsx
import { useEffect, useRef } from "react";
import vertSrc from "../shaders/halftone.vert.glsl?raw";
import fragSrc from "../shaders/halftone.frag.glsl?raw";
```

**Stato attuale:** in `Hero.tsx` `HalftoneOverlay` e `TextureOverlay` sono solo in un **commento** a fondo file, nessun importatore vivo. Tree‑shaking lo rimuove dal bundle prod.

Però, quando lo riattiverai, ha due problemi runtime:
1. `gl.getUniformLocation(program, "u_*")` chiamato **ad ogni frame**: è una lookup costosa e allocante. Vanno cachate una volta sola dopo il link.
2. Animazione rAF full‑screen con `setTimeout`/`sin` per luminance + grain: a DPR 2 sul full viewport è pesante su mobile. Limita DPR a `1.5` e cappa il canvas a `min(innerWidth, 1280)` per fragment cost.
3. È un file monolitico che puoi spezzare in `halftoneProgram.ts` (compilazione + cache delle uniform) e `HalftoneOverlay.tsx` (solo hook React) — aiuta leggibilità e rende trivia l’hot‑swap su un offscreen canvas.

**Opzioni se lo riattivi:**
- cache delle uniform location (~10× speedup nel draw loop)
- render on-demand quando il tab torna visibile (`visibilitychange`)
- lazy-import il componente solo nelle sezioni che lo usano

---

## 8) File monoliti e dead code

| File | LOC | Stato | Azione |
|------|-----|-------|--------|
| `components/About.tsx` | 147 | **Nessun import** | Cancellare o parcheggiare in branch |
| `components/Archive.tsx` | 147 | **Nessun import** | Cancellare |
| `components/Guests.tsx` | 182 | **Nessun import** | Cancellare |
| `components/PerfMeter.tsx` | 70 | **Nessun import** | Cancellare |
| `components/TextureOverlay.tsx` | 15 | **Nessun import** | Cancellare |
| `components/HalftoneOverlay.tsx` | 322 | Nessun import (solo in commento Hero) | Tenere solo se prevedi di riattivarlo |
| `components/BookNow.tsx` | 525 | In uso | Spezzare in 3 sotto-componenti |
| `src/App.tsx` | 436 | In uso | Spezzare in sezioni + reducer |
| `components/Lanyard/Lanyard.tsx` | 296 | Solo `Ticket` | Lazy + split import three |

Tree‑shaking di Rollup li toglie dal bundle, ma **TS li compila, ESLint li analizza, GitHub Copilot li cita**: il costo è cognitivo e mantenzione. Rimuoverli è gratis e riduce il "surface area".

---

## 9) Asset statici in `public/`

```
hero-orizzontale-4.gif           2.2M
hero-orizzontale-4-1080.gif      1.4M
hero-orizzontale-4-1080.webp     615K
public/ticket/Card.glb           2.3M   ← **orfano?**
public/ticket/_Card.glb          158K   ← quello usato
public/ticket/lanyard.png        7.4K   ← vecchio (orfano)
public/ticket/_lanyard.png       10K    ← usato
```

- `Card.glb` 2.3 MB e `lanyard.png` sembrano asset v1 non più referenziati (codice usa `_Card.glb` e `_lanyard.png`). Da cancellare.
- I GIF non sono decodificati in HW; servire **`<video autoplay muted playsinline loop>`** con `mp4`+`webm` riduce il peso del 70–90% e abbatte il costo di decode CPU su mobile. L’`<img>` GIF in `Info` + `PrivacyCookie` è servito a 1.4 MB solo per decorazione di una striscia alta 128 px.
- Se vuoi mantenere `<picture>`: genera anche una versione **`avif`** in aggiunta a `webp`.

---

## 10) Altri dettagli minori

- `@supabase/supabase-js`: OK, ma se usi solo REST puoi instanziare senza il realtime module; oppure dynamic import del client solo dentro `lib/api.ts` funzioni async (per togliere dal first paint).
- `main.tsx` non usa `ReactDOM.preload`/preconnect: aggiungere `<link rel="preconnect" href="https://<supabase>.supabase.co">` nell’HTML accorcia la fetch `fetchNextEvent` sul primo load.
- `vite.config.ts` non imposta `build.target`: default va bene per browser moderni; puoi alzare a `es2022` per ridurre i polyfill helper di TS/Babel.
- `<StrictMode>`: in dev esegue doppi effetti: `fetchNextEvent` parte due volte in dev (non prod), ok ma sii consapevole quando benchmarkki.

---

## 11) Roadmap consigliata

### Now — settimana 1 (tutto bundle, ROI altissimo, rischio minimo)

1. **Route splitting** in `main.tsx`: `lazy` per `Info`, `PrivacyCookie`, `Ticket`. Atteso: `/` perde ~350–450 KB gz iniziali (tutto three/rapier/drei/meshline).
2. **`React.lazy(Lanyard)`** dentro `Ticket`, fallback = lo stesso `<p>Loading ticket…</p>`. Riduce TBT sulla route ticket quando la fetch fallisce.
3. `manualChunks` in `vite.config.ts`: separare `three`, `@react-three/*`, `@dimforge/rapier*`, `@supabase/*`, `react-router-dom`. Cache HTTP più efficiente tra deploy.
4. Sostituire `import * as THREE from 'three'` con named imports in `Lanyard.tsx`.
5. Rimuovere file dead-code (About/Archive/Guests/PerfMeter/TextureOverlay/HalftoneOverlay se non lo riattivi a breve).
6. Rimuovere asset orfani `public/ticket/Card.glb`, `public/ticket/lanyard.png`.
7. Sostituire i GIF hero con `<video>` `mp4`+`webm` (+poster webp già presente).

### Next — settimana 2 (runtime / jank percepito)

8. **`TextRing`**: sostituire il loop React con aggiornamento via `ref` (array di `<li>` refs, `textContent` + `classList` su ciascuno). Atteso: Hero resta fermo su JS main thread, ~0% CPU idle.
9. Memoizzare i 4 figli di `App` (`Hero`, `NextDate`, `BookNow`, `ReservationSummary`) con `React.memo` e stabilizzare le callbacks con `useCallback`.
10. Convertire `ghostSize` in CSS var via `ref` sia in `NextDate` sia in `BookNow` (elimina re-render di sezioni intere durante resize/animazioni di uscita).
11. Debounce di `saveFormToStorage` a 400 ms (idle) + flush on unmount.
12. Rimuovere `setHero/NextDate/BookNow Exited(false)` dal listener scroll passando per un `useReducer` con stato derivato, o spostare il flag in CSS.

### Later — settimana 3+ (refactor strutturale)

13. Spezzare `App.tsx` in: `useSectionGestures`, `useSectionMachine`, `<HeroSection>`, `<NextDateSection>`, `<BookNowSection>`, `<SummarySection>`, `<GlobalOverlays>` (data notice + toast).
14. Spezzare `BookNow.tsx` in `BookNowForm`, `BookNowTiers`, `BookNowShell`, + `useBookNowForm` (reducer).
15. Refactor `Lanyard.tsx`: tirare fuori `Band` in file dedicato, tipi forti per i ref invece di `any`, preload GLTF/texture.
16. Opzionale: togliere `Environment/Lightformer` in favore di luci fisiche statiche (risparmio drei).
17. Se/quando riattivi `HalftoneOverlay`: cache delle `UniformLocation`, cap DPR 1.5 su mobile, render on‑demand.
18. Considerare un data layer (SWR / TanStack Query) per `fetchNextEvent` + `fetchTicketData` — elimina race, dedup, e rimuove parte della complessità da `App.tsx`.

---

## 12) Riassunto per priorità

| # | Intervento | Tipo | Costo | Guadagno atteso |
|---|------------|------|-------|-----------------|
| 1 | Route lazy `Ticket`/`Info`/`PrivacyCookie` | bundle | XS | 🔥🔥🔥 (−350–450 KB gz su `/`) |
| 2 | Lazy import `Lanyard` dentro `Ticket` | bundle | XS | 🔥🔥 (TBT ticket) |
| 3 | Named imports da `three` | bundle | XS | 🔥 |
| 4 | `manualChunks` vendor | bundle/cache | S | 🔥🔥 (cache deploy) |
| 5 | GIF → `<video>` | asset | S | 🔥🔥🔥 (TTI mobile) |
| 6 | Cancellare dead files + asset orfani | manutenzione | XS | 🟢 DX |
| 7 | `TextRing`: ref-based animation | runtime | S | 🔥🔥 (CPU Hero) |
| 8 | `React.memo` + `useCallback` in `App` | runtime | S | 🔥 |
| 9 | `ghostSize` → CSS var via ref | runtime | S | 🔥 |
| 10 | Debounce `saveFormToStorage` | runtime | XS | 🔥 (iOS jank) |
| 11 | Spezzare `App.tsx` + `useReducer` sezioni | refactor | M | 🟡 manutenzione + memoizzabilità |
| 12 | Spezzare `BookNow.tsx` | refactor | M | 🟡 memoizzabilità |
| 13 | `Environment`→luci statiche | bundle/runtime | S | 🔥 |
| 14 | Preload GLTF + preconnect Supabase | network | XS | 🔥 |

Se vuoi, posso partire ora con l’intervento 1 (route-splitting in `main.tsx`) + 2 (lazy `Lanyard`) + 4 (`manualChunks`): sono le tre modifiche a rischio zero e guadagno più alto, e puoi misurare subito la differenza con `vite build && vite preview`.

