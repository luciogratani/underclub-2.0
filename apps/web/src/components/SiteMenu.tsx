import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useSession } from "../lib/session";
import MenuIcon from "./icons/Menu";
import OverlayPanel from "./OverlayPanel";

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
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    onOpenChange?.(open);
  }, [open, onOpenChange]);

  const handleClosed = useCallback(() => setOpen(false), []);

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
        <OverlayPanel
          id={MENU_ID}
          label="Menu"
          closeLabel="Close menu"
          onClosed={handleClosed}
          returnFocusRef={triggerRef}
        >
          {(close) => (
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
                    <button
                      type="button"
                      className={itemClassName}
                      onClick={() => {
                        close(false);
                        void onLogout();
                      }}
                    >
                      LOG OUT
                    </button>
                  </li>
                )}
              </ul>
            </nav>
          )}
        </OverlayPanel>
      )}
    </>
  );
}
