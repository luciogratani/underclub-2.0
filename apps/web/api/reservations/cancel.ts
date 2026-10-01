// Vercel Function (Web signature). Logic lives in server/handlers.
import { runVercel } from '../../server/deps.js';
import { handleCancel } from '../../server/handlers/cancel.js';

export async function POST(request: Request): Promise<Response> {
  return runVercel(handleCancel, request);
}
