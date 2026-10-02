import { SOCIAL_LINKS } from "../lib/social";
import OverlayPanel from "./OverlayPanel";

const itemClassName = "block text-[12vw] font-bold uppercase leading-[0.95] text-black";

type FollowUsPanelProps = {
  /** Called once the panel has faded out. */
  onClosed: () => void;
};

/** FOLLOW US (home without nights): the club's socials, in the menu's lime panel. */
export default function FollowUsPanel({ onClosed }: FollowUsPanelProps) {
  return (
    <OverlayPanel id="follow-us" label="Follow us" closeLabel="Close" onClosed={onClosed}>
      {() => (
        <nav className="mx-auto w-full max-w-3xl px-4 pb-28 pt-8">
          <p className="font-sans text-[4vw] font-light tracking-wide opacity-85">
            follow us
          </p>
          <ul className="mt-2 space-y-3">
            {SOCIAL_LINKS.map((link) => (
              <li key={link.name}>
                <a href={link.href} target="_blank" rel="noreferrer" className={itemClassName}>
                  {link.name}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </OverlayPanel>
  );
}
