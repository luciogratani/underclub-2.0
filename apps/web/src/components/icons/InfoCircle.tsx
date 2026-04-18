export default function InfoCircle({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="22"
      height="22"
      viewBox="0 0 22 22"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <circle cx="11" cy="11" r="10" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M11 10v5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="11" cy="7" r="1" fill="currentColor" />
    </svg>
  );
}
