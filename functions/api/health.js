import { json, modelChain } from '../../lib/core.js';

// GET /api/health -> which AI models are in the chain and which are resting (out of quota). No secrets shown.
export async function onRequestGet({ env }) {
  const now = Math.floor(Date.now() / 1000);
  let resting = {};
  try {
    const { results } = await env.DB.prepare("SELECT key, reset_at FROM rate_limits WHERE key LIKE 'rest:%' AND reset_at > ?").bind(now).all();
    resting = Object.fromEntries(results.map(r => [r.key.slice(5), Math.ceil((r.reset_at - now) / 60)]));
  } catch {}
  let used = null;
  try { used = (await env.DB.prepare("SELECT count FROM rate_limits WHERE key = 'ai:daily' AND reset_at > ?").bind(now).first())?.count ?? 0; } catch {}
  return json({
    models: modelChain(env).map(m => ({ model: m, status: resting[m] ? `resting for ${resting[m]} more minutes` : 'ready' })),
    aiCallsUsedToday: used, dailyLimit: Number(env.DAILY_AI_LIMIT || 400)
  });
}
