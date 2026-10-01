# DNS di `underclub.it` — cosa aggiungere al momento del wiring

Preparato il 2026-10-01. Applicate le sezioni D (Postmaster) ed E (inoltro
`info@`), il 2026-10-01; A, B e C restano da fare.

## Dove sta il DNS

La zona **non** è gestita dal registrar: i nameserver sono
`ns1.vercel-dns.com` / `ns2.vercel-dns.com`, e la zona sta nel team Vercel
`lucios-projects-aef0021a`, creata da `luciogratani` (verificato il 2026-10-01
con `vercel domains inspect underclub.it`). Ai record si arriva da Vercel →
Domains → `underclub.it`, oppure con `vercel dns add`. Le chiavi del
proprietario servono solo per cambiare i nameserver al registrar, cosa che qui
non serve.

Record presenti oggi (`vercel dns ls underclub.it`): tre CAA (Google,
Sectigo, Let's Encrypt), ALIAS sulla root e ALIAS wildcard `*`, tutti di
default Vercel. Nessun MX e nessun TXT prima delle sezioni D ed E.

## Prima del wiring (non richiede il DNS)

1. **Resend** (regione **EU, Ireland / eu-west-1**): aggiungere i domini
   `reservations.underclub.it` e `news.underclub.it`. Resta tutto "pending"
   finché non ci sono i record, ma Resend mostra subito i valori, compresa la
   chiave DKIM, che è unica per ogni dominio e va copiata nella tabella sotto.
2. **Resend**: creare una API key con permesso "Sending access", limitata a
   `reservations.underclub.it`. Va in `RESEND_API_KEY` su Vercel.
3. **Google Postmaster Tools**: dominio già aggiunto, valori qui sotto.
   Confermare che il dominio inserito sia `underclub.it`, la root, e non un
   sottodominio: i nomi qui sotto lo presuppongono.
4. **Test del preview senza DNS**: finché il dominio non è verificato, sul
   preview si può usare `EMAIL_FROM="Underclub <onboarding@resend.dev>"`.
   Resend lo accetta, ma consegna solo all'email del proprietario
   dell'account Resend: basta per provare prenotazione, link e ticket.

## Record da aggiungere

I nomi sono relativi a `underclub.it`: `send.reservations` significa
`send.reservations.underclub.it`, e `@` è la root.

### A. Email transazionali — `reservations.underclub.it` (Resend)

| Nome | Tipo | Valore | Priorità |
|---|---|---|---|
| `send.reservations` | MX | `feedback-smtp.eu-west-1.amazonses.com` | 10 |
| `send.reservations` | TXT | `v=spf1 include:amazonses.com ~all` | |
| `resend._domainkey.reservations` | TXT | `p=…` **(da copiare da Resend)** | |

### B. Email promozionali — `news.underclub.it` (Resend)

| Nome | Tipo | Valore | Priorità |
|---|---|---|---|
| `send.news` | MX | `feedback-smtp.eu-west-1.amazonses.com` | 10 |
| `send.news` | TXT | `v=spf1 include:amazonses.com ~all` | |
| `resend._domainkey.news` | TXT | `p=…` **(da copiare da Resend)** | |

Un sottodominio separato per le promozionali tiene la reputazione dei
ticket al riparo da quella delle newsletter. Le email promozionali dovranno
avere il link di disiscrizione con un clic (header `List-Unsubscribe`),
richiesto da Gmail e Yahoo e già deciso per la revoca dei consensi.

### C. DMARC — tutto il dominio

| Nome | Tipo | Valore |
|---|---|---|
| `_dmarc` | TXT | `v=DMARC1; p=none;` |

Vale anche per i sottodomini. Si parte da `p=none`, che osserva senza
bloccare, e si stringe a `p=quarantine` dopo qualche settimana di invii puliti
visti in Postmaster. Per ricevere i report aggregati serve `rua=mailto:…`
verso una casella esistente (vedi E).

### D. Google Postmaster Tools — verifica del dominio (APPLICATO 2026-10-01)

| Nome | Tipo | Valore |
|---|---|---|
| `@` | TXT | `google-site-verification=w0Rk_jsgyx3ZWKurk8ShSLgI4nhgOYWHFzlD5w5w2Ww` |
| `a4da624kvswx` | CNAME | `gv-ykmswailjaspup.dv.googlehosted.com` |

Google offre i due metodi in alternativa: ne basta uno, metterli entrambi non
fa danni.

### E. Casella `info@underclub.it` — inoltro ImprovMX (APPLICATO 2026-10-01)

Il sito (privacy, `/info`, `/account`) indica `info@underclub.it` come
indirizzo per la revoca dei consensi e per i contatti. La casella non è mai
esistita (confermato dal proprietario del dominio): ora è un alias
ImprovMX (piano gratuito, account di Lucio) che inoltra alla email personale
di chi gestisce il sito. Nessuna casella vera: rispondere *come* `info@`
richiederebbe "Invia come" con un SMTP (passo facoltativo, non fatto).

| Nome | Tipo | Valore | Priorità |
|---|---|---|---|
| `@` | MX | `mx1.improvmx.com` | 10 |
| `@` | MX | `mx2.improvmx.com` | 20 |
| `@` | TXT | `v=spf1 include:spf.improvmx.com ~all` | |

Se un giorno serve una casella vera (Google Workspace, Zoho, …) si cambiano
solo questi tre record. L'SPF sulla root non interferisce con Resend, che usa
i sottodomini `send.*`.

Da impostare su Vercel: `EMAIL_REPLY_TO=info@underclub.it`.
Le risposte alle email dei ticket arrivano lì: `reservations.underclub.it`
non ha una casella.

## Comandi (Vercel CLI, dal team `lucios-projects-aef0021a`)

```bash
vercel dns add underclub.it send.reservations MX feedback-smtp.eu-west-1.amazonses.com 10
vercel dns add underclub.it send.reservations TXT 'v=spf1 include:amazonses.com ~all'
vercel dns add underclub.it resend._domainkey.reservations TXT 'p=DA_RESEND'

vercel dns add underclub.it send.news MX feedback-smtp.eu-west-1.amazonses.com 10
vercel dns add underclub.it send.news TXT 'v=spf1 include:amazonses.com ~all'
vercel dns add underclub.it resend._domainkey.news TXT 'p=DA_RESEND'

vercel dns add underclub.it _dmarc TXT 'v=DMARC1; p=none;'

# fatti il 2026-10-01:
vercel dns add underclub.it @ MX mx1.improvmx.com 10
vercel dns add underclub.it @ MX mx2.improvmx.com 20
vercel dns add underclub.it @ TXT 'v=spf1 include:spf.improvmx.com ~all'
vercel dns add underclub.it @ TXT 'google-site-verification=w0Rk_jsgyx3ZWKurk8ShSLgI4nhgOYWHFzlD5w5w2Ww'
vercel dns add underclub.it a4da624kvswx CNAME gv-ykmswailjaspup.dv.googlehosted.com
```

Il valore MX `feedback-smtp.eu-west-1…` vale per la regione EU. Se in Resend
si sceglie un'altra regione, valgono i valori mostrati da Resend: in caso di
dubbio, Resend ha l'ultima parola.

## Verifica dopo il wiring

```bash
dig +short TXT send.reservations.underclub.it
dig +short MX send.reservations.underclub.it
dig +short TXT resend._domainkey.reservations.underclub.it
dig +short TXT _dmarc.underclub.it
dig +short TXT underclub.it
dig +short MX underclub.it
dig +short CNAME a4da624kvswx.underclub.it
```

Poi: "Verify" su Resend per entrambi i domini, "Verify" su Postmaster,
un'email di prova a un indirizzo Gmail ("Mostra originale": SPF, DKIM e DMARC
devono risultare tutti `PASS`).

## Nello stesso momento, ma fuori dal DNS: il dominio del sito

`underclub.it` e `www.underclub.it` oggi sono collegati al vecchio progetto
Vercel `underclub`, non a `underclub-2-0-web`. Spostarli a
`underclub-2-0-web` (Vercel → progetto → Settings → Domains) è il momento in
cui il sito nuovo va online. I record DNS non cambiano: restano gli ALIAS di
Vercel. Su `underclub-2-0-web` servono allora `PUBLIC_SITE_URL=https://underclub.it`
e `ALLOWED_ORIGINS=https://www.underclub.it`.
