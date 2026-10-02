import {
  json, fail, readBody, take, clientIp, takeAiBudget, ai, analyzePrompt, patternCatalogue, pickPattern, pickTopic,
  toCandidate, hashText, insertQuestion, candToClient, toClient, aiErrorResponse, TOPICS
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
  if (!(await takeAiBudget(env, 1))) return fail('Today\'s free AI quota is used up. Try again tomorrow.', 503, 'ai_busy');
  const answerKey = typeof b.answerKey === 'string' ? b.answerKey.trim().slice(0, 100) : '';

  try {
    const cat = await patternCatalogue(env);
    const a = await ai(env, analyzePrompt(text, answerKey, cat));
    const topic = a.topic ? pickTopic(a.topic) : null;
    const q = a.quality || {};
    const report = {
      topic, subtopic: a.subtopic || null, pattern: pickPattern(a.pattern, topic, cat),
      difficulty: a.difficulty ? Math.min(10, Math.max(1, Math.round(Number(a.difficulty)))) : null,
      difficultyReason: a.difficulty_reason || '',
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
      source: 'user', quality: report.qualityOverall, quality_detail: { ...q, notes: report.qualityNotes },
      pattern: report.pattern, status: 'pending'
    });
    if (!cand) return stop('The AI could not pin down one clear answer, so the question may be ambiguous.');

    const hash = await hashText(cand.text);
    const existing = await env.DB.prepare('SELECT * FROM questions WHERE norm_hash = ?').bind(hash).first();
    if (existing) {   // already uploaded before: reuse it so the student can still practise this type
      return json({ ok: true, duplicate: true, id: existing.id, status: existing.status, report: { ...report, pattern: existing.pattern || report.pattern, topic: existing.topic }, question: toClient(existing) });
    }
    const id = await insertQuestion(env, cand, hash);
    return json({ ok: true, id, status: 'pending', report, question: candToClient({ ...cand, id }) });
  } catch (e) { return aiErrorResponse(e); }
}
