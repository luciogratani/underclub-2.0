import SummaryHomeButton from "./SummaryHomeButton";

type ReservationSummaryProps = {
  fullName: string;
  dateOfBirth: string;
  email: string;
  onGoHome?: () => void;
};

const MOCK_DATE = "SATURDAY MARCH 07";

export default function ReservationSummary({
  fullName,
  email,
  onGoHome,
}: ReservationSummaryProps) {
  return (
    <section
      className="flex flex-col items-center justify-center min-h-[100svh] w-full shrink-0 snap-start snap-always bg-primary"
      style={{ height: "100svh" }}
      aria-label="Reservation confirmed"
    >
      <div className="w-[95%] max-w-lg rounded-[40px] overflow-hidden bg-black text-primary">
        
        <div className="m-4">
          <p className="mt-4.5 text-[50px] font-bold">YOU'RE IN!</p>

          <p className="mt-6 font-sans text-lg leading-tight text-primary">
            Dear <span className="font-medium uppercase">{fullName || "—"},</span>
          </p>
          <p className="mt-2 font-sans text-lg leading-tight text-primary">
            we’ll email your ticket to <br /><span className="font-medium">{email || "—"}</span>.
          </p>
          <p className="mt-2 font-sans text-lg leading-tight text-primary">
            See you at Underclub on <br /><span className="font-medium">{MOCK_DATE}</span>.
          </p>

          <div className="pb-6 pt-12">
          {onGoHome && (
            <div className="scale-75 origin-left">
              <SummaryHomeButton title="Home" direction="left" onClick={onGoHome} />
            </div>
          )}
        </div>

        </div>

      </div>
    </section>
  );
}
