import { Suspense, lazy, useEffect } from 'react';

/**
 * Standalone page for the previous, Rapier-based lanyard — kept for reference
 * after `Lanyard.tsx` moved to the dedicated XPBD solver. Unlinked.
 *
 * The component is lazy so the ~840 kB gz of Rapier WASM is downloaded only when
 * this route is opened; nothing in the ticket flow imports it.
 */

const LanyardRapier = lazy(() => import('../components/Lanyard/LanyardRapier'));

const DEMO_TOKEN = 'DEMO-LANYARD-RAPIER-000000000000000000000';

export default function LanyardRapierDemo() {
  // Same document lock as the ticket page, so dragging is not stolen by scroll.
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

  return (
    <section
      className="fixed inset-0 z-0 h-[100dvh] w-full overflow-hidden bg-primary touch-none"
      aria-label="Ticket lanyard (Rapier)"
    >
      <Suspense fallback={null}>
        <LanyardRapier qrToken={DEMO_TOKEN} />
      </Suspense>
      <p className="pointer-events-none absolute left-4 top-4 z-10 text-[11px] font-semibold uppercase tracking-[0.2em] text-black/60">
        Lanyard · Rapier (precedente)
      </p>
    </section>
  );
}
