type BookNowButtonProps = {
  label?: string;
  onClick?: () => void;
};

export default function BookNowButton({ label = "BOOK NOW", onClick }: BookNowButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full font-bold text-black bg-primary rounded-none border-0 cursor-pointer py-5.5 text-[19px] leading-none z-10"
    >
      {label}
    </button>
  );
}
