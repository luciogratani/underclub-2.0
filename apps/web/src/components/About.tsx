type AboutProps = {
  onBack?: () => void;
};

export default function About({ onBack: _onBack }: AboutProps) {
  return (
    <section
      className="relative flex flex-col items-center justify-center min-w-[100vw] w-[100vw] min-h-[100svh] shrink-0 snap-start snap-always bg-primary"
      style={{ height: "100svh" }}
      aria-label="About"
    >
      <p className="text-[50px] font-bold text-black">ABOUT</p>
    </section>
  );
}
