// Vercel Function (Web signature). Logic lives in server/handlers.
import { runVercel } from '../../server/deps.js';
import { handleLogout } from '../../server/handlers/logout.js';

export async function POST(request: Request): Promise<Response> {
  return runVercel(handleLogout, request);
}
