export default function Info() {
  return (
    <section
      className="min-h-[100svh] w-full bg-black text-primary"
      aria-label="Info"
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
        <h1 className="text-[12vw] font-bold leading-[0.95] uppercase">
          Info / Quick
          <br />
          Links
        </h1>

        <div className="mt-8 space-y-8">
          <div>
            <p className="font-sans font-light text-[4vw] tracking-wide opacity-85 ">
               contact us
            </p>
            <div className="mt-1">
              <a
                href="mailto:info@underclub.it"
                className="block text-[12vw] font-bold leading-[0.95] uppercase"
              >
                Email
              </a>
              <a
                href="https://wa.me/3930000000000"
                target="_blank"
                rel="noreferrer"
                className="block text-[12vw] font-bold leading-[0.95] uppercase"
              >
                WhatsApp
              </a>
            </div>
          </div>

          <div>
            <p className="font-sans font-light text-[4vw] tracking-wide opacity-85">
              find us
            </p>
            <div className="mt-1">
              <a
                href="https://maps.google.com/?q=Underclub+Porto+Torres"
                target="_blank"
                rel="noreferrer"
                className="block text-[12vw] font-bold leading-[0.95] uppercase"
              >
                Google Maps
              </a>
            </div>
          </div>

          <div>
            <p className="font-sans font-light text-[4vw] tracking-wide opacity-85">
              follow us
            </p>
            <div className="mt-1">
              <a
                href="https://instagram.com"
                target="_blank"
                rel="noreferrer"
                className="block text-[12vw] font-bold leading-[0.95] uppercase"
              >
                Instagram
              </a>
              <a
                href="https://facebook.com"
                target="_blank"
                rel="noreferrer"
                className="block text-[12vw] font-bold leading-[0.95] uppercase"
              >
                Facebook
              </a>
            </div>
          </div>

          <div>
            <p className="font-sans font-light text-[4vw] tracking-wide opacity-85">
              policies
            </p>
            <div className="mt-1">
              <a
                href="/info/privacy-cookie"
                className="block text-[12vw] font-bold leading-[0.95] uppercase"
              >
                privacy / cookie
              </a>
            </div>
          </div>
        </div>

        <div className="mt-12 h-px w-full bg-primary/40" />

        <footer className="mt-6 font-sans leading-snug">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-[3vw] font-light tracking-wide opacity-60 md:text-xs">
              the company
              </p>
              <p className="mt-1 text-[3.3vw] font-medium uppercase md:text-sm">
                Pancho Villa SRLS
              </p>
              <p className="text-[3vw] opacity-70 md:text-xs">
                V.le Porto Torres 3 — 07100 Sassari (SS)
              </p>
              <p className="text-[3vw] opacity-70 md:text-xs">
                P. IVA 02922780909
              </p>
            </div>

            <div className="sm:text-right">
              <p className="text-[3vw] font-light tracking-wide opacity-60 md:text-xs">
                made by
              </p>
              <p className="mt-1 text-[3.3vw] font-medium uppercase md:text-sm">
                V2.0 — Lucio Gratani
              </p>
              <p className="text-[3vw] opacity-70 md:text-xs">
                made with care for Emanuela
              </p>
            </div>
          </div>

          <p className="mt-6 text-[3vw] uppercase tracking-wide opacity-50 md:text-xs">
            © {new Date().getFullYear()} Underclub
          </p>
        </footer>
      </div>
    </section>
  );
}
