import type { TicketViewData } from "@underclub/shared";
import SummaryHomeButton from "./SummaryHomeButton";

type ReservationSummaryProps = Partial<TicketViewData> & {
  onGoHome?: () => void;
  onOpenTicket?: () => void;
};

function formatSummaryDate(value?: string | null): string {
  if (!value) return "—";
  // If already display-styled, keep as-is.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value.toUpperCase();

  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "—";

  const weekday = date
    .toLocaleDateString("en-US", { weekday: "long" })
    .toUpperCase();
  const month = date
    .toLocaleDateString("en-US", { month: "long" })
    .toUpperCase();
  const day = String(date.getDate()).padStart(2, "0");
  return `${weekday} ${month} ${day}`;
}

export default function ReservationSummary({
  fullName,
  email,
  eventDate,
  onGoHome,
  onOpenTicket,
}: ReservationSummaryProps) {
  return (
    <section
      className="flex flex-col items-center justify-center min-w-[100vw] w-[100vw] min-h-[100svh] h-[100svh] shrink-0 snap-start snap-always bg-primary"
      style={{ height: "100svh" }}
      aria-label="Reservation confirmed"
    >
      <div className="w-[95%] max-w-lg rounded-[40px] overflow-hidden bg-black text-primary">
        
        <div className="p-4">
          <p className="mt-4.5 text-[50px] font-bold">YOU'RE IN!</p>

          <p className="mt-6 font-sans text-lg leading-tight text-primary">
            Dear <span className="font-medium uppercase">{fullName || "—"},</span>
          </p>
          <p className="mt-2 font-sans text-lg leading-tight text-primary">
            we'll email your ticket to <br /><span className="font-medium">{email || "—"}</span>.
          </p>
          <p className="mt-2 font-sans text-lg leading-tight text-primary">
            See you at Underclub on <br /><span className="font-medium">{formatSummaryDate(eventDate) || "—"}</span>.
          </p>

          <div className="pb-6 pt-12">
            <div className="flex items-center justify-between">
              {onGoHome ? (
                <div className="scale-75 origin-left">
                  <SummaryHomeButton title="Home" direction="left" onClick={onGoHome} />
                </div>
              ) : (
                <div />
              )}
              {onOpenTicket && (
                <div className="scale-75 origin-right">
                  <SummaryHomeButton title="Ticket" direction="right" onClick={onOpenTicket} />
                </div>
              )}
            </div>
          </div>

        </div>

      </div>
    </section>
  );
}
