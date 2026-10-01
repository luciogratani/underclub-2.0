export default function Menu({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      className={className}
      aria-hidden
    >
      <rect x="2" y="6" width="20" height="3.2" fill="currentColor" />
      <rect x="2" y="14.8" width="20" height="3.2" fill="currentColor" />
    </svg>
  );
}
