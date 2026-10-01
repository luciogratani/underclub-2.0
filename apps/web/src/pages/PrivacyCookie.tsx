import { BOOKING_API } from "../lib/flags";

export default function PrivacyCookie() {
  return (
    <section
      className="min-h-[100svh] w-full bg-black text-primary"
      aria-label="Privacy e Cookie"
    >
      <div
        className="relative h-32 w-full overflow-hidden bg-primary"
        aria-hidden
      >
        <picture>
          <source srcSet="/hero-orizzontale-4-1080.webp" type="image/webp" />
          <img
            src="/hero-orizzontale-4-1080.gif"
            alt=""
            className="h-full w-full object-cover object-center translate-y-[2%]"
            decoding="async"
          />
        </picture>
      </div>

      <div className="mx-auto w-full max-w-3xl px-4 pb-10 pt-6">
        <a
          href="/info"
          className="inline-block font-sans text-sm font-light tracking-wide opacity-60 transition-opacity hover:opacity-100"
        >
          ← back to info
        </a>

        <h1 className="mt-4 text-5xl font-bold uppercase leading-[0.95] sm:text-6xl md:text-7xl">
          Privacy
          <br />
          / Cookie
        </h1>

        <p className="mt-5 max-w-prose font-sans text-base leading-relaxed opacity-75">
          {BOOKING_API ? (
            <>
              In due parole: chiediamo i dati che ci servono per farti entrare.
              Niente tracciamento e niente pubblicità; email promozionali e
              profilazione solo se ce lo chiedi tu, con due consensi separati.{/* COPY-DRAFT */}
            </>
          ) : (
            <>
              In due parole: chiediamo i dati che ci servono per farti entrare,
              nient'altro. Niente tracciamento, niente marketing, niente pubblicità.
            </>
          )}
        </p>
        <p className="mt-2 font-sans text-xs uppercase tracking-wide opacity-50">
          Ultimo aggiornamento: 17 aprile 2026
        </p>

        <div className="mt-12 space-y-12 font-sans">
          <PolicySection label="who we are" title="Il titolare">
            <p>
              Titolare del trattamento è <strong>Pancho Villa SRLS</strong>, con
              sede in V.le Porto Torres 3 — 07100 Sassari (SS), P. IVA
              02922780909, che gestisce il locale Underclub.
            </p>
            <p>
              Per qualsiasi questione sui tuoi dati puoi scrivere a{" "}
              <a
                href="mailto:info@underclub.it"
                className="underline underline-offset-4"
              >
                info@underclub.it
              </a>
              .
            </p>
          </PolicySection>

          <PolicySection label="what we collect" title="I dati che raccogliamo">
            <p>Quando prenoti il tuo ingresso ti chiediamo tre cose:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <strong>nome e cognome</strong> — per associare la prenotazione
                alla persona che entra
              </li>
              <li>
                <strong>data di nascita</strong> — per verificare la maggiore
                età, essendo Underclub un locale di intrattenimento notturno
              </li>
              <li>
                <strong>indirizzo email</strong> — per inviarti il link al
                biglietto digitale
              </li>
            </ul>
            <p>
              Il sistema registra automaticamente anche due informazioni
              tecniche legate al biglietto: il momento in cui lo apri sul tuo
              telefono e quello in cui il QR viene scansionato all'ingresso.
            </p>
            {BOOKING_API ? (
              <p>
                Non raccogliamo documenti d'identità, numero di telefono, dati di
                pagamento o cronologia di navigazione. Usiamo lo storico delle
                tue prenotazioni per la profilazione solo se ci dai il consenso
                facoltativo descritto più sotto.{/* COPY-DRAFT */}
              </p>
            ) : (
              <p>
                Non raccogliamo documenti d'identità, numero di telefono, dati di
                pagamento, indirizzo IP, cronologia di navigazione o dati di
                profilazione.
              </p>
            )}
          </PolicySection>

          <PolicySection label="why we collect them" title="Perché li trattiamo">
            <p>I tuoi dati ci servono solo per:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                gestire la tua prenotazione e l'ingresso in lista — esecuzione
                del servizio che ci hai chiesto (art. 6.1.b GDPR)
              </li>
              <li>
                verificare la maggiore età come richiesto dalle norme sui
                pubblici esercizi notturni — obbligo legale (art. 6.1.c GDPR)
              </li>
              <li>recapitarti il biglietto digitale via email</li>
            </ul>
            {BOOKING_API ? (
              <p>
                Email promozionali e profilazione sono facoltative e richiedono
                ciascuna un consenso esplicito e separato: le trovi descritte
                nella sezione sui consensi.{/* COPY-DRAFT */}
              </p>
            ) : (
              <p>
                Non facciamo marketing, non mandiamo newsletter, non profiliamo.
                Se un giorno decidessimo di farlo, te lo chiederemmo con un
                consenso esplicito e separato da questa informativa.
              </p>
            )}
          </PolicySection>

          {BOOKING_API && (
            <PolicySection
              label="your account" // COPY-DRAFT
              title="Accesso senza password" // COPY-DRAFT
            >
              <p>
                Per prenotare non serve una password. La prima volta ci lasci
                nome, data di nascita ed email e ti mandiamo un link monouso,
                valido 30 minuti: aprendolo confermi la prenotazione e accedi.
                Finché il link non viene aperto la prenotazione resta in
                attesa e non ti garantisce il posto.{/* COPY-DRAFT */}
              </p>
              <p>
                Dopo l'accesso il sito ti riconosce e puoi prenotare le serate
                successive senza compilare di nuovo il modulo. Se il tuo
                dispositivo non ti riconosce più, puoi chiedere un nuovo link
                con la stessa email. Questo trattamento serve a fornirti il
                servizio che ci chiedi (art. 6.1.b GDPR).{/* COPY-DRAFT */}
              </p>
            </PolicySection>
          )}

          {BOOKING_API && (
            <PolicySection
              label="optional consents" // COPY-DRAFT
              title="Consensi facoltativi" // COPY-DRAFT
            >
              <p>
                Quando prenoti puoi darci, se vuoi, due consensi separati.
                Sono entrambi facoltativi, non preselezionati, e senza di loro
                la prenotazione funziona esattamente allo stesso modo (art. 6.1.a
                GDPR):{/* COPY-DRAFT */}
              </p>
              <ul className="list-disc space-y-1 pl-5">
                <li>
                  <strong>marketing</strong> — ti scriviamo via email per
                  annunciarti serate, line-up e inviti{/* COPY-DRAFT */}
                </li>
                <li>
                  <strong>profilazione</strong> — usiamo lo storico delle tue
                  prenotazioni (a quali serate vieni, con quale formula) per
                  scegliere cosa proporti{/* COPY-DRAFT */}
                </li>
              </ul>
              <p>
                Registriamo la data in cui dai ciascun consenso e quella in cui
                lo revochi. Puoi revocarli in qualsiasi momento, anche uno solo
                dei due, scrivendo a{" "}
                <a
                  href="mailto:info@underclub.it"
                  className="underline underline-offset-4"
                >
                  info@underclub.it
                </a>
                : la revoca vale da quel momento in poi.{/* COPY-DRAFT */}
              </p>
            </PolicySection>
          )}

          {BOOKING_API && (
            <PolicySection
              label="where you come from" // COPY-DRAFT
              title="Provenienza della prenotazione" // COPY-DRAFT
            >
              <p>
                Se arrivi sul sito da un link che contiene un codice di
                provenienza (per esempio quello di un volantino, di un
                manifesto o di una campagna, come <code>?src=volantino-ottobre</code>),
                lo registriamo insieme alla prenotazione. Ci serve solo a
                capire quali canali funzionano (legittimo interesse, art. 6.1.f
                GDPR).{/* COPY-DRAFT */}
              </p>
              <p>
                Il codice indica il canale, non la persona: resta nella memoria
                della scheda del browser (sessionStorage) fino alla sua
                chiusura e non usa cookie. Se arrivi senza codice, non
                registriamo nulla.{/* COPY-DRAFT */}
              </p>
            </PolicySection>
          )}

          {BOOKING_API && (
            <PolicySection
              label="against abuse" // COPY-DRAFT
              title="Protezione dagli abusi" // COPY-DRAFT
            >
              <p>
                Per proteggere i moduli di prenotazione e di accesso da invii
                automatici usiamo <strong>BotID</strong> di Vercel: quando invii
                uno di questi moduli, il browser esegue un controllo tecnico
                sulla richiesta per capire se arriva da una persona o da un
                programma. Serve solo a bloccare gli abusi, non crea alcun
                profilo e non viene usato per altro (legittimo interesse alla
                sicurezza del servizio, art. 6.1.f GDPR).{/* COPY-DRAFT */}
              </p>
              <p>
                Per limitare i tentativi ripetuti contiamo le richieste che
                arrivano dalla stessa rete. L'indirizzo IP non viene mai salvato
                in chiaro: lo usiamo solo in forma cifrata (hash), per finestre
                di pochi minuti, e il conteggio viene cancellato
                automaticamente entro due giorni.{/* COPY-DRAFT */}
              </p>
            </PolicySection>
          )}

          <PolicySection label="who sees the data" title="Chi vede i dati">
            <p>I tuoi dati li vediamo noi, più chi ci aiuta tecnicamente:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <strong>Supabase</strong> — host del database e delle API, come
                responsabile del trattamento, con infrastruttura in area UE
              </li>
              <li>
                <strong>Resend</strong> — provider che recapita il biglietto
                digitale al tuo indirizzo email, come responsabile del
                trattamento (
                <a
                  href="https://resend.com/legal/privacy-policy"
                  target="_blank"
                  rel="noreferrer"
                  className="underline underline-offset-4"
                >
                  privacy policy
                </a>
                )
              </li>
              <li>
                lo staff Underclub — ai tornelli, per controllare il tuo QR la
                sera dell'evento
              </li>
              {BOOKING_API && (
                <li>
                  <strong>Vercel</strong> — hosting del sito e delle funzioni
                  che gestiscono accesso e prenotazioni, come responsabile del
                  trattamento{/* COPY-DRAFT */}
                </li>
              )}
            </ul>
            <p>
              Non vendiamo, non scambiamo e non cediamo i tuoi dati a terzi per
              finalità commerciali.
            </p>
          </PolicySection>

          <PolicySection
            label="how long we keep them"
            title="Per quanto li teniamo"
          >
            <p>
              I dati della prenotazione restano salvati per il tempo necessario
              a gestire la serata e per i 12 mesi successivi, periodo entro il
              quale potremmo averne bisogno per ragioni amministrative,
              contabili o di sicurezza.
            </p>
            <p>
              Dopo di che vengono cancellati o anonimizzati. Puoi comunque
              chiederne la cancellazione anticipata in qualsiasi momento.
            </p>
            {BOOKING_API && (
              <p>
                Se lasci i tuoi dati ma non apri mai il link di conferma, il
                tuo contatto e le prenotazioni in attesa vengono cancellati
                dopo 7 giorni. I link di accesso, usati o no, vengono
                cancellati il giorno dopo la loro scadenza.{/* COPY-DRAFT */}
              </p>
            )}
          </PolicySection>

          <PolicySection label="your rights" title="I tuoi diritti">
            <p>In base al GDPR puoi:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>sapere se e come trattiamo i tuoi dati</li>
              <li>riceverne una copia (portabilità)</li>
              <li>correggerli se sono sbagliati</li>
              <li>farli cancellare</li>
              <li>limitare o opporti al trattamento</li>
              <li>
                fare reclamo al Garante per la Protezione dei Dati Personali —{" "}
                <a
                  href="https://www.garanteprivacy.it"
                  target="_blank"
                  rel="noreferrer"
                  className="underline underline-offset-4"
                >
                  garanteprivacy.it
                </a>
              </li>
            </ul>
            <p>
              Per esercitare uno qualunque di questi diritti basta scrivere a{" "}
              <a
                href="mailto:info@underclub.it"
                className="underline underline-offset-4"
              >
                info@underclub.it
              </a>
              . Niente moduli, niente domande inutili.
            </p>
          </PolicySection>

          <PolicySection label="cookies" title="Cookie & storage">
            <p>
              <strong>
                Underclub non usa cookie di tracciamento, analytics o
                pubblicitari.
              </strong>
            </p>
            <p>
              Usiamo solo una piccola memoria tecnica del browser
              (sessionStorage) per ricordare che hai già letto il banner
              informativo di benvenuto, così da non ripresentartelo a ogni
              schermata. Questa informazione resta sul tuo dispositivo, non
              viene mai trasmessa a noi e si cancella quando chiudi la scheda.
            </p>
            {BOOKING_API && (
              <p>
                Dopo che hai aperto il link di accesso impostiamo un solo
                cookie, <strong>uc_session</strong>: è un cookie tecnico
                strettamente necessario a riconoscerti quando prenoti, quindi
                non richiede consenso. Contiene solo un codice casuale, non è
                leggibile dagli script della pagina (httpOnly), dura 12 mesi e
                si rinnova ogni volta che usi il sito. Se esci dall'account
                viene cancellato.{/* COPY-DRAFT */}
              </p>
            )}
            <p>
              Le pagine esterne a cui linkiamo — Instagram, Facebook, WhatsApp,
              Google Maps — seguono le policy dei rispettivi gestori, su cui
              non abbiamo alcun controllo.
            </p>
          </PolicySection>

          <PolicySection label="changes" title="Modifiche all'informativa">
            <p>
              Se qualcosa di rilevante cambia, aggiorneremo questa pagina e la
              data di ultima modifica in alto. Per modifiche importanti ti
              avviseremo in modo visibile prima che entrino in vigore.
            </p>
          </PolicySection>
        </div>

        <div className="mt-12 h-px w-full bg-primary/40" />

        <footer className="mt-6 font-sans leading-snug">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-light tracking-wide opacity-60">
                the company
              </p>
              <p className="mt-1 text-sm font-medium uppercase">
                Pancho Villa SRLS
              </p>
              <p className="text-xs opacity-70">
                V.le Porto Torres 3 — 07100 Sassari (SS)
              </p>
              <p className="text-xs opacity-70">P. IVA 02922780909</p>
            </div>

            <div className="sm:text-right">
              <p className="text-xs font-light tracking-wide opacity-60">
                made by
              </p>
              <p className="mt-1 text-sm font-medium uppercase">
                V2.0 — Lucio Gratani
              </p>
              <p className="text-xs opacity-70">made with care for Emanuela</p>
            </div>
          </div>

          <p className="mt-6 text-xs uppercase tracking-wide opacity-50">
            © {new Date().getFullYear()} Underclub
          </p>
        </footer>
      </div>
    </section>
  );
}

type PolicySectionProps = {
  label: string;
  title: string;
  children: React.ReactNode;
};

function PolicySection({ label, title, children }: PolicySectionProps) {
  return (
    <section>
      <p className="font-sans text-base font-light tracking-wide opacity-85 sm:text-lg">
        {label}
      </p>
      <h2 className="mt-1 text-2xl font-bold uppercase leading-[0.95] sm:text-3xl">
        {title}
      </h2>
      <div className="mt-4 space-y-3 text-base leading-relaxed opacity-90">
        {children}
      </div>
    </section>
  );
}
