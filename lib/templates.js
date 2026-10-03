// Question templates: the AI writes a question with blanks and an answer formula ONCE;
// code then fills in fresh numbers to make unlimited questions at zero AI cost.
// Cloudflare forbids eval/new Function, so formulas run through this small, safe evaluator.

/* ---------------- Safe arithmetic evaluator ----------------
   Supports numbers, variables, + - * / % ^, parentheses, comparisons (== != < <= > >=), && || !,
   and functions: sqrt abs round floor ceil min max pow gcd lcm. Nothing else can run. */
const FUNCS = {
  sqrt: Math.sqrt, abs: Math.abs, floor: Math.floor, ceil: Math.ceil, pow: Math.pow,
  min: (...a) => Math.min(...a), max: (...a) => Math.max(...a),
  round: (x, d = 0) => { const f = 10 ** d; return Math.round(x * f) / f; },
  gcd: (a, b) => { a = Math.abs(Math.round(a)); b = Math.abs(Math.round(b)); while (b) [a, b] = [b, a % b]; return a; },
  lcm: (a, b) => { const g = FUNCS.gcd(a, b); return g ? Math.abs(Math.round(a) * Math.round(b)) / g : 0; },
};

function tokenize(src) {
  const t = []; let i = 0;
  const s = String(src).replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-');
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    const num = s.slice(i).match(/^\d+(\.\d+)?/);
    if (num) { t.push({ k: 'n', v: parseFloat(num[0]) }); i += num[0].length; continue; }
    const id = s.slice(i).match(/^[A-Za-z_]\w*/);
    if (id) { t.push({ k: 'id', v: id[0] }); i += id[0].length; continue; }
    const op = s.slice(i).match(/^(==|!=|<=|>=|&&|\|\||[-+*/%^(),<>!])/);
    if (op) { t.push({ k: 'op', v: op[0] }); i += op[0].length; continue; }
    throw new Error('Bad character in formula: ' + c);
  }
  return t;
}

export function evaluate(expr, vars = {}) {
  const t = tokenize(expr); let p = 0;
  const peek = () => t[p], eat = v => { if (t[p] && t[p].v === v) { p++; return true; } return false; };
  const need = v => { if (!eat(v)) throw new Error(`Expected ${v}`); };
  const or = () => { let a = and(); while (eat('||')) { const b = and(); a = (a || b) ? 1 : 0; } return a; };
  const and = () => { let a = cmp(); while (eat('&&')) { const b = cmp(); a = (a && b) ? 1 : 0; } return a; };
  const cmp = () => {
    let a = add();
    for (;;) {
      const o = peek(); if (!o || !['==', '!=', '<', '<=', '>', '>='].includes(o.v)) return a; p++;
      const b = add(), e = 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
      a = ({ '==': Math.abs(a - b) <= e, '!=': Math.abs(a - b) > e, '<': a < b, '<=': a <= b + e, '>': a > b, '>=': a >= b - e })[o.v] ? 1 : 0;
    }
  };
  const add = () => { let a = mul(); for (;;) { if (eat('+')) a += mul(); else if (eat('-')) a -= mul(); else return a; } };
  const mul = () => { let a = un(); for (;;) { if (eat('*')) a *= un(); else if (eat('/')) a /= un(); else if (eat('%')) a %= un(); else return a; } };
  const un = () => { if (eat('-')) return -un(); if (eat('+')) return un(); if (eat('!')) return un() ? 0 : 1; return pw(); };
  const pw = () => { const a = atom(); return eat('^') ? a ** un() : a; };
  const atom = () => {
    const tok = t[p++];
    if (!tok) throw new Error('Formula ended early');
    if (tok.k === 'n') return tok.v;
    if (tok.v === '(') { const v = or(); need(')'); return v; }
    if (tok.k === 'id') {
      if (eat('(')) {
        const f = Object.hasOwn(FUNCS, tok.v) ? FUNCS[tok.v] : null; if (!f) throw new Error('Unknown function ' + tok.v);
        const args = []; if (!eat(')')) { do args.push(or()); while (eat(',')); need(')'); }
        return f(...args);
      }
      if (!Object.hasOwn(vars, tok.v) || typeof vars[tok.v] !== 'number') throw new Error('Unknown name ' + tok.v);
      return vars[tok.v];
    }
    throw new Error('Unexpected ' + tok.v);
  };
  const v = or();
  if (p < t.length) throw new Error('Unexpected ' + t[p].v);
  return v;
}

/* ---------------- Templates ---------------- */
const fmtNum = x => {
  const r = Math.round(x * 100) / 100;
  if (Number.isInteger(r)) return Math.abs(r) >= 10000 ? r.toLocaleString('en-IN') : String(r);
  return String(r);
};
const isClean = x => Number.isFinite(x) && Math.abs(x * 100 - Math.round(x * 100)) < 1e-6;

function draw(spec, rand) {
  if (Array.isArray(spec)) {                       // [min, max, step]
    const [lo, hi, step = 1] = spec.map(Number);
    const n = Math.floor((hi - lo) / step);
    return Math.round((lo + step * Math.floor(rand() * (n + 1))) * 1e6) / 1e6;
  }
  if (spec && Array.isArray(spec.choices)) return Number(spec.choices[Math.floor(rand() * spec.choices.length)]);
  throw new Error('Bad variable spec');
}

const fill = (str, vars) => String(str)
  .replace(/\{=([^}]+)\}/g, (_, e) => fmtNum(evaluate(e, vars)))
  .replace(/\{([A-Za-z_]\w*)\}/g, (m, k) => (Object.hasOwn(vars, k) ? fmtNum(vars[k]) : m));

// Check a template's shape before trusting it. Returns an error message or null.
export function validateTemplate(tpl) {
  if (!tpl || typeof tpl.text !== 'string' || !tpl.vars || typeof tpl.answer !== 'string') return 'Missing text, vars or answer';
  if (Object.keys(tpl.vars).length < 1 || Object.keys(tpl.vars).length > 8) return 'Needs 1 to 8 variables';
  if (!Array.isArray(tpl.solution) || !tpl.solution.length) return 'Missing solution steps';
  return null;
}

// Make one question from a template with fresh numbers. Returns null if no clean numbers were found.
export function instantiate(tpl, rand = Math.random, tries = 300) {
  for (let i = 0; i < tries; i++) {
    try {
      const v = {};
      for (const [k, spec] of Object.entries(tpl.vars)) v[k] = draw(spec, rand);
      for (const [k, e] of Object.entries(tpl.derived || {})) v[k] = evaluate(e, v);
      if (!(tpl.require || []).every(r => evaluate(r, v))) continue;
      const answer = evaluate(tpl.answer, v);
      if (!isClean(answer) || Math.abs(answer) > 1e9) continue;
      const ans = Math.round(answer * 100) / 100;
      const wrong = [...new Set((tpl.distractors || []).map(d => { try { return Math.round(evaluate(d, v) * 100) / 100; } catch { return NaN; } })
        .filter(d => Number.isFinite(d) && Math.abs(d - ans) > 1e-9))].slice(0, 3);
      return {
        text: fill(tpl.text, v),
        answer: ans,
        answer_text: tpl.unit ? `${fmtNum(ans)} ${tpl.unit}`.trim() : fmtNum(ans),
        distractors: wrong.length >= 3 ? wrong : null,
        solution: tpl.solution.map(s => fill(s, v)),
        values: v,
      };
    } catch { /* bad draw (e.g. division by zero): try other numbers */ }
  }
  return null;
}
