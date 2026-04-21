import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { supabase } from './supabase'

/**
 * Minimal session-user projection used across the admin UI.
 * Keeping it small avoids a direct dependency on `@supabase/supabase-js`
 * from the admin package and lets the UI render without caring about
 * the full Supabase session shape.
 */
export type SessionUser = {
  id: string
  email: string | null
}

type SignInResult = { error: string | null }

type AuthContextValue = {
  /** Current signed-in user, or null when signed out. */
  user: SessionUser | null
  /** True until the initial session has been resolved. */
  loading: boolean
  /** True when Supabase client is not configured (missing env vars). */
  configMissing: boolean
  signIn: (email: string, password: string) => Promise<SignInResult>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null)
  const [loading, setLoading] = useState(true)

  const configMissing = supabase === null

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }

    let active = true

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      const u = data.session?.user
      setUser(u ? { id: u.id, email: u.email ?? null } : null)
      setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return
      const u = session?.user
      setUser(u ? { id: u.id, email: u.email ?? null } : null)
    })

    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      configMissing,
      signIn: async (email, password) => {
        if (!supabase) return { error: 'Supabase non configurato (controlla le env vars).' }
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        return { error: error?.message ?? null }
      },
      signOut: async () => {
        if (!supabase) return
        await supabase.auth.signOut()
      },
    }),
    [user, loading, configMissing],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
