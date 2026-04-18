type DataNoticeOverlayProps = {
  visible: boolean;
  isClosing: boolean;
  onAccept: () => void;
};

export default function DataNoticeOverlay({
  visible,
  isClosing,
  onAccept,
}: DataNoticeOverlayProps) {
  if (!visible) return null;

  return (
    <div
      className={`data-notice-overlay ${isClosing ? "data-notice-overlay-exit" : ""}`}
      onClick={onAccept}
      role="button"
      tabIndex={0}
      aria-label="Continue and accept privacy and cookie policy"
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onAccept();
        }
      }}
    >
      <div className="data-notice-card">
        <p className="data-notice-title">DATA NOTICE</p>
        <p className="data-notice-copy">
          By tapping anywhere, you continue to Underclub and accept the{" "}
          <a
            href="/info/privacy-cookie"
            className="underline underline-offset-2"
            onClick={(e) => e.stopPropagation()}
          >
            Privacy Policy
          </a>{" "}
          regarding personal data processing.
        </p>
        <p className="data-notice-hint">TAP ANYWHERE TO CONTINUE</p>
      </div>
    </div>
  );
}
