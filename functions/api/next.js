import { json, toClient } from '../../lib/core.js';

// GET /api/next?level=5&topic=all&seen=1,2,3 -> one unseen question at (or near) that level
export async function onRequestGet({ request, env }) {
  const u = new URL(request.url);
  const level = Math.min(10, Math.max(1, parseInt(u.searchParams.get('level')) || 1));
  const topic = u.searchParams.get('topic') || 'all';
  const seen = (u.searchParams.get('seen') || '').split(',').map(Number).filter(n => n > 0).slice(-300);
  const seenJson = JSON.stringify(seen);

  const q = `SELECT * FROM questions WHERE hidden = 0 AND level = ?1 AND (?2 = 'all' OR topic = ?2)
             AND id NOT IN (SELECT value FROM json_each(?3)) ORDER BY RANDOM() LIMIT 1`;
  let row = null, servedLevel = level;
  for (const d of [0, 1, -1, 2, -2, 3, -3]) {
    const L = level + d;
    if (L < 1 || L > 10) continue;
    row = await env.DB.prepare(q).bind(L, topic, seenJson).first();
    if (row) { servedLevel = L; break; }
  }
  const left = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM questions WHERE hidden = 0 AND level = ?1 AND (?2 = 'all' OR topic = ?2)
     AND id NOT IN (SELECT value FROM json_each(?3))`).bind(level, topic, seenJson).first();

  return json({ question: row ? toClient(row) : null, servedLevel, exact: servedLevel === level, remainingAtLevel: left.n, low: left.n < 3 });
}
