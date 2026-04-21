import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import type { TicketViewData } from "@underclub/shared";
import Lanyard from "../components/Lanyard/Lanyard";
import { fetchTicketData, markTicketOpened } from "../lib/api";

export default function Ticket() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const ticketToken = searchParams.get("t");
  const [ticketData, setTicketData] = useState<TicketViewData | undefined>(undefined);
  const [loading, setLoading] = useState(true);

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

  useEffect(() => {
    if (!id || !ticketToken) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    fetchTicketData(id, ticketToken).then((data) => {
      if (cancelled) return;
      if (data) setTicketData(data);
      setLoading(false);
    });
    markTicketOpened(id, ticketToken);
    return () => { cancelled = true; };
  }, [id, ticketToken]);

  if (loading) {
    return (
      <section className="fixed inset-0 z-0 flex items-center justify-center h-[100dvh] w-full bg-primary">
        <p className="text-black font-bold text-xl animate-pulse">Loading ticket…</p>
      </section>
    );
  }

  if (!ticketData) {
    return (
      <section className="fixed inset-0 z-0 flex items-center justify-center h-[100dvh] w-full bg-primary">
        <p className="text-black font-bold text-xl text-center px-6">
          Invalid or expired ticket link.
        </p>
      </section>
    );
  }

  return (
    <section
      className="fixed inset-0 z-0 h-[100dvh] w-full overflow-hidden bg-primary touch-none"
      aria-label="Ticket"
    >
      <Lanyard ticketData={ticketData} qrToken={ticketToken} />
    </section>
  );
}
