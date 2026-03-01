import { useEffect, useRef, useState } from "react";
import Hero from "./components/Hero";
import NextDate from "./components/NextDate";
import BookNow from "./components/BookNow";

function App() {
  const scrollRefH = useRef<HTMLDivElement>(null);
  const scrollRefV = useRef<HTMLDivElement>(null);
  const [heroExited, setHeroExited] = useState(false);
  const [nextDateExited, setNextDateExited] = useState(false);

  const scrollToNext = () => {
    const el = scrollRefH.current;
    if (!el) return;
    el.scrollTo({ left: el.clientWidth, behavior: "smooth" });
  };

  const scrollToPrev = () => {
    const el = scrollRefH.current;
    if (!el) return;
    el.scrollTo({ left: 0, behavior: "smooth" });
  };

  const goToNextDate = () => {
    setHeroExited(true);
    setTimeout(() => scrollToNext(), 300);
  };

  const goToBookNow = () => {
    setNextDateExited(true);
    setTimeout(() => {
      const el = scrollRefV.current;
      if (!el) return;
      el.scrollTo({ top: el.clientHeight, behavior: "smooth" });
    }, 300);
  };

  const scrollToTop = () => {
    const el = scrollRefV.current;
    if (!el) return;
    el.scrollTo({ top: 0, behavior: "smooth" });
  };

  useEffect(() => {
    const elH = scrollRefH.current;
    if (!elH) return;
    const onScrollH = () => {
      if (elH.scrollLeft === 0) setHeroExited(false);
    };
    elH.addEventListener("scroll", onScrollH, { passive: true });
    return () => elH.removeEventListener("scroll", onScrollH);
  }, []);

  useEffect(() => {
    const elV = scrollRefV.current;
    if (!elV) return;
    const onScrollV = () => {
      if (elV.scrollTop === 0) setNextDateExited(false);
    };
    elV.addEventListener("scroll", onScrollV, { passive: true });
    return () => elV.removeEventListener("scroll", onScrollV);
  }, []);

  return (
    <div
      ref={scrollRefV}
      className="h-[100svh] w-full overflow-y-auto overflow-x-hidden snap-y snap-mandatory scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      style={{ width: "100vw" }}
    >
      <div
        className="h-[100svh] min-h-[100svh] w-full shrink-0 snap-start snap-always overflow-hidden"
        style={{ width: "100vw" }}
      >
        <div
          ref={scrollRefH}
          className="flex h-full w-full overflow-x-auto overflow-y-hidden snap-x snap-mandatory scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <Hero onNextDateClick={goToNextDate} isExited={heroExited} />
          <NextDate onBack={scrollToPrev} onBookNowClick={goToBookNow} isExited={nextDateExited} />
        </div>
      </div>
      <BookNow onBack={scrollToTop} />
    </div>
  );
}

export default App;
