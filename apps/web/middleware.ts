// Vercel Routing Middleware: runs before every page and API route. Only
// maintenance mode for now (see server/maintenance.ts).
import { next } from '@vercel/functions';
import { decideMaintenance, maintenanceResponse, readMaintenanceConfig } from './server/maintenance.js';

export const config = {
  runtime: 'nodejs',
  // Built bundles never need the check: skip the invocation.
  matcher: '/((?!assets/).*)',
};

export default function middleware(request: Request): Response {
  const maintenance = readMaintenanceConfig(process.env);
  const decision = decideMaintenance(
    new URL(request.url),
    request.headers.get('cookie'),
    maintenance,
    request.headers.get('user-agent'),
  );
  return decision.kind === 'pass' ? next() : maintenanceResponse(decision, maintenance);
}
