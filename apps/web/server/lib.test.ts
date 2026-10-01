import { describe, expect, it, vi } from 'vitest';
import { normalizeSource, romeToday, validateDateOfBirth, normalizeEmail, normalizeFullName } from './validate.js';
import { ConfigError, readEnv } from './env.js';
import { activationEmail, alreadyBookedEmail, escapeHtml, loginEmail, ticketEmail } from './emails/templates.js';
import { createConsoleTransport, createResendTransport } from './email.js';
import { readSessionCookie } from './cookies.js';
import { HttpError } from './http.js';

describe('validate', () => {
  it('source slugs follow the DB CHECK rule or become null', () => {
    expect(normalizeSource('Meta Ads')).toBe('meta-ads');
    expect(normalizeSource('  PR_Giulia ')).toBe('pr_giulia');
    expect(normalizeSource('Manifesto Corso Vico!!')).toBe('manifesto-corso-vico');
    expect(normalizeSource('Città')).toBe('citta');
    expect(normalizeSource('x')).toBeNull();
    expect(normalizeSource('---')).toBeNull();
    expect(normalizeSource(42)).toBeNull();
    expect(normalizeSource(null)).toBeNull();
    const long = normalizeSource('a'.repeat(100));
    expect(long).toHaveLength(64);
  });

  it('18+ is measured on the Europe/Rome date', () => {
    // 22:30 UTC on 30 Sep is already 1 Oct in Rome.
    const now = new Date('2026-09-30T22:30:00Z');
    expect(romeToday(now)).toBe('2026-10-01');
    expect(validateDateOfBirth('2008-10-01', now)).toBe('2008-10-01');
    expect(() => validateDateOfBirth('2008-10-02', now)).toThrow(HttpError);
  });

  it('29 February birthdays come of age on 1 March in non-leap years', () => {
    expect(() => validateDateOfBirth('2008-02-29', new Date('2026-02-28T12:00:00Z'))).toThrow();
    expect(validateDateOfBirth('2008-02-29', new Date('2026-03-01T12:00:00Z'))).toBe('2008-02-29');
  });

  it('email and name normalization', () => {
    expect(normalizeEmail('  Ada.L+x@Example.COM ')).toBe('ada.l+x@example.com');
    expect(() => normalizeEmail(`${'a'.repeat(250)}@b.it`)).toThrow();
    expect(() => normalizeEmail('a b@c.it')).toThrow();
    expect(normalizeFullName(' José   María  ')).toBe('José María');
    expect(() => normalizeFullName('Ada 123')).toThrow();
  });
});

describe('env', () => {
  const base = {
    PUBLIC_SITE_URL: 'https://underclub.it/',
    SUPABASE_URL: 'https://x.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service',
  };

  it('defaults to the console transport only off Vercel', () => {
    const env = readEnv({ ...base });
    expect(env.emailTransport).toBe('console');
    expect(env.publicSiteUrl).toBe('https://underclub.it');
    expect(env.allowedOrigins).toEqual(['https://underclub.it']);
  });

  it('requires Resend settings in production and refuses the console transport', () => {
    expect(() => readEnv({ ...base, VERCEL_ENV: 'production' })).toThrow(/RESEND_API_KEY, EMAIL_FROM/);
    expect(() => readEnv({ ...base, VERCEL_ENV: 'production', EMAIL_TRANSPORT: 'console' })).toThrow(ConfigError);
    const env = readEnv({
      ...base,
      VERCEL_ENV: 'production',
      RESEND_API_KEY: 're_x',
      EMAIL_FROM: 'Underclub <reservations@underclub.it>',
      ALLOWED_ORIGINS: 'https://www.underclub.it/, https://underclub.it',
    });
    expect(env.emailTransport).toBe('resend');
    expect(env.allowedOrigins).toEqual(['https://underclub.it', 'https://www.underclub.it']);
    expect(env.allowLocalhostOrigins).toBe(false);
  });

  it('treats a preview deployment like production for email', () => {
    expect(() => readEnv({ ...base, VERCEL_ENV: 'preview' })).toThrow(/RESEND_API_KEY, EMAIL_FROM/);
    expect(() => readEnv({ ...base, VERCEL_ENV: 'preview', EMAIL_TRANSPORT: 'console' })).toThrow(ConfigError);
  });

  it('reports every missing variable by name', () => {
    expect(() => readEnv({})).toThrow('missing env: PUBLIC_SITE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
    expect(() => readEnv({ PUBLIC_SITE_URL: 'http://localhost:5173' }, { dev: true, requireSupabase: false })).not.toThrow();
  });
});

describe('cookies', () => {
  it('reads uc_session among other cookies', () => {
    const r = (cookie: string) => new Request('https://x.it', { headers: { cookie } });
    expect(readSessionCookie(r('a=1; uc_session=abcdefghijklmnopqrstuvwxyz; b=2'))).toEqual({
      sent: true,
      token: 'abcdefghijklmnopqrstuvwxyz',
    });
    expect(readSessionCookie(r('a=1'))).toEqual({ sent: false, token: null });
    expect(readSessionCookie(r('uc_session='))).toEqual({ sent: true, token: null });
  });
});

describe('email templates', () => {
  const event = { title: 'Night <script>alert(1)</script> & "Friends"', date: '2026-10-10', time: '23:00:00', entryName: "Ridotto 'early'" };
  const evil = 'https://underclub.it/activate?token=a"><img src=x onerror=alert(1)>';

  it('escapes every interpolated value in HTML', () => {
    for (const mail of [
      activationEmail({ fullName: '<b>Ada</b> Lovelace', link: evil, event }),
      ticketEmail({ fullName: '<b>Ada</b> Lovelace', ticketLink: evil, event }),
      alreadyBookedEmail({ fullName: '<b>Ada</b> Lovelace', loginLink: evil, event }),
      loginEmail({ fullName: '<b>Ada</b> Lovelace', link: evil }),
    ]) {
      expect(mail.html).not.toContain('<script>');
      expect(mail.html).not.toContain('<b>Ada');
      expect(mail.html).not.toContain('"><img');
      expect(mail.html).toContain('&lt;b&gt;Ada&lt;/b&gt;');
      expect(mail.text).toContain(evil);
    }
    const a = activationEmail({ fullName: 'Ada Lovelace', link: 'https://u.it/x', event });
    expect(a.html).toContain('Night &lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;Friends&quot;');
    expect(a.html).toContain('Ridotto &#39;early&#39;');
    expect(escapeHtml(`<>&"'`)).toBe('&lt;&gt;&amp;&quot;&#39;');
  });

  it('carries event title, formatted date and entry name', () => {
    const mail = activationEmail({ fullName: 'Ada Lovelace', link: 'https://u.it/x', event: { ...event, title: 'Opening' } });
    expect(mail.subject).toBe('Confirm your spot at Opening');
    expect(mail.text).toContain('Hi Ada,');
    expect(mail.text).toContain('Saturday, 10 October 2026 at 23:00');
    expect(mail.text).toContain("Ridotto 'early'");
    const noEvent = activationEmail({ fullName: null, link: 'https://u.it/x', event: { title: null, date: null, time: null, entryName: null } });
    expect(noEvent.subject).toBe('Confirm your Underclub booking');
    expect(noEvent.text).not.toContain('Event:');
  });
});

describe('email transports', () => {
  it('Resend: posts the message with the API key, rejects on non-2xx', async () => {
    const fetchMock = vi.fn(async () => new Response('{"id":"1"}', { status: 200 }));
    const t = createResendTransport({ apiKey: 're_test', from: 'U <r@u.it>', fetch: fetchMock as unknown as typeof fetch });
    await t.send({ kind: 'login', to: 'a@b.it', subject: 'S', html: '<p>h</p>', text: 't' });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer re_test');
    expect(JSON.parse(init.body as string)).toMatchObject({ from: 'U <r@u.it>', to: ['a@b.it'], subject: 'S', html: '<p>h</p>', text: 't' });

    const failing = createResendTransport({
      apiKey: 're_test',
      from: 'U <r@u.it>',
      fetch: (async () => new Response('{"name":"validation_error"}', { status: 422 })) as unknown as typeof fetch,
    });
    await expect(failing.send({ kind: 'login', to: 'a@b.it', subject: 'S', html: 'h', text: 't' })).rejects.toThrow(
      'resend responded 422 validation_error',
    );
  });

  it('console: prints the text body (links included)', async () => {
    const lines: string[] = [];
    await createConsoleTransport((l) => lines.push(l)).send({
      kind: 'activation', to: 'a@b.it', subject: 'S', html: 'h', text: 'Go: https://u.it/activate?token=abc',
    });
    expect(lines.join('\n')).toContain('https://u.it/activate?token=abc');
  });
});
