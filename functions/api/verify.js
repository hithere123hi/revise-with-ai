import { json, fail, readBody, take, clientIp, verifyQuestion, aiErrorResponse } from '../../lib/core.js';

// POST /api/verify {id} -> solve the question N more times independently, settle its level, publish or reject it
export async function onRequestPost({ request, env }) {
  const b = await readBody(request);
  const id = Number(b?.id);
  if (!id) return fail('Missing question id.');
  if (!(await take(env, 'verify:' + clientIp(request), 30, 3600))) return fail('Too many checks requested. Try again later.', 429, 'rate_limited');
  try { return json(await verifyQuestion(env, id)); }
  catch (e) { return aiErrorResponse(e); }
}
