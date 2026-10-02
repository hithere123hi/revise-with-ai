import { json, toClient } from '../../lib/core.js';

// GET /api/next?level=5&topic=all&pattern=...&seen=1,2,3
// With a pattern (question type): only that type at exactly that level; the client asks /api/generate if none is left.
// Without a pattern: any question in the topic at (or near) the level.
export async function onRequestGet({ request, env }) {
  const u = new URL(request.url);
  const level = Math.min(10, Math.max(1, parseInt(u.searchParams.get('level')) || 1));
  const topic = u.searchParams.get('topic') || 'all';
  const pattern = (u.searchParams.get('pattern') || '').slice(0, 80);
  const seen = JSON.stringify((u.searchParams.get('seen') || '').split(',').map(Number).filter(n => n > 0).slice(-300));

  const where = `hidden = 0 AND status = 'live' AND level = ?1 AND (?2 = 'all' OR topic = ?2) AND (?3 = '' OR pattern = ?3)
                 AND id NOT IN (SELECT value FROM json_each(?4))`;
  let row = null, servedLevel = level;
  for (const d of pattern ? [0] : [0, 1, -1, 2, -2, 3, -3]) {
    const L = level + d;
    if (L < 1 || L > 10) continue;
    row = await env.DB.prepare(`SELECT * FROM questions WHERE ${where} ORDER BY RANDOM() LIMIT 1`).bind(L, topic, pattern, seen).first();
    if (row) { servedLevel = L; break; }
  }
  const left = await env.DB.prepare(`SELECT COUNT(*) AS n FROM questions WHERE ${where}`).bind(level, topic, pattern, seen).first();
  return json({ question: row ? toClient(row) : null, servedLevel, exact: servedLevel === level, remainingAtLevel: left.n, low: left.n < 3 });
}
