/**
 * Passwordless booking: when on, the funnel talks to the serverless endpoints
 * (`/api/*`) instead of calling `create_public_reservation` directly.
 */
export const BOOKING_API = import.meta.env.VITE_BOOKING_API === "1";
