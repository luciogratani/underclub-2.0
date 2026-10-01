/** POST /api/auth/login-link { email } → ep_request_login. "check_email" unless refused (403 bot, 429 per IP). */
import type { CheckEmailResponse } from '@underclub/shared';
import { guardBot, guardPost, json, readJsonObject, safeHandler } from '../http.js';
import { LOGIN_LINK_IP_LIMIT, enforceIpLimit } from '../throttle.js';
import { validateLoginLink } from '../validate.js';
import { activationLink } from '../links.js';
import { loginEmail } from '../emails/templates.js';

export const handleLoginLink = safeHandler('login-link', 'POST', async (request, deps) => {
  const guard = guardPost(request, deps.env) ?? (await guardBot(request, deps));
  if (guard) return guard;

  const email = validateLoginLink(await readJsonObject(request));
  const limited = await enforceIpLimit(request, deps, LOGIN_LINK_IP_LIMIT);
  if (limited) return limited;

  // `unknown` and `rate_limited` (per-address limit) send nothing and answer
  // like `sent`: the response never reveals whether the address is known.
  const row = await deps.rpc.requestLogin(email);

  if (row.outcome === 'sent' && row.activation_token) {
    const mail = loginEmail({ fullName: row.contact_full_name, link: activationLink(deps.env, row.activation_token) });
    // Swallowed on purpose: a different answer would reveal the address is known.
    await deps.email.send({ kind: 'login', to: email, ...mail }).catch((err: unknown) => {
      console.error('[api:login-link] email failed:', err instanceof Error ? err.message : 'unknown');
    });
  }
  return json(200, { status: 'check_email' } satisfies CheckEmailResponse);
});
