import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import CloseIcon from "./icons/Close";

const FADE_MS = 360; // same as the data notice fade

type OverlayPanelProps = {
  id: string;
  /** Accessible name of the dialog. */
  label: string;
  /** Accessible name of the round close button (bottom right). */
  closeLabel: string;
  /** Called once the fade-out is over: the parent unmounts the panel. */
  onClosed: () => void;
  /** Focused again after a close that should restore focus (Esc, close button). */
  returnFocusRef?: RefObject<HTMLElement | null>;
  /** Content; `close(false)` for items that navigate away. */
  children: (close: (restoreFocus: boolean) => void) => ReactNode;
};

/**
 * Full-screen lime panel shared by the site menu and FOLLOW US: fade in/out,
 * focus moved inside and kept there (Tab), Esc to close, page scroll locked,
 * round close button where the menu button sits. Mount it only while open.
 */
export default function OverlayPanel({
  id,
  label,
  closeLabel,
  onClosed,
  returnFocusRef,
  children,
}: OverlayPanelProps) {
  const [closing, setClosing] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    },
    [],
  );

  // Move focus into the dialog when it opens; keep the page behind it still.
  useEffect(() => {
    dialogRef.current?.querySelector<HTMLElement>("a, button")?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const close = useCallback(
    (restoreFocus: boolean) => {
      if (closeTimerRef.current !== null) return;
      setClosing(true);
      closeTimerRef.current = window.setTimeout(() => {
        closeTimerRef.current = null;
        onClosed();
        if (restoreFocus) returnFocusRef?.current?.focus();
      }, FADE_MS);
    },
    [onClosed, returnFocusRef],
  );

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close(true);
      return;
    }
    if (e.key !== "Tab") return;
    // Keep Tab inside the dialog.
    const focusables = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>("a[href], button:not([disabled])") ?? [],
    );
    if (focusables.length === 0) return;
    const first = focusables[0]!;
    const last = focusables[focusables.length - 1]!;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      id={id}
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onKeyDown={handleKeyDown}
      className={`data-notice-overlay site-menu-overlay ${
        closing ? "data-notice-overlay-exit" : "site-menu-overlay-enter"
      }`}
    >
      {children(close)}
      <button
        type="button"
        onClick={() => close(true)}
        aria-label={closeLabel}
        className="site-menu-button"
      >
        <CloseIcon className="h-4.5 w-4.5" />
      </button>
    </div>
  );
}
