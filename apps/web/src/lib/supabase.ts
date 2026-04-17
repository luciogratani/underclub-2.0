import { createSupabaseClient, type TypedSupabaseClient } from '@underclub/shared';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * Singleton Supabase client for the public web app.
 * Returns `null` when env vars are missing (local dev without Supabase).
 * Components should fall back to mock data when this is null.
 */
export const supabase: TypedSupabaseClient | null =
  url && anonKey ? createSupabaseClient(url, anonKey) : null;

export function createTicketSupabaseClient(ticketToken: string): TypedSupabaseClient | null {
  if (!url || !anonKey) return null;
  return createSupabaseClient(url, anonKey, {
    global: {
      headers: {
        'x-ticket-token': ticketToken,
      },
    },
  });
}
