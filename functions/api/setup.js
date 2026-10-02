import { json, fail, readBody } from '../../lib/core.js';
import { SCHEMA, MIGRATIONS } from '../../lib/schema.js';
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
    return json({ next: 0, done: false, seedSize: SEED.length, schema: true });
  }
  const offset = Math.max(0, parseInt(b.offset) || 0);

  const chunk = SEED.slice(offset, offset + 20);
  if (chunk.length) {
    const stmt = env.DB.prepare(`INSERT OR IGNORE INTO questions
      (text, norm_hash, topic, level, answer, answer_text, distractors, solution, level_reason, source, pattern)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`);
    const tag = env.DB.prepare('UPDATE questions SET pattern = ?1 WHERE norm_hash = ?2 AND pattern IS NULL');   // tag questions loaded before types existed
    await env.DB.batch(chunk.flatMap(r => [
      stmt.bind(r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[8] || 'Starter question', r[9] || 'seed', r[10] || null),
      tag.bind(r[10] || null, r[1])
    ]));
  }
  const next = offset + chunk.length;
  const total = await env.DB.prepare('SELECT COUNT(*) AS n FROM questions').first();
  return json({ next, done: next >= SEED.length, seedSize: SEED.length, questionsInBank: total.n });
}
