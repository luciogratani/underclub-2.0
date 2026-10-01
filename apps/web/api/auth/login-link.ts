// Vercel Function (Web signature). Logic lives in server/handlers.
import { runVercel } from '../../server/deps.js';
import { handleLoginLink } from '../../server/handlers/loginLink.js';

export async function POST(request: Request): Promise<Response> {
  return runVercel(handleLoginLink, request);
}
