import { Suspense, lazy, useEffect, useRef, useState } from 'react';

/**
 * A/B bench for the lanyard physics — not part of the public funnel, reachable
 * only by typing /demo/lanyard.
 *
 * Both engines render the exact same scene, so switching only swaps the
 * simulation. Each is lazy-loaded on its own, which means picking "Verlet"
 * from a cold load never downloads the Rapier WASM at all — visible in the
 * Network tab, which is half the point of the comparison.
 */

const LanyardRapier = lazy(() => import('../components/Lanyard/Lanyard'));
const LanyardVerlet = lazy(() => import('../components/Lanyard/LanyardVerlet'));

type Engine = 'rapier' | 'verlet';

const ENGINES: { id: Engine; label: string; sub: string; cost: string }[] = [
  {
    id: 'rapier',
    label: 'Rapier',
    sub: 'WASM · attuale',
    cost: '+843 kB gz',
  },
  {
    id: 'verlet',
    label: 'Verlet',
    sub: 'JS · nuovo',
    cost: '+0 kB gz',
  },
];

const DEMO_TOKEN = 'DEMO-LANYARD-LAB-0000000000000000000000';

function FpsMeter() {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let raf = 0;
    let frames = 0;
    let last = performance.now();
    let worst = 0;

    const tick = (now: number) => {
      frames += 1;
      const elapsed = now - last;
      if (elapsed >= 500) {
        const fps = Math.round((frames * 1000) / elapsed);
        worst = worst === 0 ? fps : Math.min(worst, fps);
        if (ref.current) ref.current.textContent = `${fps} fps · min ${worst}`;
        frames = 0;
        last = now;
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return <span ref={ref}>— fps</span>;
}

export default function LanyardLab() {
  const [engine, setEngine] = useState<Engine>('verlet');
  const [runId, setRunId] = useState(0);

  // The ticket page locks the document while the card is mounted; do the same
  // here so drag gestures are not stolen by page scroll on mobile.
  useEffect(() => {
    const prevHtml = document.documentElement.style.overflow;
    const prevBody = document.body.style.overflow;
    const prevTouch = document.body.style.touchAction;
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';
    return () => {
      document.documentElement.style.overflow = prevHtml;
      document.body.style.overflow = prevBody;
      document.body.style.touchAction = prevTouch;
    };
  }, []);

  const active = ENGINES.find((e) => e.id === engine)!;

  return (
    <section className="fixed inset-0 z-0 h-[100dvh] w-full overflow-hidden bg-primary touch-none">
      <div className="absolute inset-0 z-0">
        <Suspense fallback={null}>
          {engine === 'rapier' ? (
            <LanyardRapier key={`rapier-${runId}`} qrToken={DEMO_TOKEN} />
          ) : (
            <LanyardVerlet key={`verlet-${runId}`} qrToken={DEMO_TOKEN} resetKey={runId} />
          )}
        </Suspense>
      </div>

      {/* Controls sit above the canvas but must not swallow drag gestures
          outside their own bounds, hence the pointer-events split. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col gap-3 p-4">
        <div className="flex items-baseline justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-black/60">
            Lanyard lab
          </p>
          <p className="font-mono text-[11px] tabular-nums text-black/60">
            <FpsMeter />
          </p>
        </div>

        <div className="pointer-events-auto flex gap-2">
          {ENGINES.map((item) => {
            const isActive = item.id === engine;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setEngine(item.id);
                  setRunId((n) => n + 1);
                }}
                aria-pressed={isActive}
                className={[
                  'flex-1 rounded-none border px-3 py-2 text-left transition-colors duration-150',
                  isActive
                    ? 'border-black bg-black text-primary'
                    : 'border-black/30 bg-transparent text-black/70 hover:border-black/60',
                ].join(' ')}
              >
                <span className="block text-sm font-bold uppercase leading-none">{item.label}</span>
                <span className="mt-1 block text-[10px] uppercase tracking-wider opacity-70">
                  {item.sub}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-end justify-between gap-3 p-4">
        <p className="max-w-[62%] text-[11px] leading-snug text-black/60">
          Motore attivo: <span className="font-semibold text-black">{active.label}</span> ·{' '}
          <span className="font-mono">{active.cost}</span> sulla route ticket.
          <br />
          Trascina la card per confrontare oscillazione, torsione e rilascio.
        </p>
        <button
          type="button"
          onClick={() => setRunId((n) => n + 1)}
          className="pointer-events-auto border border-black px-4 py-2 text-xs font-bold uppercase tracking-wider text-black transition-colors duration-150 hover:bg-black hover:text-primary"
        >
          Rilancia
        </button>
      </div>
    </section>
  );
}
