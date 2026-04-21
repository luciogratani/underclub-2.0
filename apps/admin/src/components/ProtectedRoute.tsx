import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth'

/**
 * Gate for admin-only routes.
 *
 * - While the initial session is resolving, shows a lightweight loader.
 * - If Supabase is not configured, shows a clear message instead of a silent redirect.
 * - Otherwise redirects unauthenticated users to /login preserving the intended destination.
 */
export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading, configMissing } = useAuth()
  const location = useLocation()

  if (configMissing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6 text-sm text-muted-foreground font-mono">
        Supabase non configurato. Imposta VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6 text-sm text-muted-foreground font-mono">
        Loading…
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />
  }

  return <>{children}</>
}
