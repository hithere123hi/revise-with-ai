import {
  json, fail, readBody, take, clientIp, takeAiBudget, ai, analyzePrompt, patternCatalogue, pickPattern, pickTopic,
  toCandidate, hashText, insertQuestion, candToClient, toClient, aiErrorResponse, TOPICS, levelFromFeatures, describeFeatures, normText
} from '../../lib/core.js';

// POST /api/analyze {text, answerKey?}
// Fast path: one AI call solves the question, names its topic and question type, and estimates difficulty.
// The question is stored as "pending"; /api/verify then checks it independently in the background.
export async function onRequestPost({ request, env }) {
  const b = await readBody(request);
  const text = typeof b?.text === 'string' ? b.text.trim() : '';
  if (text.length < 15 || text.length > 3000) return fail('Paste a full question (15 to 3000 characters).');
  const perHour = Number(env.SUBMITS_PER_HOUR || 10);
  if (!(await take(env, 'sub:' + clientIp(request), perHour, 3600)))
    return fail(`You can upload up to ${perHour} questions an hour. Try again later.`, 429, 'rate_limited');

  // Repeat uploads cost nothing: the same question (or a near-identical copy with the same numbers) reuses the stored analysis.
  const seenBefore = await findRepeat(env, text);
  if (seenBefore) return json({ ok: true, duplicate: true, cached: true, id: seenBefore.id, status: seenBefore.status, report: reportFromRow(seenBefore), question: toClient(seenBefore) });

  if (!(await takeAiBudget(env, 1))) return fail('Today\'s free AI quota is used up. Try again tomorrow.', 503, 'ai_busy');
  const answerKey = typeof b.answerKey === 'string' ? b.answerKey.trim().slice(0, 100) : '';

  try {
    const cat = await patternCatalogue(env);
    const a = await ai(env, analyzePrompt(text, answerKey, cat));
    const topic = a.topic ? pickTopic(a.topic) : null;
    const q = a.quality || {};
    const report = {
      topic, subtopic: a.subtopic || null, pattern: pickPattern(a.pattern, topic, cat),
      difficulty: levelFromFeatures(a.features) || (a.difficulty ? Math.min(10, Math.max(1, Math.round(Number(a.difficulty)))) : null),
      difficultyReason: [describeFeatures(a.features), a.difficulty_reason].filter(Boolean).join('. '),
      quality: { clarity: q.clarity, correctness: q.correctness, catRelevance: q.cat_relevance, conceptDepth: q.concept_depth },
      qualityOverall: Number(a.quality_overall) || 0, qualityNotes: a.quality_notes || '',
      answersAgree: !!a.answers_agree, visitorAnswerMatches: a.visitor_answer_matches ?? null,
      answerText: a.answer_text || null, solution: Array.isArray(a.solution_steps) ? a.solution_steps : []
    };
    const stop = reason => json({ ok: false, reason, report });
    if (!a.is_question) return stop(a.reject_reason || 'This doesn\'t look like a single Arithmetic question with one answer.');
    if (!topic) return stop(`Only Arithmetic questions are supported for now (${TOPICS.join(', ')}).`);
    const cand = toCandidate(a, {
      topic, subtopic: report.subtopic, level: report.difficulty || 5, level_reason: report.difficultyReason,
      source: 'user', quality: report.qualityOverall, quality_detail: { ...q, notes: report.qualityNotes, features: a.features || null },
      pattern: report.pattern, status: 'pending'
    });
    if (!cand) return stop('The AI could not pin down one clear answer, so the question may be ambiguous.');

    const hash = await hashText(cand.text);
    const existing = await env.DB.prepare('SELECT * FROM questions WHERE norm_hash = ?').bind(hash).first();
    if (existing) {   // already uploaded before: reuse it so the student can still practise this type
      await remember(env, text, existing.id);
      return json({ ok: true, duplicate: true, id: existing.id, status: existing.status, report: { ...report, pattern: existing.pattern || report.pattern, topic: existing.topic }, question: toClient(existing) });
    }
    const id = await insertQuestion(env, cand, hash);
    await remember(env, text, id);
    return json({ ok: true, id, status: 'pending', report, question: candToClient({ ...cand, id }) });
  } catch (e) { return aiErrorResponse(e); }
}

const numbersIn = t => (String(t).match(/\d+(?:\.\d+)?/g) || []).map(Number).sort((a, b) => a - b).join(',');
const wordSet = t => new Set(normText(t).split(' ').filter(Boolean));

async function findRepeat(env, text) {
  try {   // the cache table appears once /setup.html has been run; until then, just skip it
    const cached = await env.DB.prepare(
      "SELECT q.* FROM upload_cache c JOIN questions q ON q.id = c.question_id WHERE c.hash = ? AND q.status != 'rejected'").bind(await hashText(text)).first();
    if (cached) return cached;
  } catch {}
  const exact = await env.DB.prepare("SELECT * FROM questions WHERE norm_hash = ? AND status != 'rejected'").bind(await hashText(text)).first();
  if (exact) return exact;
  const words = [...new Set(normText(text).split(' ').filter(w => w.length >= 3 && /^[a-z]+$/.test(w)))].slice(0, 25);
  if (words.length < 4) return null;
  let rows = [];
  try {
    ({ results: rows } = await env.DB.prepare(
      `SELECT q.* FROM qsearch JOIN questions q ON q.id = qsearch.rowid
       WHERE qsearch MATCH ?1 AND q.status != 'rejected' AND q.hidden = 0 ORDER BY bm25(qsearch) LIMIT 5`)
      .bind(words.map(w => `"${w}"`).join(' OR ')).all());
  } catch { return null; }
  const mine = wordSet(text), nums = numbersIn(text);
  for (const r of rows) {
    const other = wordSet(r.text);
    let same = 0; for (const w of mine) if (other.has(w)) same++;
    const sim = same / (mine.size + other.size - same || 1);
    if (sim >= 0.85 && numbersIn(r.text) === nums) return r;   // same wording AND the same numbers
  }
  return null;
}

function reportFromRow(r) {
  let qd = {}; try { qd = JSON.parse(r.quality_detail || '{}'); } catch {}
  let solution = []; try { solution = JSON.parse(r.solution); } catch {}
  return {
    topic: r.topic, subtopic: r.subtopic, pattern: r.pattern, difficulty: r.level, difficultyReason: r.level_reason || '',
    quality: { clarity: qd.clarity, correctness: qd.correctness, catRelevance: qd.cat_relevance, conceptDepth: qd.concept_depth },
    qualityOverall: r.quality || 0, qualityNotes: qd.notes || '', answersAgree: true, visitorAnswerMatches: null,
    answerText: r.answer_text, solution
  };
}

async function remember(env, text, id) {
  try { await env.DB.prepare('INSERT OR IGNORE INTO upload_cache (hash, question_id) VALUES (?, ?)').bind(await hashText(text), id).run(); } catch {}
}
