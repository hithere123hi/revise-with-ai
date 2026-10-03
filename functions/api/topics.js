import { json, TOPICS, bankSummary } from '../../lib/core.js';
import { PATTERNS } from '../../lib/patterns.js';

// GET /api/topics -> topics with question counts per level, and the question types in each topic.
// Uses the hourly bank summary, so it stays cheap however large the bank grows.
export async function onRequestGet({ env }) {
  const byTopic = {}; let total = 0;
  for (const [topic, pattern, level, n] of (await bankSummary(env)).rows) {
    const t = (byTopic[topic] ||= { levels: Array(10).fill(0), patterns: {} });
    t.levels[level - 1] += n; total += n;
    if (pattern) t.patterns[pattern] = (t.patterns[pattern] || 0) + n;
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
