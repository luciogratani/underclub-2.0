import {
  ADMIN_SCAN_RESULT,
  toAdminScanResult,
  type AdminScanResult,
} from '@underclub/shared'
import { supabase } from './supabase'

/**
 * Call the `scan_ticket_check_in` RPC with a raw per-reservation token.
 *
 * The RPC performs an atomic check-in and returns a structured result:
 * - `ok`: first successful scan; `scannedAt` is the new timestamp
 * - `already_scanned`: ticket was previously scanned; returns original timestamp
 * - `cancelled`: reservation was cancelled, do not let them in
 * - `invalid`: token does not match any reservation
 * - `unauthorized`: caller is not allowed to execute the RPC
 *
 * Requires the Supabase client to be initialized and the caller to be
 * authenticated as admin (enforced at the database level via GRANT EXECUTE
 * to `authenticated` only).
 */
export async function scanTicketCheckIn(token: string): Promise<AdminScanResult> {
  const trimmed = token?.trim?.() ?? ''
  if (!trimmed) return { code: ADMIN_SCAN_RESULT.INVALID }
  if (!supabase) return { code: ADMIN_SCAN_RESULT.UNAUTHORIZED }

  const { data, error } = await supabase
    .rpc('scan_ticket_check_in', { p_token: trimmed })
    .single()

  if (error) {
    // Supabase returns 401/403 for unauthenticated or un-granted calls.
    const code = (error as { code?: string }).code
    const status = (error as { status?: number }).status
    const message = (error as { message?: string }).message ?? ''
    if (
      status === 401 ||
      status === 403 ||
      code === '42501' ||
      /permission|not authorized|unauthorized/i.test(message)
    ) {
      return { code: ADMIN_SCAN_RESULT.UNAUTHORIZED }
    }
    return { code: ADMIN_SCAN_RESULT.INVALID }
  }

  if (!data) return { code: ADMIN_SCAN_RESULT.INVALID }
  return toAdminScanResult(data)
}
