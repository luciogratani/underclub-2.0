// Vercel Function (Web signature). Logic lives in server/handlers.
import { runVercel } from '../../server/deps.js';
import { handleBooking } from '../../server/handlers/booking.js';

export async function POST(request: Request): Promise<Response> {
  return runVercel(handleBooking, request);
}
