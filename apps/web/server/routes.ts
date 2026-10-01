/** Path → handler table, mirroring `api/` (used by the Vite dev middleware). */
import type { Handler } from './deps.js';
import { handleBooking } from './handlers/booking.js';
import { handleCancel } from './handlers/cancel.js';
import { handleActivate } from './handlers/activate.js';
import { handleLoginLink } from './handlers/loginLink.js';
import { handleLogout } from './handlers/logout.js';
import { handleSession } from './handlers/session.js';

export const routes: Record<string, Handler> = {
  '/api/reservations': handleBooking,
  '/api/reservations/cancel': handleCancel,
  '/api/auth/activate': handleActivate,
  '/api/auth/login-link': handleLoginLink,
  '/api/auth/logout': handleLogout,
  '/api/session': handleSession,
};
