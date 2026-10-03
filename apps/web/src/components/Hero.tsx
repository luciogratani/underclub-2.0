import type { Ref } from "react";
import TextRing from "./TextRing";
import HeroButton from "./HeroButton";
import TicketIcon from "./icons/Ticket";

type HeroProps = {
  /** Phrases of the ring (see TextRing). */
  ringWords: readonly string[];
  /** Label of the pill under the ring: NEXT DATE (a night) or FOLLOW US (none). */
  pillTitle: string;
  onPillClick?: () => void;
  /** The pill button (e.g. to give focus back when a panel it opened closes). */
  pillRef?: Ref<HTMLButtonElement>;
  onAboutClick?: () => void;
  isExited?: boolean;
  /** Pill, ticket button: hidden while loading and during the intro. */
  showButtons?: boolean;
  /** Short line in the middle of the ring (e.g. the dates could not be loaded). */
  notice?: string | null;
  /** Ticket of the next confirmed reservation; shows the ticket button. */
  ticketUrl?: string | null;
};

export default function Hero({
  ringWords,
  pillTitle,
  onPillClick,
  pillRef,
  onAboutClick,
  isExited = false,
  showButtons = true,
  notice = null,
  ticketUrl = null,
}: HeroProps) {
  return (
    <section
      className="relative flex items-center justify-center min-w-[100vw] w-[100vw] min-h-[100svh] shrink-0 snap-start snap-always bg-black z-100"
      style={{ height: "100svh" }}
      aria-label="Home"
    >
      <div
        className={`relative bg-primary overflow-hidden flex flex-col items-center transition-all duration-300 ease-out ${
          isExited ? "w-[100%] h-[100%] rounded-none" : "w-[95%] h-[88%] rounded-3xl"
        }`}
      >
        <TextRing words={ringWords} />
      </div>
      {notice && (
        // Between the ring and the pill: the ring's band leaves no room inside it.
        <p
          role="status"
          className={`absolute bottom-40 left-1/2 z-20 w-[80%] -translate-x-1/2 text-center font-sans text-[14px] font-medium leading-tight text-black transition-opacity duration-300 ${
            showButtons ? "opacity-100" : "opacity-0"
          }`}
        >
          {notice}
        </p>
      )}
      <div className="absolute bottom-22 left-1/2 z-20 flex -translate-x-1/2 scale-75 flex-col items-center gap-4">
        <div
          className={`flex flex-row items-center justify-center gap-4 transition-all duration-300 ease-out ${
            showButtons
              ? `${isExited ? "scale-[1.08]" : "scale-100"} opacity-100 translate-y-0`
              : "scale-95 opacity-0 translate-y-2 pointer-events-none"
          }`}
        >
          <HeroButton ref={pillRef} title={pillTitle} direction="right" onClick={onPillClick} />
        </div>
        {onAboutClick && (
          <div
            className={`transition-transform duration-300 ease-out ${isExited ? "scale-85" : "scale-100"}`}
          >
            <HeroButton title="ABOUT" direction="left" onClick={onAboutClick} />
          </div>
        )}
      </div>
      {ticketUrl && (
        // Bottom left, mirroring the menu button (bottom right).
        <a
          href={ticketUrl}
          aria-label="Open your ticket"
          className={`absolute bottom-[calc(1rem+env(safe-area-inset-bottom,0px))] left-4 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-black text-primary ring-2 ring-primary transition-all duration-300 ease-out ${
            showButtons ? "scale-100 opacity-100" : "scale-95 opacity-0 pointer-events-none"
          }`}
        >
          <TicketIcon className="h-6 w-6" />
        </a>
      )}
    </section>
  );
}

/*

<TextureOverlay />
        <HalftoneOverlay
          colorBack="#000000"
          colorFront="#ff5e2900"
          size={0.8}
          radius={0.84}
          grid="hex"
          opacity={0.25}
          grainMixer={0.5}
          grainSize={0.35}
          angle={12}
          luminanceScale={5}
          softness={3}
          luminanceNoiseMin={0.75}
          luminanceNoiseMax={2.8}
          luminanceNoiseSpeed={0.1}
          grainSizeMin={0.1}
          grainSizeMax={2}
          grainSizeSpeed={0.0000008}
          luminanceDriftSpeed={1}
        />

*/