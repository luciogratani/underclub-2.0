import { useEffect } from "react";
import Lanyard from "../components/Lanyard/Lanyard";

export default function Ticket() {
  useEffect(() => {
    const prevHtml = document.documentElement.style.overflow;
    const prevBody = document.body.style.overflow;
    const prevTouch = document.body.style.touchAction;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    document.body.style.touchAction = "none";
    return () => {
      document.documentElement.style.overflow = prevHtml;
      document.body.style.overflow = prevBody;
      document.body.style.touchAction = prevTouch;
    };
  }, []);

  return (
    <section
      className="fixed inset-0 z-0 h-[100dvh] w-full overflow-hidden bg-primary touch-none border-2 border-red-500"
      aria-label="3D Ticket"
    >
      <Lanyard />
    </section>
  );
}
