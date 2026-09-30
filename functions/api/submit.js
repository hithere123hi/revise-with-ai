import {
  json, fail, readBody, take, clientIp, takeAiBudget, ai, analyzePrompt, toCandidate, pickTopic,
  blindCheck, isDuplicate, insertQuestion, candToClient, generateForTopic, aiErrorResponse, TOPICS
} from '../../lib/core.js';

// POST /api/submit
//   {mode: "question", text, answerKey?}  -> analyse, solve twice, judge, grade 1-10, store if it passes
//   {mode: "topic", text, level}          -> write 3 new questions on the topic at that level, verify, store
export async function onRequestPost({ request, env }) {
  const b = await readBody(request);
  if (!b || typeof b.text !== 'string') return fail('Send a question or a topic.');
  const text = b.text.trim();
  const perHour = Number(env.SUBMITS_PER_HOUR || 10);
  if (!(await take(env, 'sub:' + clientIp(request), perHour, 3600)))
    return fail(`You can add up to ${perHour} items an hour. Try again later.`, 429, 'rate_limited');

  try {
    if (b.mode === 'topic') {
      if (text.length < 2 || text.length > 80) return fail('Keep the topic between 2 and 80 characters.');
      const level = Math.min(10, Math.max(1, parseInt(b.level) || 5));
      const r = await generateForTopic(env, text, level, 3);
      if (!r.budget) return fail('Today\'s free AI quota is used up. Try again tomorrow.', 503, 'ai_busy');
      if (r.outOfScope) return fail(`Only Arithmetic topics for now: ${TOPICS.join(', ')}.`, 400, 'out_of_scope');
      return json({ mode: 'topic', topic: r.topic, level, saved: r.saved.map(candToClient), rejected: r.rejected });
    }

    if (text.length < 15 || text.length > 3000) return fail('Paste a full question (15 to 3000 characters).');
    const answerKey = typeof b.answerKey === 'string' ? b.answerKey.trim().slice(0, 100) : '';
    if (!(await takeAiBudget(env, 2))) return fail('Today\'s free AI quota is used up. Try again tomorrow.', 503, 'ai_busy');

    const a = await ai(env, analyzePrompt(text, answerKey), 0.1);
    const q = a.quality || {};
    const report = {
      topic: a.topic ? pickTopic(a.topic) : null, subtopic: a.subtopic || null,
      difficulty: a.difficulty ? Math.min(10, Math.max(1, Math.round(Number(a.difficulty)))) : null, difficultyReason: a.difficulty_reason || '',
      quality: { clarity: q.clarity, correctness: q.correctness, catRelevance: q.cat_relevance, conceptDepth: q.concept_depth },
      qualityOverall: Number(a.quality_overall) || 0, qualityNotes: a.quality_notes || '',
      answersAgree: !!a.answers_agree, visitorAnswerMatches: a.visitor_answer_matches ?? null,
      answerText: a.answer_text || null, solution: Array.isArray(a.solution_steps) ? a.solution_steps : []
    };
    const reject = reason => json({ mode: 'question', accepted: false, reason, report });

    if (!a.is_question) return reject(a.reject_reason || 'This doesn\'t look like a single Arithmetic question with one answer.');
    if (!report.topic) return reject(`Only Arithmetic questions are accepted for now (${TOPICS.join(', ')}).`);
    const cand = toCandidate(a, {
      topic: report.topic, subtopic: report.subtopic, level: report.difficulty, level_reason: report.difficultyReason,
      source: 'user', quality: report.qualityOverall, quality_detail: { ...q, notes: report.qualityNotes }
    });
    if (!cand) return reject('The AI could not pin down one clear answer, so the question may be ambiguous.');
    if (!a.answers_agree) return reject('Two different solving methods gave different answers, so the question may be flawed.');
    const minQ = Number(env.MIN_QUALITY || 6);
    if (report.qualityOverall < minQ || Number(q.correctness) < 7)
      return reject(`Quality score ${report.qualityOverall}/10 is below the bar of ${minQ}/10.`);
    if (!(await blindCheck(env, cand))) return reject('An independent re-solve got a different answer, so the question was not added.');
    const { dup, hash } = await isDuplicate(env, cand);
    if (dup) return reject('This question (or a near copy) is already in the bank.');

    const id = await insertQuestion(env, cand, hash);
    return json({ mode: 'question', accepted: true, report, question: candToClient({ ...cand, id }) });
  } catch (e) {
    return aiErrorResponse(e);
  }
}
