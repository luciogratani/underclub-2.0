import ArrowLeft from "./icons/ArrowLeft";

type HeroButtonProps = {
  title?: string;
  direction?: "left" | "right";
};

export default function HeroButton({ title = "NEXT DATE", direction = "right" }: HeroButtonProps) {
  const arrowPointsLeft = direction === "left";
  const arrowClassName = arrowPointsLeft ? "w-full h-full -scale-x-100" : "w-full h-full";

  return (
    <button
      type="button"
      className="relative flex items-center justify-center gap-2.5 font-bold text-primary bg-black rounded-full border-0 cursor-pointer py-[18px] px-[38px] text-[19px] leading-none"
    >
      {arrowPointsLeft && (
        <span className="flex shrink-0 w-4.5 h-4.5 mb-[1px]">
          <ArrowLeft className={arrowClassName} />
        </span>
      )}
      <span>{title}</span>
      {!arrowPointsLeft && (
        <span className="flex shrink-0 w-4.5 h-4.5 mb-[1px]">
          <ArrowLeft className={arrowClassName} />
        </span>
      )}
    </button>
  );
}
