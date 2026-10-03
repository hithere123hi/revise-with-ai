import { json, toClient, fromTemplates } from '../../lib/core.js';

// GET /api/next?level=5&topic=all&pattern=...&seen=1,2,3
// Picks an unseen question at the level using an indexed random key (reads only a few rows, however big the bank).
// If the exact level is empty but a verified template exists, code writes a fresh question on the spot (no AI).
// Otherwise it serves the nearest level, and the client fills the gap in the background.
export async function onRequestGet({ request, env }) {
  const u = new URL(request.url);
  const level = Math.min(10, Math.max(1, parseInt(u.searchParams.get('level')) || 1));
  const topic = u.searchParams.get('topic') || 'all';
  const pattern = (u.searchParams.get('pattern') || '').slice(0, 80);
  const seen = JSON.stringify((u.searchParams.get('seen') || '').split(',').map(Number).filter(n => n > 0).slice(-300));

  const where = `status = 'live' AND hidden = 0 AND level = ?1 AND (?2 = '' OR pattern = ?2) AND (?3 = 'all' OR topic = ?3)
                 AND id NOT IN (SELECT value FROM json_each(?4))`;
  const pick = async L => {
    const r = Math.random();
    return await env.DB.prepare(`SELECT * FROM questions WHERE ${where} AND rnd >= ?5 ORDER BY rnd LIMIT 1`).bind(L, pattern, topic, seen, r).first()
        || await env.DB.prepare(`SELECT * FROM questions WHERE ${where} AND rnd < ?5 ORDER BY rnd DESC LIMIT 1`).bind(L, pattern, topic, seen, r).first();
  };

  let row = await pick(level), servedLevel = level;
  if (!row && pattern) {                        // free, instant: make one from a template
    const made = await fromTemplates(env, pattern, level, 2);
    if (made.length) row = await env.DB.prepare('SELECT * FROM questions WHERE id = ?').bind(made[0].id).first();
  }
  // Look outward for the nearest ready level. The page serves it directly only if it is one level away;
  // further than that, it offers it as an option while the right level is written.
  if (!row) {
    for (const d of [1, -1, 2, -2, 3, -3, 4, -4, 5, -5]) {
      const L = level + d;
      if (L < 1 || L > 10) continue;
      row = await pick(L);
      if (row) { servedLevel = L; break; }
    }
  }
  // "How many are left here?", counted only up to 5 so it stays cheap.
  const left = await env.DB.prepare(`SELECT COUNT(*) AS n FROM (SELECT 1 FROM questions WHERE ${where} LIMIT 5)`).bind(level, pattern, topic, seen).first();
  return json({ question: row ? toClient(row) : null, servedLevel, exact: servedLevel === level, remainingAtLevel: left.n, low: left.n < 3 });
}
