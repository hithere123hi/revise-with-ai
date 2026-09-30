import { json, fail, readBody } from '../../lib/core.js';

// POST /api/attempt {id, correct} -> updates solve-rate stats for the question
export async function onRequestPost({ request, env }) {
  const b = await readBody(request);
  const id = Number(b?.id);
  if (!id) return fail('Missing question id.');
  await env.DB.prepare('UPDATE questions SET attempts = attempts + 1, correct = correct + ? WHERE id = ?').bind(b.correct ? 1 : 0, id).run();
  return json({ ok: true });
}
