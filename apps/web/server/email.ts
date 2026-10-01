/**
 * Email transports: Resend over plain `fetch` (production) and a console
 * transport that prints the message, links included (dev and tests only:
 * `readEnv` refuses it in production).
 */
import type { ServerEnv } from './env.js';

export type EmailKind = 'activation' | 'ticket' | 'already_booked' | 'login';

export interface EmailMessage {
  kind: EmailKind;
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface EmailTransport {
  /** Resolves once the provider accepted the message; rejects otherwise. */
  send(message: EmailMessage): Promise<void>;
}

export class EmailError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmailError';
  }
}

export interface ResendOptions {
  apiKey: string;
  from: string;
  replyTo?: string | null;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export function createResendTransport(options: ResendOptions): EmailTransport {
  const doFetch = options.fetch ?? fetch;
  return {
    async send(message) {
      let res: Response;
      try {
        res = await doFetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${options.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: options.from,
            to: [message.to],
            subject: message.subject,
            html: message.html,
            text: message.text,
            ...(options.replyTo ? { reply_to: options.replyTo } : {}),
            tags: [{ name: 'kind', value: message.kind }],
          }),
          signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
        });
      } catch (err) {
        throw new EmailError(`resend request failed: ${err instanceof Error ? err.name : 'unknown'}`);
      }
      if (!res.ok) {
        // Resend's error body describes the problem, it never echoes the email.
        let name = '';
        try {
          name = String(((await res.json()) as { name?: unknown }).name ?? '');
        } catch {
          // ignore
        }
        throw new EmailError(`resend responded ${res.status} ${name}`.trim());
      }
    },
  };
}

export function createConsoleTransport(log: (line: string) => void = console.log): EmailTransport {
  return {
    async send(message) {
      log(
        [
          `[email:console] kind=${message.kind} to=${message.to}`,
          `  subject: ${message.subject}`,
          ...message.text.split('\n').map((l) => `  | ${l}`),
        ].join('\n'),
      );
    },
  };
}

/** Test helper: keeps every message in memory; `failWith` makes send() reject. */
export interface CapturingTransport extends EmailTransport {
  sent: EmailMessage[];
  failWith: Error | null;
}

export function createCapturingTransport(): CapturingTransport {
  const transport: CapturingTransport = {
    sent: [],
    failWith: null,
    async send(message) {
      if (transport.failWith) throw transport.failWith;
      transport.sent.push(message);
    },
  };
  return transport;
}

export function createEmailTransport(env: ServerEnv): EmailTransport {
  if (env.emailTransport === 'resend') {
    return createResendTransport({ apiKey: env.resendApiKey!, from: env.emailFrom, replyTo: env.emailReplyTo });
  }
  return createConsoleTransport();
}
