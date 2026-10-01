/**
 * Request validation. The server is authoritative: the client validates the
 * same rules for UX, but nothing it sends is trusted.
 *
 * Wrong shapes (non-string ids, a number where a string is expected) are
 * `bad_request`; user data that breaks a rule is `invalid_input`.
 */
import { HttpError } from './http.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE =
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;
// Same rule as the reservations.source CHECK constraint.
const SOURCE_RE = /^[a-z0-9][a-z0-9_-]{0,62}[a-z0-9]$/;
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u001f\u007f]/;

function badRequest(message: string): never {
  throw new HttpError(400, 'bad_request', message);
}

function invalidInput(message: string): never {
  throw new HttpError(400, 'invalid_input', message);
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

export function requireUuid(body: Record<string, unknown>, field: string): string {
  const v = body[field];
  if (!isUuid(v)) badRequest(`${field} must be a UUID`);
  return v.toLowerCase();
}

function optionalString(body: Record<string, unknown>, field: string): string | null {
  const v = body[field];
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string') badRequest(`${field} must be a string`);
  const trimmed = v.trim();
  return trimmed === '' ? null : trimmed;
}

function optionalBoolean(body: Record<string, unknown>, field: string): boolean {
  const v = body[field];
  if (v === undefined || v === null) return false;
  if (typeof v !== 'boolean') badRequest(`${field} must be a boolean`);
  return v;
}

export function normalizeFullName(raw: string): string {
  const name = raw.trim().replace(/\s+/g, ' ');
  if (name.length > 120) invalidInput('fullName is too long');
  if (CONTROL_RE.test(name)) invalidInput('fullName contains invalid characters');
  if (name.split(' ').filter((w) => /\p{L}/u.test(w)).length < 2) {
    invalidInput('fullName must contain first and last name');
  }
  return name;
}

export function normalizeEmail(raw: string): string {
  const email = raw.trim().toLowerCase();
  const at = email.lastIndexOf('@');
  if (email.length > 254 || at < 1 || at > 64 || !EMAIL_RE.test(email)) {
    invalidInput('email is not valid');
  }
  return email;
}

/** Today's date (YYYY-MM-DD) in Europe/Rome, the reference for "18+". */
export function romeToday(now: Date): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Rome',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function isLeap(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function validateDateOfBirth(raw: string, now: Date): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!m) invalidInput('dateOfBirth must be YYYY-MM-DD');
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d || y < 1900) {
    invalidInput('dateOfBirth is not a valid date');
  }
  const today = romeToday(now);
  if (raw > today) invalidInput('dateOfBirth is in the future');
  // 18th birthday; someone born on 29 Feb comes of age on 1 Mar in non-leap years.
  const adultYear = y + 18;
  const adultDay = mo === 2 && d === 29 && !isLeap(adultYear) ? '03-01' : `${m[2]}-${m[3]}`;
  if (`${adultYear}-${adultDay}` > today) invalidInput('You must be 18 or older');
  return raw;
}

/** Slug of the CHECK rule, or null. Never an error: a bad source is just dropped. */
export function normalizeSource(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const slug = raw
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '')
    .slice(0, 64)
    .replace(/[-_]+$/g, '');
  return SOURCE_RE.test(slug) ? slug : null;
}

export interface BookingInput {
  eventId: string;
  entryId: string;
  fullName: string | null;
  dateOfBirth: string | null;
  email: string | null;
  consentMarketing: boolean;
  consentProfiling: boolean;
  source: string | null;
}

/**
 * Identity fields are optional here (a valid session does not need them);
 * when present they must be valid. Whether they were required is decided by
 * the database, which alone knows if the session is valid.
 */
export function validateBooking(body: Record<string, unknown>, now: Date): BookingInput {
  const eventId = requireUuid(body, 'eventId');
  const entryId = requireUuid(body, 'entryId');
  const fullName = optionalString(body, 'fullName');
  const dateOfBirth = optionalString(body, 'dateOfBirth');
  const email = optionalString(body, 'email');
  const consentMarketing = optionalBoolean(body, 'consentMarketing');
  const consentProfiling = optionalBoolean(body, 'consentProfiling');
  return {
    eventId,
    entryId,
    fullName: fullName === null ? null : normalizeFullName(fullName),
    dateOfBirth: dateOfBirth === null ? null : validateDateOfBirth(dateOfBirth, now),
    email: email === null ? null : normalizeEmail(email),
    consentMarketing,
    consentProfiling,
    source: normalizeSource(body.source),
  };
}

export function validateLoginLink(body: Record<string, unknown>): string {
  const email = optionalString(body, 'email');
  if (email === null) invalidInput('email is required');
  return normalizeEmail(email);
}

/** Activation token: a string is required; its format is checked by the handler. */
export function readActivationToken(body: Record<string, unknown>): string {
  const v = body.token;
  if (typeof v !== 'string' || v.length === 0 || v.length > 512) badRequest('token must be a string');
  return v.trim();
}
