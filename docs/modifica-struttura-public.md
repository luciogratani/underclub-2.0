# Modifica struttura public — stato corrente

Questo documento descrive **il cambiamento strutturale in corso** sul frontend pubblico (`apps/web`), con focus su UX, transizioni e impatto tecnico.

## Obiettivo della modifica

Semplificare il flusso pubblico eliminando sezioni secondarie e portando l’esperienza a una navigazione lineare, mobile-first, con solo scroll verticale.

### Prima (struttura precedente)

- Layout misto verticale + orizzontale
- 2 colonne / 3 righe (con blocchi orizzontali interni)
- Sezioni presenti:
  - `Hero`
  - `NextDate`
  - `Archive`
  - `BookNow`
  - `Guests` (ALL TIME GUESTS)
  - `ReservationSummary` (YOU'RE IN)

### Adesso (struttura target implementata)

Flusso unico verticale a 4 sezioni:

1. `Hero`
2. `NextDate`
3. `BookNow`
4. `ReservationSummary` (YOU'RE IN)

Sezioni rimosse dal public flow:

- `Archive`
- `All Time Guests`

## Vincolo principale

Il cambiamento è stato fatto con priorità su **non rompere le transizioni** già esistenti (effetti di exit/expand tra card e sezioni).

## Scelte tecniche fatte

### 1) Refactor orchestrazione in `App.tsx`

In `apps/web/src/App.tsx`:

- Rimossa la logica di scroll orizzontale multi-container (`scrollRefH`, `scrollRefH2`, `scrollRefH3`)
- Mantenuto un solo container verticale (`scrollRefV`)
- Introdotta navigazione per indice sezione (`scrollToSection(index)`)
- Aggiornate le azioni di flusso:
  - `goToNextDate()` -> sezione 1
  - `goToBookNow()` -> sezione 2
  - `goToSummary()` -> sezione 3
  - `goToHero()` -> sezione 0

### 2) Transizioni preservate

Le transizioni visive principali restano attive grazie ai flag:

- `heroExited`
- `nextDateExited`
- `bookNowExited`

Prima dello scroll viene mantenuto il delay (`setTimeout(..., 300)`) per lasciare completare le animazioni di uscita già presenti nei componenti.

### 3) Pulsante ABOUT nascosto senza hard-delete

In `apps/web/src/components/Hero.tsx`:

- il bottone `ABOUT` ora viene renderizzato solo se esiste `onAboutClick`
- nel nuovo flow non passiamo più `onAboutClick`, quindi il bottone non appare

In questo modo il componente resta riusabile anche in futuri contesti.

## Stato attuale

- Flusso public in verticale: **completato**
- Sezioni Archive/Guests escluse dal percorso principale: **completato**
- Build web: **ok** (`pnpm --filter web build`)

## Impatto UX

- Esperienza più diretta e chiara: utente guidato da scoperta -> data -> prenotazione -> conferma
- Meno attriti e meno rami nel funnel
- Maggiore coerenza con obiettivo conversione booking

## Rischi / attenzione nelle prossime iterazioni

- Verificare su device reali che il `snap` verticale resti fluido (iOS Safari/Chrome Android)
- Controllare che il reset degli stati `isExited` sia coerente quando si torna in alto velocemente
- Rivalutare in futuro se `Archive` e `Guests` vadano:
  - deprecati definitivamente, oppure
  - mantenuti ma spostati in route dedicate non-funnel

## File coinvolti in questa modifica

- `apps/web/src/App.tsx`
- `apps/web/src/components/Hero.tsx`

---

Ultimo aggiornamento: modifica struttura public a colonna unica (Hero -> NextDate -> BookNow -> You're In).
