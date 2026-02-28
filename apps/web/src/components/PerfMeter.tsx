import { useEffect, useState } from "react";

export default function PerfMeter() {
  const [fps, setFps] = useState(0);
  const [frameMs, setFrameMs] = useState(0);

  useEffect(() => {
    let last = performance.now();
    let frames = 0;
    let elapsed = 0;
    const tick = (now: number) => {
      elapsed += now - last;
      last = now;
      frames += 1;
      if (elapsed >= 250) {
        setFps(Math.round((frames * 1000) / elapsed));
        setFrameMs(elapsed / frames);
        frames = 0;
        elapsed = 0;
      }
      id = requestAnimationFrame(tick);
    };
    let id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div
      className="fixed top-3 right-3 z-[10000] pointer-events-none font-mono text-xs text-black/80 bg-white/90 backdrop-blur-sm px-2 py-1 rounded border border-black/10 select-none opacity-50"
      aria-hidden
    >
      <span className="tabular-nums">{fps}</span> fps ·{" "}
      <span className="tabular-nums">{frameMs.toFixed(1)}</span> ms
    </div>
  );
}
