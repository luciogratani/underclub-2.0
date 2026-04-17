import {
  createClient,
  type SupabaseClient,
  type SupabaseClientOptions,
} from '@supabase/supabase-js';
import type { Database } from './database';

export type TypedSupabaseClient = SupabaseClient<Database, 'underclub'>;
export type UnderclubSchema = 'underclub';

export function createSupabaseClient(
  url: string,
  anonKey: string,
  options?: SupabaseClientOptions<'underclub'>,
): TypedSupabaseClient {
  return createClient<Database, 'underclub'>(url, anonKey, {
    ...options,
    db: { schema: 'underclub' },
  });
}
