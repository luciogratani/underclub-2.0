export default function Close({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      className={className}
      aria-hidden
    >
      <path
        fill="currentColor"
        d="M4.4 2.1 12 9.7l7.6-7.6 2.3 2.3-7.6 7.6 7.6 7.6-2.3 2.3-7.6-7.6-7.6 7.6-2.3-2.3 7.6-7.6-7.6-7.6 2.3-2.3Z"
      />
    </svg>
  );
}
