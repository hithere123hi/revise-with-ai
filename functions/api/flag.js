import { json, fail, readBody, take, clientIp } from '../../lib/core.js';

// POST /api/flag {id} -> a visitor reports a wrong or broken question; 3 reports hide it
export async function onRequestPost({ request, env }) {
  const b = await readBody(request);
  const id = Number(b?.id);
  if (!id) return fail('Missing question id.');
  if (!(await take(env, 'flag:' + clientIp(request), 20, 3600))) return fail('Too many reports from you this hour.', 429, 'rate_limited');
  await env.DB.prepare('UPDATE questions SET flags = flags + 1, hidden = CASE WHEN flags + 1 >= ? THEN 1 ELSE hidden END WHERE id = ?')
    .bind(Number(env.FLAGS_TO_HIDE || 3), id).run();
  // A template whose questions keep getting reported is retired (its formula is probably wrong somewhere).
  const q = await env.DB.prepare('SELECT template_id FROM questions WHERE id = ?').bind(id).first();
  if (q && q.template_id) {
    const bad = await env.DB.prepare('SELECT COUNT(*) AS n FROM questions WHERE template_id = ? AND flags > 0').bind(q.template_id).first();
    if (bad.n >= 2) await env.DB.batch([
      env.DB.prepare("UPDATE templates SET status = 'retired' WHERE id = ?").bind(q.template_id),
      env.DB.prepare('UPDATE questions SET hidden = 1 WHERE template_id = ? AND attempts = 0').bind(q.template_id)
    ]);
  }
  return json({ ok: true });
}
