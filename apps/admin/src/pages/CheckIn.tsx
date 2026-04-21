import { useCallback, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Camera, Keyboard } from 'lucide-react'
import { ADMIN_SCAN_RESULT, type AdminScanResult } from '@underclub/shared'
import { scanTicketCheckIn } from '../lib/api'
import QrCameraScanner from '../components/QrCameraScanner'

type Mode = 'manual' | 'camera'
type Status = 'idle' | 'scanning' | 'done'

function formatDate(iso?: string): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function feedbackForResult(code: AdminScanResult['code']) {
  if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return
  if (code === ADMIN_SCAN_RESULT.OK) navigator.vibrate?.(120)
  else navigator.vibrate?.([60, 60, 60])
}

function ResultCard({ result }: { result: AdminScanResult }) {
  const palette: Record<string, { bg: string; text: string; title: string }> = {
    [ADMIN_SCAN_RESULT.OK]: {
      bg: 'bg-emerald-500/15 border-emerald-500/40',
      text: 'text-emerald-400',
      title: 'Check-in OK',
    },
    [ADMIN_SCAN_RESULT.ALREADY_SCANNED]: {
      bg: 'bg-amber-500/15 border-amber-500/40',
      text: 'text-amber-400',
      title: 'Already scanned',
    },
    [ADMIN_SCAN_RESULT.CANCELLED]: {
      bg: 'bg-red-500/15 border-red-500/40',
      text: 'text-red-400',
      title: 'Reservation cancelled',
    },
    [ADMIN_SCAN_RESULT.INVALID]: {
      bg: 'bg-red-500/15 border-red-500/40',
      text: 'text-red-400',
      title: 'Invalid token',
    },
    [ADMIN_SCAN_RESULT.UNAUTHORIZED]: {
      bg: 'bg-zinc-500/15 border-zinc-500/40',
      text: 'text-zinc-300',
      title: 'Not authorized (admin login required)',
    },
  }
  const tone = palette[result.code] ?? palette[ADMIN_SCAN_RESULT.INVALID]

  return (
    <div className={`mt-4 rounded-lg border p-4 ${tone.bg}`}>
      <p className={`text-sm font-semibold ${tone.text}`}>{tone.title}</p>
      {(result.fullName || result.entryName || result.eventTitle) && (
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          {result.fullName && (
            <>
              <dt className="text-muted-foreground">Name</dt>
              <dd className="font-medium">{result.fullName}</dd>
            </>
          )}
          {result.entryName && (
            <>
              <dt className="text-muted-foreground">Entry</dt>
              <dd>{result.entryName}</dd>
            </>
          )}
          {result.eventTitle && (
            <>
              <dt className="text-muted-foreground">Event</dt>
              <dd>
                {result.eventTitle}
                {result.eventDate ? ` · ${result.eventDate}` : ''}
              </dd>
            </>
          )}
          {result.scannedAt && (
            <>
              <dt className="text-muted-foreground">Scanned</dt>
              <dd>{formatDate(result.scannedAt)}</dd>
            </>
          )}
        </dl>
      )}
    </div>
  )
}

export default function CheckIn() {
  const [mode, setMode] = useState<Mode>('manual')
  const [token, setToken] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [result, setResult] = useState<AdminScanResult | null>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const processingRef = useRef(false)

  const processToken = useCallback(async (raw: string) => {
    const trimmed = raw.trim()
    setCameraError(null)
    if (!trimmed) return
    if (processingRef.current) return
    processingRef.current = true
    setStatus('scanning')
    setResult(null)
    try {
      const res = await scanTicketCheckIn(trimmed)
      setResult(res)
      feedbackForResult(res.code)
    } finally {
      setStatus('done')
      // Short cooldown so the camera scanner doesn't instantly re-fire on
      // the same frame while the result is still on screen.
      setTimeout(() => {
        processingRef.current = false
      }, 1500)
    }
  }, [])

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    await processToken(token)
  }

  return (
    <div className="min-h-screen bg-background p-4 font-mono">
      <Link
        to="/"
        className="mb-4 inline-block text-sm text-primary hover:underline"
      >
        ← Home
      </Link>

      <h1 className="text-lg font-semibold tracking-tight">Check-in</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Scan the ticket QR or paste the token. The server atomically marks the
        reservation as scanned and returns the outcome.
      </p>

      {/* Mode switch */}
      <div className="mt-5 inline-flex rounded-md border border-border/60 p-0.5 text-xs">
        <button
          type="button"
          onClick={() => {
            setCameraError(null)
            setMode('camera')
          }}
          className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 transition-colors ${
            mode === 'camera'
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Camera className="size-3.5" />
          Camera
        </button>
        <button
          type="button"
          onClick={() => {
            setCameraError(null)
            setMode('manual')
          }}
          className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 transition-colors ${
            mode === 'manual'
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Keyboard className="size-3.5" />
          Manual
        </button>
      </div>

      {mode === 'camera' ? (
        <div className="mt-4 max-w-sm">
          <QrCameraScanner
            active={mode === 'camera'}
            onDecode={(t) => void processToken(t)}
            onError={(msg) => setCameraError(msg)}
          />
          {cameraError && (
            <p className="mt-2 text-xs text-red-400">
              Camera non disponibile: {cameraError}. Passa a Manual.
            </p>
          )}
          {status === 'scanning' && (
            <p className="mt-2 text-xs text-muted-foreground">Verifying…</p>
          )}
        </div>
      ) : (
        <form onSubmit={onSubmit} className="mt-4 flex max-w-sm flex-col gap-2">
          <label
            htmlFor="token"
            className="text-[11px] uppercase tracking-widest text-muted-foreground"
          >
            Ticket token
          </label>
          <input
            id="token"
            type="text"
            inputMode="text"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="Paste token from QR…"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            className="rounded-md border border-border/70 bg-card/60 px-3 py-2 text-sm outline-none focus:border-primary/60"
          />
          <button
            type="submit"
            disabled={!token.trim() || status === 'scanning'}
            className="mt-2 rounded-md border border-primary/50 bg-primary/10 px-3 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {status === 'scanning' ? 'Verifying…' : 'Verify & check-in'}
          </button>
        </form>
      )}

      {result && (
        <div className="max-w-sm">
          <ResultCard result={result} />
        </div>
      )}
    </div>
  )
}
