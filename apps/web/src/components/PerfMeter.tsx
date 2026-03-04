import { useEffect, useState } from "react";

function AlertIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v4" />
      <path d="M12 16h.01" />
    </svg>
  );
}

type PerfMeterProps = {
  onTriggerError?: () => void;
};

export default function PerfMeter({ onTriggerError }: PerfMeterProps) {
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
      className="fixed top-3 right-3 z-[10000] flex items-center gap-1.5 font-mono text-xs text-black/80 bg-white/90 backdrop-blur-sm pl-2 pr-1 py-1 rounded border border-black/10 select-none opacity-15 hover:opacity-85 transition-opacity duration-200"
      aria-hidden
    >
      <span className="tabular-nums">{fps}</span> fps ·{" "}
      <span className="tabular-nums">{frameMs.toFixed(1)}</span> ms
      {onTriggerError && (
        <button
          type="button"
          onClick={onTriggerError}
          className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center border border-black/20 hover:bg-black/10 focus:outline-none focus:ring-2 focus:ring-black/30"
          aria-label="Mostra toast errore test"
        >
          <AlertIcon className="w-3 h-3 text-black/80" />
        </button>
      )}
    </div>
  );
}
