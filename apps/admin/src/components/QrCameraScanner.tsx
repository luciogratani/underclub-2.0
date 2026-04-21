import { useEffect, useRef, useState } from 'react'

/**
 * QR camera scanner.
 *
 * Strategy:
 *  1) Use the native `BarcodeDetector` when available (Chrome/Android, Edge, recent
 *     Firefox). Very cheap, no library download.
 *  2) Fallback to `@zxing/browser` (dynamically imported, so it stays out of the
 *     initial bundle) for Safari iOS and any browser without `BarcodeDetector`.
 *
 * Anti-dup: a per-token cooldown ignores the same QR decoded within `cooldownMs`.
 * The parent is responsible for a higher-level lock during RPC processing.
 */

type Status = 'idle' | 'starting' | 'scanning' | 'error'

interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<Array<{ rawValue?: string }>>
}

interface BarcodeDetectorCtor {
  new (opts?: { formats?: string[] }): BarcodeDetectorLike
  getSupportedFormats?: () => Promise<string[]>
}

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

function getBarcodeDetector(): BarcodeDetectorCtor | null {
  if (typeof window === 'undefined') return null
  const BD = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor })
    .BarcodeDetector
  return BD ?? null
}

type Props = {
  /** Invoked with the decoded QR payload (raw string). */
  onDecode: (token: string) => void
  /** Invoked with a human-readable message when camera/scanner fails. */
  onError?: (msg: string) => void
  /** Whether the scanner is active (camera on). Setting to false stops everything. */
  active: boolean
  /** Ignore duplicate reads of the same token within this window (ms). */
  cooldownMs?: number
}

export default function QrCameraScanner({
  onDecode,
  onError,
  active,
  cooldownMs = 2000,
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number | null>(null)
  const zxingControlsRef = useRef<{ stop: () => void } | null>(null)
  const lastDecodeRef = useRef<{ token: string; at: number } | null>(null)
  const cancelledRef = useRef(false)
  const [status, setStatus] = useState<Status>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    cancelledRef.current = false

    if (!active) {
      stopAll()
      return
    }

    setStatus('starting')
    setErrorMsg(null)
    start().catch((e: unknown) => {
      if (cancelledRef.current) return
      const msg = e instanceof Error ? e.message : 'Errore camera'
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
    if (last && last.token === trimmed && now - last.at < cooldownMs) return
    lastDecodeRef.current = { token: trimmed, at: now }
    onDecode(trimmed)
  }

  function stopAll() {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    zxingControlsRef.current?.stop()
    zxingControlsRef.current = null

    const stream = streamRef.current
    if (stream) {
      stream.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setStatus('idle')
  }

  async function start() {
    const video = videoRef.current
    if (!video) return

    if (!hasGetUserMedia()) {
      throw new Error(getCameraUnavailableReason())
    }

    const BD = getBarcodeDetector()
    if (BD) {
      let supportsQr = true
      if (BD.getSupportedFormats) {
        try {
          const formats = await BD.getSupportedFormats()
          supportsQr = formats.includes('qr_code')
        } catch {
          supportsQr = true
        }
      }
      if (supportsQr) {
        await startNative(BD)
        return
      }
    }

    await startZxing()
  }

  async function startNative(BD: BarcodeDetectorCtor) {
    const video = videoRef.current!
    if (!hasGetUserMedia()) {
      throw new Error(getCameraUnavailableReason())
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
      audio: false,
    })
    if (cancelledRef.current) {
      stream.getTracks().forEach((t) => t.stop())
      return
    }
    streamRef.current = stream
    video.srcObject = stream
    video.setAttribute('playsinline', 'true')
    await video.play()
    if (cancelledRef.current) return
    setStatus('scanning')

    const detector = new BD({ formats: ['qr_code'] })
    const tick = async () => {
      if (cancelledRef.current || !videoRef.current) return
      try {
        const results = await detector.detect(videoRef.current)
        if (results && results.length) {
          const raw = results[0].rawValue
          if (raw) emitIfNew(raw)
        }
      } catch {
        // transient detect errors are safe to ignore; keep polling
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }

  async function startZxing() {
    const video = videoRef.current!
    if (!hasGetUserMedia()) {
      throw new Error(getCameraUnavailableReason())
    }
    const { BrowserQRCodeReader } = await import('@zxing/browser')
    if (cancelledRef.current) return
    const reader = new BrowserQRCodeReader()
    // decodeFromVideoDevice handles getUserMedia + frame decoding internally.
    const controls = await reader.decodeFromVideoDevice(
      undefined,
      video,
      (result) => {
        if (cancelledRef.current) return
        if (result) emitIfNew(result.getText())
      },
    )
    if (cancelledRef.current) {
      controls.stop()
      return
    }
    zxingControlsRef.current = controls
    setStatus('scanning')
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
