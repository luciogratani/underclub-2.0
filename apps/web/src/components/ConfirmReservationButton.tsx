type ConfirmReservationButtonProps = {
  label?: string;
  onClick?: () => void;
  disabled?: boolean;
};

export default function ConfirmReservationButton({
  label = "Confirm",
  onClick,
  disabled = false,
}: ConfirmReservationButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-disabled={disabled}
      className={`w-full font-bold bg-black rounded-none border-0 py-5.5 text-[19px] leading-none z-10 ${
        disabled ? "cursor-not-allowed" : "cursor-pointer"
      }`}
    >
      <span className={disabled ? "text-primary opacity-25 transition-opacity" : "text-primary"}>
        {label}
      </span>
    </button>
  );
}
