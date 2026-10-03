import { json, fail, readBody, take, makeVariations, generateForTopic, verifyQuestion, backgroundAllowed, aiErrorResponse, TOPICS } from '../../lib/core.js';

// POST /api/refill {level, topic} -> called when a level is running low; the bank grows itself
export async function onRequestPost({ request, env }) {
  const b = await readBody(request) || {};
  const level = Math.min(10, Math.max(1, parseInt(b.level) || 1));
  const topic = TOPICS.includes(b.topic) ? b.topic : 'all';
  if (!(await take(env, 'refill:global', 1, 60))) return json({ started: false, note: 'A refill ran recently.' });
  if (!(await backgroundAllowed(env))) return json({ started: false, note: 'Saving AI budget for uploads.' });
  try {
    // First, finish any upload whose background check was interrupted (e.g. the student closed the tab).
    const stale = await env.DB.prepare(
      "SELECT id FROM questions WHERE status = 'pending' AND created_at < datetime('now', '-10 minutes') ORDER BY id LIMIT 1").first();
    if (stale) { const v = await verifyQuestion(env, stale.id); return json({ started: true, verified: v }); }
    const parent = await env.DB.prepare(
      `SELECT * FROM questions WHERE hidden = 0 AND status = 'live' AND level = ?1 AND (?2 = 'all' OR topic = ?2)
       AND variations_made < ?3 AND (quality IS NULL OR quality >= 6) ORDER BY RANDOM() LIMIT 1`)
      .bind(level, topic, Number(env.MAX_VARIATIONS || 6)).first();
    let r;
    if (parent) r = await makeVariations(env, parent, 2);
    else {
      let t = topic;
      if (t === 'all') {
        const { results } = await env.DB.prepare("SELECT topic, COUNT(*) AS n FROM questions WHERE hidden = 0 AND status = 'live' AND level = ? GROUP BY topic").bind(level).all();
        const have = Object.fromEntries(results.map(x => [x.topic, x.n]));
        const least = Math.min(...TOPICS.map(x => have[x] || 0));
        const pool = TOPICS.filter(x => (have[x] || 0) === least);
        t = pool[Math.floor(Math.random() * pool.length)];
      }
      r = await generateForTopic(env, t, level, 3);
    }
    if (r.budget === false) return json({ started: false, note: 'Daily AI quota used up.' });
    return json({ started: true, saved: r.saved.length, rejected: r.rejected });
  } catch (e) { return aiErrorResponse(e); }
}
