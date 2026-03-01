import TextRing from "./TextRing";
import HeroButton from "./HeroButton";

type HeroProps = {
  onNextDateClick?: () => void;
  isExited?: boolean;
};

export default function Hero({ onNextDateClick, isExited = false }: HeroProps) {
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
        <TextRing />
      </div>
      <div className="absolute bottom-18 left-1/2 -translate-x-1/2 scale-75 flex flex-col items-center gap-4">
        <div
          className={`transition-transform duration-300 ease-out ${isExited ? "scale-[1.08]" : "scale-100"}`}
        >
          <HeroButton
            title="NEXT DATE"
            direction="right"
            onClick={onNextDateClick}
          />
        </div>
        <div
          className={`transition-transform duration-300 ease-out ${isExited ? "scale-85" : "scale-100"}`}
        >
          <HeroButton title="ABOUT" direction="left" />
        </div>
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