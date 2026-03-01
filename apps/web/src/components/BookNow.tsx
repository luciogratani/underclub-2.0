import HeroButton from "./HeroButton";
import ConfirmReservationButton from "./ConfirmReservationButton";

type BookNowProps = {
  onBack?: () => void;
};

export default function BookNow({ onBack }: BookNowProps) {
  return (
    <section
      className="flex flex-col items-center justify-center min-h-[100svh] w-full shrink-0 snap-start snap-always bg-black"
      style={{ height: "100svh" }}
      aria-label="Book now"
    >
      <div className="w-[95%] max-w-lg rounded-[40px] overflow-hidden bg-primary text-black">
        <div className="p-4">
          <p className="mt-4.5 text-[50px] font-bold">BOOK NOW</p>
          <p className="mt-4.5 font-sans text-sm opacity-85 font-regular leading-tight">
            FULL NAME
          </p>
          <p className=" font-sans text-2xl font-medium leading-tight">
            LUCIO GRATANI
          </p>
          <p className="mt-4.5 font-sans text-sm opacity-85 font-regular leading-tight">
            DATE OF BIRTH
          </p>
          <p className=" font-sans text-2xl font-medium leading-tight">
            26/02/1999
          </p>
          <p className="mt-4.5 font-sans text-sm opacity-85 font-regular leading-tight">
            EMAIL
          </p>
          <p className=" font-sans text-2xl font-medium leading-tight">
            lucio.gratani@gmail.com
          </p>
        </div>

        <div className="mb-10.5 mt-5 w-full">
          <ConfirmReservationButton label="Confirm" onClick={() => {}} />
        </div>

        <div className="p-4 pt-0 hidden">
          {onBack && (
            <div className="mt-8 flex justify-start">
              <HeroButton title="Indietro" direction="left" onClick={onBack} />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
