import { json, fail, readBody, pickPattern } from '../../lib/core.js';
import { SCHEMA, MIGRATIONS, AFTER_LOAD } from '../../lib/schema.js';
import { PATTERNS } from '../../lib/patterns.js';

// POST /api/setup {token, phase, ...}  (driven by /setup.html, protected by the ADMIN_TOKEN secret)
//   phase "schema":    create or upgrade tables, one-time fixes
//   phase "rows":      insert up to 45 questions sent by the page (from /seed/*.json); existing ones are skipped
//   phase "templates": insert up to 40 verified templates
//   phase "finish":    random keys and full-text index, then report totals
// Free D1 allows about 50 queries per request, so the page sends small batches.
export async function onRequestPost({ request, env }) {
  const b = await readBody(request) || {};
  if (!env.ADMIN_TOKEN) return fail('Add an ADMIN_TOKEN secret in Cloudflare first, then redeploy.', 500, 'not_configured');
  if (typeof b.token !== 'string' || b.token !== env.ADMIN_TOKEN) return fail('Wrong admin token.', 403, 'forbidden');
  if (!env.DB) return fail('The database is not connected. Check the database_id in wrangler.toml.', 500, 'not_configured');

  try {
    if (b.phase === 'schema') {
      await env.DB.prepare(SCHEMA[0]).run();
      for (const m of MIGRATIONS) { try { await env.DB.prepare(m).run(); } catch {} }
      await env.DB.batch(SCHEMA.slice(1).map(s => env.DB.prepare(s)));
      // One-time re-grade after the switch to measured difficulty.
      if (!(await env.DB.prepare("SELECT value FROM meta WHERE key = 'regrade_v2'").first())) {
        await env.DB.batch([
          env.DB.prepare("UPDATE questions SET status = 'pending', checks = NULL WHERE source = 'user' AND status != 'rejected'"),
          env.DB.prepare("UPDATE questions SET hidden = 1 WHERE source IN ('variation', 'topic')"),
          env.DB.prepare("INSERT INTO meta (key, value) VALUES ('regrade_v2', datetime('now'))")
        ]);
      }
      // Repair question types saved with a copied description.
      const cat = Object.fromEntries(Object.entries(PATTERNS).map(([k, ps]) => [k, ps.map(p => p[0])]));
      const { results } = await env.DB.prepare('SELECT DISTINCT topic, pattern FROM questions WHERE pattern IS NOT NULL').all();
      const fixes = results.map(r => ({ ...r, fixed: pickPattern(r.pattern, r.topic, cat) })).filter(r => r.fixed && r.fixed !== r.pattern).slice(0, 30);
      if (fixes.length) await env.DB.batch(fixes.map(r => env.DB.prepare('UPDATE questions SET pattern = ?1 WHERE pattern = ?2').bind(r.fixed, r.pattern)));
      return json({ ok: true, repairedTypes: fixes.length });
    }

    if (b.phase === 'rows') {
      const rows = Array.isArray(b.rows) ? b.rows.slice(0, 45) : [];
      const good = rows.filter(r => Array.isArray(r) && r.length >= 11 && typeof r[0] === 'string' && typeof r[1] === 'string' && /^[0-9a-f]{64}$/.test(r[1]));
      // 9 rows per statement (11 values each, under D1's 100-parameter limit).
      const stmts = [];
      for (let i = 0; i < good.length; i += 9) {
        const part = good.slice(i, i + 9);
        const sql = `INSERT OR IGNORE INTO questions (text, norm_hash, topic, level, answer, answer_text, distractors, solution, level_reason, source, pattern, rnd) VALUES `
          + part.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, abs(random()) / 9223372036854775807.0)').join(', ');
        stmts.push(env.DB.prepare(sql).bind(...part.flatMap(r => [r[0], r[1], r[2], Math.min(10, Math.max(1, Number(r[3]) || 1)), Number(r[4]),
          String(r[5]), String(r[6]), String(r[7]), r[8] || 'Starter question', r[9] || 'seed', r[10] || null])));
      }
      const res = stmts.length ? await env.DB.batch(stmts) : [];
      return json({ ok: true, received: rows.length, inserted: res.reduce((n, r) => n + (r.meta?.changes || 0), 0) });
    }

    if (b.phase === 'templates') {
      const list = Array.isArray(b.templates) ? b.templates.slice(0, 40) : [];
      const stmts = list.filter(t => t && t.pattern && t.topic && t.body).map(t => {
        const body = JSON.stringify(t.body);
        return env.DB.prepare(`INSERT INTO templates (pattern, topic, level, body) SELECT ?1, ?2, ?3, ?4
                               WHERE NOT EXISTS (SELECT 1 FROM templates WHERE pattern = ?1 AND body = ?4)`)
          .bind(String(t.pattern), String(t.topic), Math.min(10, Math.max(1, Number(t.level) || 1)), body);
      });
      const res = stmts.length ? await env.DB.batch(stmts) : [];
      return json({ ok: true, inserted: res.reduce((n, r) => n + (r.meta?.changes || 0), 0) });
    }

    if (b.phase === 'finish') {
      for (const st of AFTER_LOAD) { try { await env.DB.prepare(st).run(); } catch (e) { console.error('setup step failed', e.message); } }
      try { await env.DB.prepare("DELETE FROM meta WHERE key = 'summary'").run(); } catch {}
      const q = await env.DB.prepare("SELECT COUNT(*) AS n FROM questions WHERE status = 'live' AND hidden = 0").first();
      const t = await env.DB.prepare("SELECT COUNT(*) AS n FROM templates WHERE status = 'live'").first();
      return json({ ok: true, questionsInBank: q.n, templates: t.n });
    }
    return fail('Unknown setup phase.');
  } catch (e) {
    const msg = String(e.message || e);
    if (/limit|exceeded|too many/i.test(msg)) return fail('Cloudflare\'s free daily database limit was reached. Run setup again tomorrow; it continues where it stopped.', 429, 'd1_limit');
    console.error('setup failed', msg);
    return fail('Setup step failed: ' + msg.slice(0, 200), 500, 'setup_error');
  }
}
