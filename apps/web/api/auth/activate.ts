// Vercel Function (Web signature). Logic lives in server/handlers.
import { runVercel } from '../../server/deps.js';
import { handleActivate } from '../../server/handlers/activate.js';

export async function POST(request: Request): Promise<Response> {
  return runVercel(handleActivate, request);
}
