import { json, fail, readBody, pickPattern } from '../../lib/core.js';
import { PATTERNS } from '../../lib/patterns.js';
import { SCHEMA, MIGRATIONS, AFTER_LOAD } from '../../lib/schema.js';
import { SEED } from '../../lib/seed-data.js';

// POST /api/setup {token, offset} -> creates tables, then loads starter questions in chunks.
// Protected by the ADMIN_TOKEN secret. Safe to run more than once.
export async function onRequestPost({ request, env }) {
  const b = await readBody(request) || {};
  if (!env.ADMIN_TOKEN) return fail('Add an ADMIN_TOKEN secret in Cloudflare first, then redeploy.', 500, 'not_configured');
  if (typeof b.token !== 'string' || b.token !== env.ADMIN_TOKEN) return fail('Wrong admin token.', 403, 'forbidden');
  if (!env.DB) return fail('The database is not connected. Check the database_id in wrangler.toml.', 500, 'not_configured');

  // Free D1 allows about 50 queries per request, so tables are set up first and rows go in small chunks.
  if (b.phase !== 'rows') {
    await env.DB.prepare(SCHEMA[0]).run();                            // questions table
    for (const m of MIGRATIONS) { try { await env.DB.prepare(m).run(); } catch {} }   // upgrade older databases
    await env.DB.batch(SCHEMA.slice(1).map(s => env.DB.prepare(s)));  // indexes and other tables
    // One-time re-grade after the switch to measured difficulty (October 2026):
    // student uploads are re-verified under the new rubric; older AI-written practice questions are retired.
    if (!(await env.DB.prepare("SELECT value FROM meta WHERE key = 'regrade_v2'").first())) {
      await env.DB.batch([
        env.DB.prepare("UPDATE questions SET status = 'pending', checks = NULL WHERE source = 'user' AND status != 'rejected'"),
        env.DB.prepare("UPDATE questions SET hidden = 1 WHERE source IN ('variation', 'topic')"),
        env.DB.prepare("INSERT INTO meta (key, value) VALUES ('regrade_v2', datetime('now'))")
      ]);
    }
    // Repair question types saved with a copied description, e.g. "Alternate days (workers working on...".
    const cat = Object.fromEntries(Object.entries(PATTERNS).map(([k, ps]) => [k, ps.map(p => p[0])]));
    const { results } = await env.DB.prepare("SELECT DISTINCT topic, pattern FROM questions WHERE pattern IS NOT NULL").all();
    const fixes = results.map(r => ({ ...r, fixed: pickPattern(r.pattern, r.topic, cat) })).filter(r => r.fixed && r.fixed !== r.pattern).slice(0, 40);
    if (fixes.length) await env.DB.batch(fixes.map(r => env.DB.prepare('UPDATE questions SET pattern = ?1 WHERE pattern = ?2').bind(r.fixed, r.pattern)));
    return json({ next: 0, done: false, seedSize: SEED.length, schema: true, repairedTypes: fixes.length });
  }
  const offset = Math.max(0, parseInt(b.offset) || 0);

  const chunk = SEED.slice(offset, offset + 20);
  if (chunk.length) {
    const stmt = env.DB.prepare(`INSERT OR IGNORE INTO questions
      (text, norm_hash, topic, level, answer, answer_text, distractors, solution, level_reason, source, pattern, rnd)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, abs(random()) / 9223372036854775807.0)`);
    // Starter questions already in the database get their latest type and measured level.
    const sync = env.DB.prepare(`UPDATE questions SET pattern = ?1, level = ?3, level_reason = ?4
      WHERE norm_hash = ?2 AND source IN ('seed', 'curated')`);
    await env.DB.batch(chunk.flatMap(r => [
      stmt.bind(r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[8] || 'Starter question', r[9] || 'seed', r[10] || null),
      sync.bind(r[10] || null, r[1], r[3], r[8] || 'Starter question')
    ]));
  }
  const next = offset + chunk.length;
  if (next >= SEED.length) for (const st of AFTER_LOAD) { try { await env.DB.prepare(st).run(); } catch (e) { console.error('setup step failed', st, e.message); } }
  const total = await env.DB.prepare('SELECT COUNT(*) AS n FROM questions').first();
  return json({ next, done: next >= SEED.length, seedSize: SEED.length, questionsInBank: total.n });
}
