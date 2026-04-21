import { useState, type FormEvent } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth'

type LocationState = { from?: string } | null

export default function Login() {
  const { user, loading, configMissing, signIn } = useAuth()
  const location = useLocation()
  const from = (location.state as LocationState)?.from ?? '/'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!loading && user) return <Navigate to={from} replace />

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setErr(null)
    const { error } = await signIn(email.trim(), password)
    if (error) setErr(error)
    setBusy(false)
  }

  const disabled = busy || !email.trim() || !password || configMissing

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 font-mono">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-xl border border-border/60 bg-card/80 p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.03)]"
      >
        <h1 className="text-lg font-semibold tracking-tight">Admin login</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Accedi per gestire eventi, prenotazioni e check-in.
        </p>

        <label htmlFor="email" className="mt-5 block text-[11px] uppercase tracking-widest text-muted-foreground">
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 w-full rounded-md border border-border/70 bg-card/60 px-3 py-2 text-sm outline-none focus:border-primary/60"
        />

        <label htmlFor="password" className="mt-3 block text-[11px] uppercase tracking-widest text-muted-foreground">
          Password
        </label>
        <input
          id="password"
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 w-full rounded-md border border-border/70 bg-card/60 px-3 py-2 text-sm outline-none focus:border-primary/60"
        />

        {configMissing && (
          <p className="mt-3 text-xs text-amber-400">
            Supabase non configurato. Imposta VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.
          </p>
        )}
        {err && <p className="mt-3 text-xs text-red-400">{err}</p>}

        <button
          type="submit"
          disabled={disabled}
          className="mt-5 w-full rounded-md border border-primary/50 bg-primary/10 px-3 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? 'Accesso in corso…' : 'Accedi'}
        </button>

        <p className="mt-4 text-[11px] leading-relaxed text-muted">
          Le credenziali admin vanno create manualmente in Supabase (Auth → Users). Nessuna
          registrazione pubblica.
        </p>
      </form>
    </div>
  )
}
