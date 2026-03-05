import MiniTextRing from "./MiniTextRing";

export type ErrorToastData = {
  title: string;
  message: string;
  technicalDetail?: string;
  code?: string;
};

type ErrorToastProps = {
  error: ErrorToastData;
  onDismiss?: () => void;
};

export default function ErrorToast({ error, onDismiss }: ErrorToastProps) {
  const { title, message, technicalDetail, code } = error;

  return (
    <div
      role="alert"
      className="flex gap-5 px-4 py-6 rounded-2xl bg-deep-grey border-2 border-error text-error font-sans"
      aria-live="assertive"
    >
      <MiniTextRing />
      <div className="flex-1 min-w-0 flex flex-col gap-2">
        <p className="text-lg font-bold text-error leading-tight">{title}</p>
        <p className="font-medium text-error leading-tight">{message}</p>
        {technicalDetail && (
          <p className="text-sm text-error/90 leading-snug opacity-90">{technicalDetail}</p>
        )}
        {code && (
          <p className="text-xs font-mono text-error/80 mt-0.5">
            <span className="opacity-75">Codice</span> {code}
          </p>
        )}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 px-4 py-1 rounded text-error font-bold hover:bg-error/10 focus:outline-none focus:ring-2 focus:ring-error focus:ring-offset-2 focus:ring-offset-deep-grey 
          hidden"
          aria-label="Chiudi"
        >
          ×
        </button>
      )}
    </div>
  );
}
