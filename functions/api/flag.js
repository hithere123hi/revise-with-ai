import { json, fail, readBody, take, clientIp } from '../../lib/core.js';

// POST /api/flag {id} -> a visitor reports a wrong or broken question; 3 reports hide it
export async function onRequestPost({ request, env }) {
  const b = await readBody(request);
  const id = Number(b?.id);
  if (!id) return fail('Missing question id.');
  if (!(await take(env, 'flag:' + clientIp(request), 20, 3600))) return fail('Too many reports from you this hour.', 429, 'rate_limited');
  await env.DB.prepare('UPDATE questions SET flags = flags + 1, hidden = CASE WHEN flags + 1 >= ? THEN 1 ELSE hidden END WHERE id = ?')
    .bind(Number(env.FLAGS_TO_HIDE || 3), id).run();
  return json({ ok: true });
}
