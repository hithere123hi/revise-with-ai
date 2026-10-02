import { json, TOPICS } from '../../lib/core.js';
import { PATTERNS } from '../../lib/patterns.js';

// GET /api/topics -> topics with question counts per level, and the question types in each topic
export async function onRequestGet({ env }) {
  const { results } = await env.DB.prepare(
    "SELECT topic, pattern, level, COUNT(*) AS n FROM questions WHERE hidden = 0 AND status = 'live' GROUP BY topic, pattern, level").all();
  const byTopic = {}; let total = 0;
  for (const r of results) {
    const t = (byTopic[r.topic] ||= { levels: Array(10).fill(0), patterns: {} });
    t.levels[r.level - 1] += r.n; total += r.n;
    if (r.pattern) t.patterns[r.pattern] = (t.patterns[r.pattern] || 0) + r.n;
  }
  return json({
    total,
    topics: TOPICS.map(name => {
      const t = byTopic[name] || { levels: Array(10).fill(0), patterns: {} };
      const order = (PATTERNS[name] || []).map(p => p[0]);
      const patterns = Object.entries(t.patterns).map(([p, n]) => ({ name: p, count: n }))
        .sort((a, b) => ((order.indexOf(a.name) + 1) || 999) - ((order.indexOf(b.name) + 1) || 999));
      return { name, levels: t.levels, count: t.levels.reduce((a, b) => a + b, 0), patterns };
    })
  });
}
