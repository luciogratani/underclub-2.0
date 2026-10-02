import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Link } from "react-router-dom";
import { useSession } from "../lib/session";
import MenuIcon from "./icons/Menu";
import CloseIcon from "./icons/Close";

const MENU_FADE_MS = 360; // same as the data notice fade
const MENU_ID = "site-menu";

type SiteMenuProps = {
  /** Hide the button (e.g. while the data notice covers the page). */
  hidden?: boolean;
  /** Lets the page pause its own gestures while the menu is open. */
  onOpenChange?: (open: boolean) => void;
  /** Page-specific logout (each page reports a failure its own way). */
  onLogout: () => void | Promise<void>;
};

const itemClassName =
  "block w-full cursor-pointer border-0 bg-transparent p-0 text-left text-[12vw] font-bold uppercase leading-[0.95] text-black";

/** Fixed round button (bottom right) + full-screen lime menu. Flag ON only. */
export default function SiteMenu({ hidden = false, onOpenChange, onLogout }: SiteMenuProps) {
  const { session } = useSession();
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    onOpenChange?.(open);
  }, [open, onOpenChange]);

  useEffect(
    () => () => {
      if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    },
    [],
  );

  // Move focus into the dialog when it opens; keep the page behind it still.
  useEffect(() => {
    if (!open) return;
    dialogRef.current?.querySelector<HTMLElement>("a, button")?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const close = useCallback((restoreFocus: boolean) => {
    if (closeTimerRef.current !== null) return;
    setClosing(true);
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      setOpen(false);
      setClosing(false);
      if (restoreFocus) triggerRef.current?.focus();
    }, MENU_FADE_MS);
  }, []);

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

  const handleLogout = () => {
    close(false);
    void onLogout();
  };

  if (hidden && !open) return null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Menu"
        aria-expanded={open}
        aria-controls={MENU_ID}
        aria-haspopup="dialog"
        className="site-menu-button"
      >
        <MenuIcon className="h-5 w-5" />
      </button>

      {open && (
        <div
          id={MENU_ID}
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          onKeyDown={handleKeyDown}
          className={`data-notice-overlay site-menu-overlay ${
            closing ? "data-notice-overlay-exit" : "site-menu-overlay-enter"
          }`}
        >
          <nav className="mx-auto w-full max-w-3xl px-4 pb-28 pt-8">
            <p className="font-sans text-[4vw] font-light tracking-wide opacity-85">
              menu
            </p>
            <ul className="mt-2 space-y-3">
              <li>
                <Link to="/account" className={itemClassName} onClick={() => close(false)}>
                  {session ? "MY BOOKINGS" : "RECOVER BOOKING"}
                </Link>
              </li>
              <li>
                <Link to="/info" className={itemClassName} onClick={() => close(false)}>
                  INFO
                </Link>
              </li>
              <li>
                <Link to="/info/privacy-cookie" className={itemClassName} onClick={() => close(false)}>
                  PRIVACY
                </Link>
              </li>
              {session && (
                <li>
                  <button type="button" className={itemClassName} onClick={handleLogout}>
                    LOG OUT
                  </button>
                </li>
              )}
            </ul>
          </nav>
          <button
            type="button"
            onClick={() => close(true)}
            aria-label="Close menu"
            className="site-menu-button"
          >
            <CloseIcon className="h-4.5 w-4.5" />
          </button>
        </div>
      )}
    </>
  );
}
