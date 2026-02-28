import TextRing from "./TextRing";
import HeroButton from "./HeroButton";

export default function Hero() {
  return (
    <section
      className="flex items-center justify-center w-[100vw] min-h-[100svh] bg-black"
      style={{ height: "100svh" }}
    >
      <div className="relative w-[95%] h-[90%] bg-primary rounded-3xl overflow-hidden flex flex-col items-center justify-end pb-6">
        <TextRing />
        <div className="origin-bottom scale-75 flex flex-col items-center gap-4">
          <HeroButton title="NEXT DATE" direction="right" />
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