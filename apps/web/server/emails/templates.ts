/**
 * Transactional email templates. Plain table layout with inline styles so it
 * survives every client; every interpolated value goes through `escapeHtml`.
 */

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export interface EventInfo {
  title: string | null;
  date: string | null; // YYYY-MM-DD
  time: string | null; // HH:MM[:SS]
  entryName: string | null;
}

const BRAND_LIME = '#c6f432';

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function firstName(fullName: string | null): string | null {
  const first = fullName?.trim().split(/\s+/)[0];
  return first ? first : null;
}

export function formatEventDate(date: string | null): string | null {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return date;
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(d);
}

function formatTime(time: string | null): string | null {
  return time ? time.slice(0, 5) : null;
}

/** "Saturday 10 October 2026 at 23:00" (whatever parts are known). */
function when(event: EventInfo): string | null {
  const date = formatEventDate(event.date);
  const time = formatTime(event.time);
  if (date && time) return `${date} at ${time}`;
  return date ?? time;
}

interface Layout {
  preheader: string;
  heading: string;
  paragraphs: string[]; // plain text, escaped here
  details: Array<[label: string, value: string | null]>;
  button: { label: string; href: string };
  footer: string;
}

function renderHtml(l: Layout): string {
  const details = l.details.filter((d): d is [string, string] => Boolean(d[1]));
  const detailRows = details
    .map(
      ([label, value]) =>
        `<tr><td style="padding:4px 0;color:#8a8a8a;font-size:13px;text-transform:uppercase;letter-spacing:1px;width:90px;vertical-align:top">${escapeHtml(label)}</td>` +
        `<td style="padding:4px 0;color:#ffffff;font-size:15px">${escapeHtml(value)}</td></tr>`,
    )
    .join('');
  const href = escapeHtml(l.button.href);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(l.heading)}</title></head>
<body style="margin:0;padding:0;background:#000000">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(l.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#000000">
<tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;font-family:Helvetica,Arial,sans-serif">
<tr><td style="padding:0 0 24px;color:${BRAND_LIME};font-size:22px;font-weight:bold;letter-spacing:4px">UNDERCLUB</td></tr>
<tr><td style="padding:0 0 16px;color:#ffffff;font-size:28px;font-weight:bold;line-height:1.2">${escapeHtml(l.heading)}</td></tr>
${l.paragraphs.map((p) => `<tr><td style="padding:0 0 14px;color:#d9d9d9;font-size:16px;line-height:1.5">${escapeHtml(p)}</td></tr>`).join('\n')}
${detailRows ? `<tr><td style="padding:8px 0 20px"><table role="presentation" cellpadding="0" cellspacing="0">${detailRows}</table></td></tr>` : ''}
<tr><td style="padding:8px 0 24px"><a href="${href}" style="display:inline-block;background:${BRAND_LIME};color:#000000;font-size:16px;font-weight:bold;text-decoration:none;padding:14px 28px;border-radius:999px">${escapeHtml(l.button.label)}</a></td></tr>
<tr><td style="padding:0 0 14px;color:#8a8a8a;font-size:13px;line-height:1.5">If the button does not work, copy this link into your browser:<br><a href="${href}" style="color:${BRAND_LIME};word-break:break-all">${href}</a></td></tr>
<tr><td style="padding:16px 0 0;border-top:1px solid #222222;color:#8a8a8a;font-size:12px;line-height:1.5">${escapeHtml(l.footer)}</td></tr>
</table></td></tr></table>
</body></html>`;
}

function renderText(l: Layout): string {
  const details = l.details.filter((d) => d[1]).map(([label, value]) => `${label}: ${value}`);
  return [
    'UNDERCLUB',
    '',
    l.heading,
    '',
    ...l.paragraphs.flatMap((p) => [p, '']),
    ...(details.length ? [...details, ''] : []),
    `${l.button.label}: ${l.button.href}`,
    '',
    '--',
    l.footer,
  ].join('\n');
}

function render(subject: string, layout: Layout): RenderedEmail {
  return { subject, html: renderHtml(layout), text: renderText(layout) };
}

function eventDetails(event: EventInfo): Layout['details'] {
  return [
    ['Event', event.title],
    ['When', when(event)],
    ['Entry', event.entryName],
  ];
}

function greeting(fullName: string | null): string {
  const name = firstName(fullName);
  return name ? `Hi ${name},` : 'Hi,';
}

/** Sent on a booking without session: the link confirms that pending booking. */
export function activationEmail(input: { fullName: string | null; link: string; event: EventInfo }): RenderedEmail {
  const { event } = input;
  const subject = event.title ? `Confirm your spot at ${event.title}` : 'Confirm your Underclub booking';
  return render(subject, {
    preheader: 'One tap to confirm your booking. The link expires in 30 minutes.',
    heading: 'ONE MORE STEP',
    paragraphs: [
      greeting(input.fullName),
      'Tap the button below to confirm your booking. Until you do, your spot is not reserved.',
      'The link works once and expires in 30 minutes.',
    ],
    details: eventDetails(event),
    button: { label: 'Confirm my booking', href: input.link },
    footer: "Didn't book anything? Just ignore this email: nothing will be reserved.",
  });
}

/** Sent when a booking becomes confirmed: the durable copy of the ticket link. */
export function ticketEmail(input: { fullName: string | null; ticketLink: string; event: EventInfo }): RenderedEmail {
  const { event } = input;
  const subject = event.title ? `You're in: your ticket for ${event.title}` : "You're in: your Underclub ticket";
  return render(subject, {
    preheader: 'Your booking is confirmed. Show the QR code at the door.',
    heading: "YOU'RE IN",
    paragraphs: [
      greeting(input.fullName),
      'Your booking is confirmed. Open your ticket and show the QR code at the door.',
      'Keep this email: the button below is your personal link to the ticket.',
    ],
    details: eventDetails(event),
    button: { label: 'Open my ticket', href: input.ticketLink },
    footer: 'This link is personal: do not share it, whoever holds it can use your ticket.',
  });
}

/** Sent instead of a new activation when the email already has a confirmed booking. */
export function alreadyBookedEmail(input: { fullName: string | null; loginLink: string; event: EventInfo }): RenderedEmail {
  const { event } = input;
  const subject = event.title ? `You're already on the list for ${event.title}` : "You're already on the list";
  return render(subject, {
    preheader: 'You already have a confirmed booking for this night.',
    heading: 'ALREADY ON THE LIST',
    paragraphs: [
      greeting(input.fullName),
      'Someone, hopefully you, just tried to book this night with your email address, but you already have a confirmed booking.',
      'Log in with the button below to see it. The link works once and expires in 30 minutes.',
    ],
    details: eventDetails(event),
    button: { label: 'Log in', href: input.loginLink },
    footer: "Wasn't you? You can ignore this email: your booking stays as it is.",
  });
}

/** Sent on POST /api/auth/login-link for a known contact. */
export function loginEmail(input: { fullName: string | null; link: string }): RenderedEmail {
  const subject = 'Your Underclub login link';
  return render(subject, {
    preheader: 'One tap to log in. The link expires in 30 minutes.',
    heading: 'LOG IN',
    paragraphs: [
      greeting(input.fullName),
      'Tap the button below to log in and see your bookings.',
      'The link works once and expires in 30 minutes.',
    ],
    details: [],
    button: { label: 'Log in', href: input.link },
    footer: "Didn't ask for this? Just ignore this email: nothing changes.",
  });
}
