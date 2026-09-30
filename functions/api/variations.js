import { json, fail, readBody, take, clientIp, makeVariations, aiErrorResponse } from '../../lib/core.js';

// POST /api/variations {id} -> write 2 fresh-number versions of an approved question
export async function onRequestPost({ request, env }) {
  const b = await readBody(request);
  const id = Number(b?.id);
  if (!id) return fail('Missing question id.');
  if (!(await take(env, 'var:ip:' + clientIp(request), 20, 3600)) || !(await take(env, 'var:global', 6, 60)))
    return fail('Variations are being written for other questions. Try again in a minute.', 429, 'rate_limited');
  const parent = await env.DB.prepare('SELECT * FROM questions WHERE id = ? AND hidden = 0').bind(id).first();
  if (!parent) return fail('Question not found.', 404, 'not_found');
  if (parent.variations_made >= Number(env.MAX_VARIATIONS || 6)) return json({ saved: 0, rejected: 0, note: 'This question already has enough variations.' });
  try {
    const r = await makeVariations(env, parent, 2);
    if (r.budget === false) return fail('Today\'s free AI quota is used up.', 503, 'ai_busy');
    return json({ saved: r.saved.length, rejected: r.rejected });
  } catch (e) { return aiErrorResponse(e); }
}
