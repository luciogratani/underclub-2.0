import { createSupabaseClient, type TypedSupabaseClient } from '@underclub/shared'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/**
 * Singleton Supabase client for the admin panel.
 *
 * Returns `null` when env vars are missing so that UIs can render a
 * "configuration missing" state instead of crashing.
 *
 * NOTE: Admin panel currently has no authentication layer yet. RPC calls
 * that require `authenticated` role (e.g. `scan_ticket_check_in`) will
 * return an authorization error until admin auth is implemented.
 */
export const supabase: TypedSupabaseClient | null =
  url && anonKey ? createSupabaseClient(url, anonKey) : null
