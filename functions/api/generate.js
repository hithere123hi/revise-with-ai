import { json, fail, readBody, take, clientIp, generateSamePattern, candToClient, aiErrorResponse, pickExample } from '../../lib/core.js';

// POST /api/generate {pattern, level, exampleId?}
// Writes new questions of the same type at the requested level when the bank has none left there.
export async function onRequestPost({ request, env }) {
  const b = await readBody(request) || {};
  const pattern = typeof b.pattern === 'string' ? b.pattern.trim().slice(0, 80) : '';
  const level = Math.min(10, Math.max(1, parseInt(b.level) || 5));
  if (!pattern) return fail('Missing question type.');
  if (!(await take(env, 'gen:' + clientIp(request), Number(env.GENERATES_PER_HOUR || 20), 3600)))
    return fail('You have generated a lot of new questions this hour. Practise these for a bit, then try again.', 429, 'rate_limited');

  const example = await pickExample(env, pattern, level, b.exampleId);
  if (!example) return fail('No example of this question type was found.', 404, 'not_found');

  try {
    const r = await generateSamePattern(env, example, pattern, level, 2);
    if (r.budget === false) return fail('Today\'s free AI quota is used up. Try again tomorrow.', 503, 'ai_busy');
    return json({ saved: r.saved.map(candToClient), rejected: r.rejected });
  } catch (e) { return aiErrorResponse(e); }
}
