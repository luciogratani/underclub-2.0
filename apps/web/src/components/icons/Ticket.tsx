export default function Ticket({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      className={className}
      aria-hidden
    >
      {/* Ticket stub: notched sides, dashed tear line. */}
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M2 5h20v4.5a2.5 2.5 0 0 0 0 5V19H2v-4.5a2.5 2.5 0 0 0 0-5V5Zm13 2.2h1.6v2H15v-2Zm0 3.8h1.6v2H15v-2Zm0 3.8h1.6v2H15v-2Z"
      />
    </svg>
  );
}
