import { json, fail, readBody, take, clientIp, stockCounts, gapOrder, globalGap, pickExample, targetPerLevel,
  generateSamePattern, fromTemplates, backgroundAllowed, aiErrorResponse } from '../../lib/core.js';

// POST /api/stock {pattern?, around?, exampleId?}
// Fills ONE gap in the bank ahead of time (2 new questions at one level), so students never wait.
//  - with a pattern: the nearest under-stocked level of that type to `around`
//  - without: the most useful gap anywhere in the bank
// Called in the background by visitors' browsers; strictly rate-limited.
export async function onRequestPost({ request, env }) {
  const b = await readBody(request) || {};
  if (!(await take(env, 'stock:ip:' + clientIp(request), 40, 3600)))
    return json({ done: false, throttled: 'ip', note: 'This browser has helped enough for now.' });
  if (!(await take(env, 'stock:global', Number(env.STOCK_PER_MINUTE || 3), 60)))
    return json({ done: false, throttled: 'busy', note: 'Other visitors are already filling the bank.' });

  let pattern = typeof b.pattern === 'string' ? b.pattern.trim().slice(0, 80) : '';
  let level;
  const target = targetPerLevel(env);
  if (pattern) {
    const counts = await stockCounts(env, pattern);
    const around = Math.min(10, Math.max(1, parseInt(b.around) || 5));
    const gaps = [];
    for (const L of gapOrder(counts, around, target)) if (!(await missedRecently(env, pattern, L))) gaps.push(L);
    if (!gaps.length) return json({ done: true, pattern, counts: counts.slice(1) });
    level = gaps[0];
  } else {
    let g = await globalGap(env);
    for (let i = 0; g && i < 3 && (await missedRecently(env, g.pattern, g.level)); i++) g = await globalGap(env);
    if (!g || (await missedRecently(env, g.pattern, g.level))) return json({ done: true });
    pattern = g.pattern; level = g.level;
  }
  // Free first: if a verified template exists for this gap, code fills it with no AI at all.
  const free = await fromTemplates(env, pattern, level, 2);
  if (free.length) return json({ done: false, pattern, level, saved: free.length, via: 'template', counts: (await stockCounts(env, pattern)).slice(1) });
  if (!(await backgroundAllowed(env))) return json({ done: false, throttled: 'budget', note: 'Saving the rest of today\'s AI budget for students\' uploads.' });
  const example = await pickExample(env, pattern, level, b.exampleId);
  if (!example) return json({ done: true, note: 'No example of this type yet.' });
  try {
    const r = await generateSamePattern(env, example, pattern, level, 2);
    if (r.budget === false) return json({ done: false, throttled: 'budget', note: 'Daily AI budget used up.' });
    if (!r.saved.some(q => q.level === level)) await take(env, `miss:${pattern}:${level}`, 99, 6 * 3600);   // count a miss
    const counts = await stockCounts(env, pattern);
    return json({ done: false, pattern, level, saved: r.saved.length, savedLevels: r.saved.map(q => q.level), rejected: r.rejected, via: r.via || 'questions', counts: counts.slice(1) });
  } catch (e) { return aiErrorResponse(e); }
}

// Two misses in 6 hours (the AI kept writing a different level than asked) and the gap is left alone for a while.
async function missedRecently(env, pattern, level) {
  const row = await env.DB.prepare('SELECT count, reset_at FROM rate_limits WHERE key = ?').bind(`miss:${pattern}:${level}`).first();
  return !!row && row.reset_at > Date.now() / 1000 && row.count >= 2;
}
