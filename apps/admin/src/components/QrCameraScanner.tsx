import { useEffect, useRef, useState } from 'react'
import type QrScannerType from 'qr-scanner'

/**
 * QR camera scanner.
 *
 * Uses `qr-scanner` (Nimiq) as single engine: under the hood it prefers the
 * native `BarcodeDetector` when available and falls back to a WASM worker on
 * browsers without it (iOS Safari in particular). This gives us robust
 * detection on both desktop and mobile without hand-tuning ZXing.
 *
 * Anti-dup: a per-token cooldown ignores the same QR decoded within `cooldownMs`.
 * The parent is responsible for a higher-level lock during RPC processing.
 */

type Status = 'idle' | 'starting' | 'scanning' | 'error'

function hasGetUserMedia(): boolean {
  if (typeof navigator === 'undefined') return false
  return typeof navigator.mediaDevices?.getUserMedia === 'function'
}

function getCameraUnavailableReason(): string {
  if (typeof window === 'undefined') return 'Camera API non disponibile in questo contesto.'
  if (!window.isSecureContext) {
    return 'Camera API non disponibile: usa HTTPS (o localhost in sviluppo).'
  }
  return 'Camera API non disponibile su questo browser/device.'
}

type Props = {
  /** Invoked with the decoded QR payload (raw string). */
  onDecode: (token: string) => void
  /** Invoked with a human-readable message when camera/scanner fails. */
  onError?: (msg: string) => void
  /** Whether the scanner is active (camera on). Setting to false stops everything. */
  active: boolean
  /** Optional debug logger for mobile diagnostics. */
  onDebug?: (line: string) => void
  /** Ignore duplicate reads of the same token within this window (ms). */
  cooldownMs?: number
}

export default function QrCameraScanner({
  onDecode,
  onError,
  active,
  onDebug,
  cooldownMs = 2000,
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const scannerRef = useRef<QrScannerType | null>(null)
  const lastDecodeRef = useRef<{ token: string; at: number } | null>(null)
  const cancelledRef = useRef(false)
  const decodeErrorCountRef = useRef(0)
  const [status, setStatus] = useState<Status>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  function debug(msg: string) {
    onDebug?.(`[scanner] ${msg}`)
  }

  useEffect(() => {
    cancelledRef.current = false

    if (!active) {
      debug('inactive -> stopAll')
      stopAll()
      return
    }

    setStatus('starting')
    setErrorMsg(null)
    debug(
      `start requested | secure=${
        typeof window !== 'undefined' ? String(window.isSecureContext) : 'n/a'
      } | hasGUM=${String(hasGetUserMedia())} | hasBD=${
        typeof window !== 'undefined' ? String('BarcodeDetector' in window) : 'n/a'
      }`,
    )
    start().catch((e: unknown) => {
      if (cancelledRef.current) return
      const msg = e instanceof Error ? e.message : 'Errore camera'
      debug(`start failed: ${msg}`)
      setErrorMsg(msg)
      setStatus('error')
      onError?.(msg)
    })

    return () => {
      cancelledRef.current = true
      stopAll()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  function emitIfNew(token: string) {
    const trimmed = token.trim()
    if (!trimmed) return
    const now = Date.now()
    const last = lastDecodeRef.current
    if (last && last.token === trimmed && now - last.at < cooldownMs) {
      debug('duplicate token ignored by cooldown')
      return
    }
    lastDecodeRef.current = { token: trimmed, at: now }
    debug(`decoded token length=${trimmed.length}`)
    onDecode(trimmed)
  }

  function stopAll() {
    debug('stopAll called')
    const scanner = scannerRef.current
    if (scanner) {
      try {
        scanner.stop()
      } catch {
        /* noop */
      }
      try {
        scanner.destroy()
      } catch {
        /* noop */
      }
      scannerRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    decodeErrorCountRef.current = 0
    setStatus('idle')
  }

  async function start() {
    const video = videoRef.current
    if (!video) return

    if (!hasGetUserMedia()) {
      debug('getUserMedia unavailable before start')
      throw new Error(getCameraUnavailableReason())
    }

    debug('loading qr-scanner dynamically')
    const { default: QrScanner } = await import('qr-scanner')
    if (cancelledRef.current) return

    const hasCamera = await QrScanner.hasCamera().catch(() => false)
    debug(`qr-scanner hasCamera=${String(hasCamera)}`)
    if (!hasCamera) {
      throw new Error('Nessuna camera rilevata su questo device.')
    }

    const scanner = new QrScanner(
      video,
      (result) => {
        if (cancelledRef.current) return
        const data = typeof result === 'string' ? result : result?.data
        if (data) emitIfNew(data)
      },
      {
        preferredCamera: 'environment',
        highlightScanRegion: false,
        highlightCodeOutline: false,
        maxScansPerSecond: 10,
        returnDetailedScanResult: true,
        onDecodeError: (err) => {
          if (cancelledRef.current) return
          decodeErrorCountRef.current += 1
          // qr-scanner emits the string "No QR code found" on every miss.
          // Rate-limit it to every 40 misses and surface real errors asap.
          const raw = err instanceof Error ? err.message : String(err)
          const isMiss =
            raw === QrScanner.NO_QR_CODE_FOUND ||
            raw.toLowerCase().includes('no qr code found')
          if (!isMiss) {
            debug(`decode error: ${raw}`)
            return
          }
          if (decodeErrorCountRef.current % 40 === 0) {
            debug(`no QR in frame x${decodeErrorCountRef.current}`)
          }
        },
      },
    )
    scannerRef.current = scanner

    debug('starting qr-scanner')
    await scanner.start()
    if (cancelledRef.current) {
      stopAll()
      return
    }

    const stream = (video.srcObject as MediaStream | null) ?? null
    const track = stream?.getVideoTracks?.()[0]
    if (track) {
      const settings = track.getSettings?.() ?? {}
      debug(
        `camera ready label="${track.label || 'n/a'}" track=${
          settings.width ?? '?'
        }x${settings.height ?? '?'} video=${video.videoWidth ?? '?'}x${
          video.videoHeight ?? '?'
        } facing=${settings.facingMode ?? '?'}`,
      )
    }

    setStatus('scanning')
    debug('scanner loop started')
  }

  const label =
    status === 'scanning'
      ? 'Scanning…'
      : status === 'starting'
        ? 'Avvio camera…'
        : status === 'error'
          ? errorMsg ?? 'Errore camera'
          : 'Standby'

  return (
    <div className="relative overflow-hidden rounded-lg border border-border/60 bg-black/40">
      <video
        ref={videoRef}
        playsInline
        muted
        className="aspect-square w-full object-cover"
      />
      {/* Viewfinder */}
      <div className="pointer-events-none absolute inset-6 rounded-md border-2 border-primary/60" />
      <div
        className={`absolute bottom-2 left-2 rounded bg-black/60 px-2 py-1 text-[10px] ${
          status === 'error' ? 'text-red-300' : 'text-white/80'
        }`}
      >
        {label}
      </div>
    </div>
  )
}
