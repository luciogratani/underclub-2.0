/** POST /api/auth/login-link { email } → ep_request_login. Always "check_email". */
import type { CheckEmailResponse } from '@underclub/shared';
import { guardPost, json, readJsonObject, safeHandler } from '../http.js';
import { validateLoginLink } from '../validate.js';
import { activationLink } from '../links.js';
import { loginEmail } from '../emails/templates.js';

export const handleLoginLink = safeHandler('login-link', 'POST', async (request, deps) => {
  const guard = guardPost(request, deps.env);
  if (guard) return guard;

  const email = validateLoginLink(await readJsonObject(request));
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
