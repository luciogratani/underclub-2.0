import { Link } from "react-router-dom";
import TextRing from "./TextRing";
import HeroButton from "./HeroButton";
import InfoCircle from "./icons/InfoCircle";

type HeroProps = {
  onNextDateClick?: () => void;
  onAboutClick?: () => void;
  isExited?: boolean;
  showNextDateButton?: boolean;
  nextDateIso?: string | null;
  nextEventTitle?: string | null;
};

export default function Hero({
  onNextDateClick,
  onAboutClick,
  isExited = false,
  showNextDateButton = true,
  nextDateIso,
  nextEventTitle,
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
        <TextRing nextDateIso={nextDateIso} nextEventTitle={nextEventTitle} />
      </div>
      <div className="absolute bottom-22 left-1/2 z-20 flex -translate-x-1/2 scale-75 flex-col items-center gap-4">
        <div
          className={`flex flex-row items-center justify-center gap-4 transition-all duration-300 ease-out ${
            showNextDateButton
              ? `${isExited ? "scale-[1.08]" : "scale-100"} opacity-100 translate-y-0`
              : "scale-95 opacity-0 translate-y-2 pointer-events-none"
          }`}
        >
          <Link
            to="/info"
            aria-label="Info e link utili"
            className="flex size-14 shrink-0 items-center justify-center rounded-full bg-black text-primary ring-1 ring-primary/30 transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <InfoCircle className="size-[22px]" />
          </Link>
          <HeroButton
            title="NEXT DATE"
            direction="right"
            onClick={onNextDateClick}
          />
        </div>
        {onAboutClick && (
          <div
            className={`transition-transform duration-300 ease-out ${isExited ? "scale-85" : "scale-100"}`}
          >
            <HeroButton title="ABOUT" direction="left" onClick={onAboutClick} />
          </div>
        )}
      </div>
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