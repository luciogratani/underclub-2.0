import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database';

export type TypedSupabaseClient = SupabaseClient<Database>;

export function createSupabaseClient(
  url: string,
  anonKey: string,
): TypedSupabaseClient {
  return createClient<Database>(url, anonKey);
}
