// Vercel Function (Web signature), run daily by Vercel Cron (vercel.json).
import { runVercel } from '../../server/deps.js';
import { handleCronCleanup } from '../../server/handlers/cronCleanup.js';

export async function GET(request: Request): Promise<Response> {
  return runVercel(handleCronCleanup, request);
}
