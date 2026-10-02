import { json, fail, statusOf } from '../../lib/core.js';

// GET /api/status?id=123 -> verification status of an uploaded question
export async function onRequestGet({ request, env }) {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!id) return fail('Missing question id.');
  const row = await env.DB.prepare('SELECT id, status, level, pattern, topic, checks FROM questions WHERE id = ?').bind(id).first();
  if (!row) return fail('Question not found.', 404, 'not_found');
  return json(statusOf(row));
}
