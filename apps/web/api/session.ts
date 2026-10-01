// Vercel Function (Web signature). Logic lives in server/handlers.
import { runVercel } from '../server/deps.js';
import { handleSession } from '../server/handlers/session.js';

export async function GET(request: Request): Promise<Response> {
  return runVercel(handleSession, request);
}
