import { json, TOPICS } from '../../lib/core.js';

// GET /api/topics -> topic list with how many questions each level has
export async function onRequestGet({ env }) {
  const { results } = await env.DB.prepare(
    'SELECT topic, level, COUNT(*) AS n FROM questions WHERE hidden = 0 GROUP BY topic, level').all();
  const byTopic = {};
  let total = 0;
  for (const r of results) { (byTopic[r.topic] ||= Array(10).fill(0))[r.level - 1] = r.n; total += r.n; }
  return json({
    total,
    topics: TOPICS.map(t => ({ name: t, levels: byTopic[t] || Array(10).fill(0), count: (byTopic[t] || []).reduce((a, b) => a + b, 0) }))
  });
}
