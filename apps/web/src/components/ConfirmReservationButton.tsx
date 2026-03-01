type ConfirmReservationButtonProps = {
  label?: string;
  onClick?: () => void;
};

export default function ConfirmReservationButton({
  label = "Confirm",
  onClick,
}: ConfirmReservationButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full font-bold text-primary bg-black rounded-none border-0 cursor-pointer py-5.5 text-[19px] leading-none z-10"
    >
      {label}
    </button>
  );
}
