# Presenza online — SEO, Google, Resident Advisor (aggiornato 2026-10-02)

Obiettivo: chi cerca "techno sassari", "underground sassari" o "tech house
sassari" (molti Erasmus) deve trovare Underclub subito. Per un locale contano,
in quest'ordine: la scheda Google (Maps), Resident Advisor, il sito.

## Dati del locale (identici ovunque)
- **Nome:** Underclub
- **Indirizzo:** Viale Porto Torres 5, 07100 Sassari (SS). La sede legale di
  Pancho Villa SRLS, nella privacy, è al civico 3: va bene così.
- **Coordinate (da Google Maps):** 40.7309627, 8.5547431
- **Sito:** https://underclub.it
- **Email:** info@underclub.it (nessun telefono pubblico)
- **Social:** Instagram https://www.instagram.com/under_club_ss/ ·
  Facebook https://www.facebook.com/profile.php?id=61594853785767 ·
  canale WhatsApp https://whatsapp.com/channel/0029VbEFh874IBhKWpMzGh3M
- **Storia:** ex Pancho Villa, discoteca storica di Sassari; riaperto nella
  stagione 2025/26 con nome e identità nuovi; il 2026/27 è la seconda stagione.
- **Stagione:** da metà ottobre a metà maggio, circa 3 serate al mese, apertura
  00:30, chiusura 5:30. Gli orari non vanno nei dati del locale (Google lo
  mostrerebbe aperto tutte le notti): vanno sulle singole serate.
- **Generi:** techno, tekno, hard bounce, schranz, house, tech house.
- **Format ricorrenti 2026/27:** Technoroom, Breakout Sardinia.
- **Spazi:** sala 1; sala 2 solo per gli eventi più importanti; giardino
  esterno da cui si entra in entrambe. Capienza dichiarata su RA: 250.
- **Biglietti:** ticket ridotto prenotato online (numero limitato), intero in
  cassa; si paga sempre nel club. Tavoli via social; il locale si affitta per
  eventi privati.
- **Età minima:** non va indicata.

## Bio approvate
**Inglese** (RA, Google, social):

> Underclub is an underground electronic music club in Sassari, Sardinia.
> Formerly the Pancho Villa club, it reopened in 2025 with a new name and a new
> identity. Expect techno, tekno, hard bounce, schranz, house and tech house,
> with recurring nights like Technoroom and Breakout Sardinia. Two rooms open
> onto an outdoor garden. Doors open at 00:30, from mid-October to mid-May.
> Book your reduced ticket at underclub.it and pay at the door.

**Italiano** (scheda Google):

> Underclub è un club di musica elettronica underground a Sassari. Nato negli
> spazi dello storico Pancho Villa, ha riaperto nel 2025 con un nome e
> un'identità nuovi. In consolle techno, tekno, hard bounce, schranz, house e
> tech house, con format come Technoroom e Breakout Sardinia. Due sale e un
> giardino esterno. Si apre alle 00:30, da metà ottobre a metà maggio. Prenota
> il ticket ridotto su underclub.it e paghi all'ingresso.

## Sul sito (fatto, in produzione dal 2026-10-02)
- `apps/web/index.html`: `lang="en"`, titolo *Underclub — underground techno
  club in Sassari*, descrizione, `theme-color`, icone, manifest, Open Graph e
  Twitter card, dati strutturati `NightClub` (nome, descrizione, indirizzo,
  email, logo, immagine, social).
- `apps/web/public/`: `og.png` (2400×1260, logo + "underground club in
  sassari" + pill "underclub.it"), `favicon.ico`, `icon-192.png`,
  `icon-512.png`, `apple-touch-icon.png`, `site.webmanifest`, `robots.txt`,
  `sitemap.xml` (`/`, `/info`, `/info/privacy-cookie`).
- `apps/web/vercel.json`: `X-Robots-Tag: noindex` su `/ticket/*`,
  `/activate`, `/account`, `/demo/*`, `/lanyard-rapier`.
- La pagina di manutenzione ha le stesse icone e la stessa scheda di
  condivisione; gli anteprimatori dei link la ricevono con un 200.
- `/info` e la pagina di manutenzione linkano Instagram, Facebook e il canale
  WhatsApp.
- Sorgenti del logo: `~/Desktop/underclub_gestione/26_winter/logo/`
  (`full-textmark.svg`, lettere singole in `letters/`).

Da fare sul sito: dati strutturati `MusicEvent` per ogni serata (data, orario,
lineup, prezzo, link: fanno comparire le serate negli eventi di Google) e un
paragrafo vero in `/info`.

## Google Business Profile
- La scheda esiste: **UNDERCLUB**, categoria Discoteca, indirizzo e sito
  giusti. Mancano orari, foto, recensioni. Non mostra "Rivendica questa
  attività": probabilmente qualcuno l'ha già rivendicata.
  https://www.google.com/maps/place/UNDERCLUB/@40.7309627,8.5547431,17z/data=!4m6!3m5!1s0x12dc635f0addd58d:0x5e3eb669290f7129!8m2!3d40.7309627!4d8.5547431!16s%2Fg%2F11npx52bwc
- Allo stesso indirizzo c'è **Ristorante Pancho Villa** (attivo, 4,2 stelle):
  è un'altra attività, non va toccata.
- Da fare (Lucio): da business.google.com capire se la scheda è già sua o del
  team; altrimenti chiedere l'accesso dal flusso di rivendicazione (Google
  mostra un indizio dell'email del proprietario). Poi: descrizione italiana,
  link social, foto, un post per ogni serata, orari solo come "orari speciali"
  nelle notti di apertura.
- Altrove l'indirizzo è sbagliato: Sound Underground mette Underclub in "Via
  Corso Trinità" (pagina dell'evento Breakout — The Last Dance). Da far
  correggere.

## Resident Advisor
- Account RA intestato al club: utente **Underclub**, email
  `info@underclub.it` (nome "Underclub", cognome "Sassari"). Gli account
  personali si aggiungono come utenti.
- Pagina del locale creata il 2026-10-02: **https://ra.co/clubs/304274**, con
  indirizzo, capienza 250, bio inglese e sito `https://underclub.it/?src=ra`.
- Su RA i locali nascono dal modulo di invio evento
  (`https://ra.co/pro/submit-event-venue.aspx?create-event-form`) e la
  redazione li pubblica; RA Pro non ha una sezione per gestire i locali.
- **Approvata il 2026-10-02** dal supporto RA (Ana, Platform Support): pagina
  pubblicata, logo impostato, eventi "TBA - Underclub" uniti sotto Underclub.
- Le pagine dei locali le gestisce solo lo staff RA: per ogni modifica
  (descrizione, foto, dati) si scrive a `promotersupport@ra.co`, rispondendo
  al thread con Ana.
- Le serate le pubblicano i promoter (Technoroom, Breakout Sardinia) dai loro
  account: d'ora in poi devono scegliere il locale Underclub, non "TBA". Una
  pagina promoter "Underclub" serve solo per serate organizzate dal club.
- Contatti RA: `promotersupport@ra.co` (RA Pro), `community@ra.co` (generale).

## Link tracciati
- Il sito salva sulla prenotazione `?src=` (o `?utm_source=` in mancanza) nella
  colonna `reservations.source`; gli altri UTM sono ignorati. Vale il primo
  arrivo nella scheda; aprire il link in un altro browser lo perde.
- Decisione 2026-10-02: niente statistiche delle visite per ora, basta sapere
  chi prenota da RA. Su RA si usa `https://underclub.it/?src=ra`.
- Codici consigliati se servono altri canali: `ig-bio`, `ig-story-<serata>`,
  `wa-canale`, `fb`, `volantino-<mese>`.
- Prenotazioni confermate da RA, serata per serata (solo lettura):

```bash
ssh root@178.104.44.21 "docker exec -i supabase-db psql -U supabase_admin -d postgres" <<'SQL'
select e.title, e.date, count(*) as da_ra
from underclub.reservations r join underclub.events e on e.id = r.event_id
where r.source = 'ra' and r.status = 'confirmed'
group by e.title, e.date order by e.date;
SQL
```

## All'apertura
- Search Console: proprietà di dominio `underclub.it` (verifica con un record
  TXT; forse vale già quello di Postmaster se l'account Google è lo stesso),
  invio della sitemap. Il vecchio sito è ancora indicizzato come "Technoroom -
  Underclub" e si aggiornerà da solo.
- Facebook Sharing Debugger ("Scrape Again") se l'anteprima resta vecchia.
