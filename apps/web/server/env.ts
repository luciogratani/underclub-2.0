/**
 * Server-only configuration for the booking endpoints.
 *
 * Read from `process.env` on Vercel and from Vite's `loadEnv(mode, cwd, '')`
 * in dev. None of these variables carry the `VITE_` prefix, so they never
 * reach the browser bundle.
 */

export type EmailTransportKind = 'resend' | 'console';

export interface ServerEnv {
  /** True on the Vercel production deployment (or NODE_ENV=production off Vercel). */
  production: boolean;
  /** Absolute site URL without trailing slash, used to build email links. */
  publicSiteUrl: string;
  /** Exact origins accepted on POST requests. */
  allowedOrigins: string[];
  /** Dev only: accept any http://localhost:<port> (and 127.0.0.1) origin. */
  allowLocalhostOrigins: boolean;
  emailTransport: EmailTransportKind;
  emailFrom: string;
  resendApiKey: string | null;
  supabaseUrl: string | null;
  supabaseServiceRoleKey: string | null;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

type EnvSource = Record<string, string | undefined>;

export interface ReadEnvOptions {
  /** Running inside the Vite dev server. */
  dev?: boolean;
  /** Require SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (false when a pg-backed Rpc is used). */
  requireSupabase?: boolean;
}

function clean(value: string | undefined): string | null {
  const v = value?.trim();
  return v ? v : null;
}

function toOrigin(raw: string, name: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ConfigError(`${name} is not a valid URL`);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new ConfigError(`${name} must be an http(s) URL`);
  }
  return url.origin;
}

export function readEnv(source: EnvSource, options: ReadEnvOptions = {}): ServerEnv {
  const dev = options.dev ?? false;
  const requireSupabase = options.requireSupabase ?? true;
  const vercelEnv = clean(source.VERCEL_ENV);
  const production = !dev && (vercelEnv ? vercelEnv === 'production' : source.NODE_ENV === 'production');

  const missing: string[] = [];

  const siteRaw = clean(source.PUBLIC_SITE_URL);
  if (!siteRaw) missing.push('PUBLIC_SITE_URL');

  const supabaseUrl = clean(source.SUPABASE_URL);
  const supabaseServiceRoleKey = clean(source.SUPABASE_SERVICE_ROLE_KEY);
  if (requireSupabase) {
    if (!supabaseUrl) missing.push('SUPABASE_URL');
    if (!supabaseServiceRoleKey) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  }

  // Any Vercel deployment (preview included) talks to a real database: sign-in
  // links must never end up in its logs, so console is only for local runs.
  const deployed = !dev && (production || vercelEnv !== null);
  const transportRaw = clean(source.EMAIL_TRANSPORT)?.toLowerCase() ?? (deployed ? 'resend' : 'console');
  if (transportRaw !== 'resend' && transportRaw !== 'console') {
    throw new ConfigError('EMAIL_TRANSPORT must be "resend" or "console"');
  }
  const emailTransport: EmailTransportKind = transportRaw;
  if (deployed && emailTransport === 'console') {
    // The console transport prints sign-in links: never in deployment logs.
    throw new ConfigError('EMAIL_TRANSPORT=console is not allowed on a deployment');
  }

  const resendApiKey = clean(source.RESEND_API_KEY);
  let emailFrom = clean(source.EMAIL_FROM);
  if (emailTransport === 'resend') {
    if (!resendApiKey) missing.push('RESEND_API_KEY');
    if (!emailFrom) missing.push('EMAIL_FROM');
  }
  emailFrom ??= 'Underclub <reservations@localhost>';

  if (missing.length > 0) {
    throw new ConfigError(`missing env: ${missing.join(', ')}`);
  }

  const siteOrigin = toOrigin(siteRaw!, 'PUBLIC_SITE_URL');
  const publicSiteUrl = siteRaw!.replace(/\/+$/, '');

  const extra = (clean(source.ALLOWED_ORIGINS) ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => toOrigin(s, 'ALLOWED_ORIGINS'));

  return {
    production,
    publicSiteUrl,
    allowedOrigins: [...new Set([siteOrigin, ...extra])],
    allowLocalhostOrigins: dev,
    emailTransport,
    emailFrom,
    resendApiKey,
    supabaseUrl,
    supabaseServiceRoleKey,
  };
}
