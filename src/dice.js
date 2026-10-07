const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
/* ============================================================
   DICE ENGINE - 5ecrawler/Avrae-style command parser
   ============================================================ */
function rollDie(sides) { return 1 + Math.floor(Math.random() * sides); }
let _d20kept = []; // kept d20 faces from the last evalExpr - used for crit detection (only the d20 crits)
let rollSequence = 0; // distinguishes expressions inside a routine or companion stack

function parseSel(s) {
  if (!s) return { type: "=", n: NaN };
  if (s[0] === ">") return { type: ">", n: +s.slice(1) };
  if (s[0] === "<") return { type: "<", n: +s.slice(1) };
  if (s[0] === "h") return { type: "h", n: +s.slice(1) };
  if (s[0] === "l") return { type: "l", n: +s.slice(1) };
  return { type: "=", n: +s };
}
function matchSel(v, sel) {
  if (sel.type === ">") return v > sel.n;
  if (sel.type === "<") return v < sel.n;
  return v === sel.n;
}
function applyOp(dice, op, selRaw, sides) {
  if (op === "mi") { const n = +selRaw; dice.forEach(d => { if (!d.dropped && d.v < n) d.v = n; }); return; }
  if (op === "ma") { const n = +selRaw; dice.forEach(d => { if (!d.dropped && d.v > n) d.v = n; }); return; }
  if (op === "kh" || op === "kl" || op === "ph" || op === "pl") {
    const n = +selRaw, high = op[1] === "h", keep = op[0] === "k";
    const active = dice.filter(d => !d.dropped);
    const sorted = [...active].sort((a, b) => high ? b.v - a.v : a.v - b.v);
    const chosen = new Set(sorted.slice(0, n));
    active.forEach(d => { const inC = chosen.has(d); d.dropped = keep ? !inC : inC; });
    return;
  }
  if (op === "k" || op === "p") {
    const sel = parseSel(selRaw), keep = op === "k";
    dice.forEach(d => { if (d.dropped) return; const m = matchSel(d.v, sel); d.dropped = keep ? !m : m; });
    return;
  }
  const sel = selRaw ? parseSel(selRaw) : { type: "=", n: sides }; // default: on max face
  if (op === "e") {
    for (let idx = 0, guard = 0; idx < dice.length && guard < 1000; idx++) {
      if (!dice[idx].dropped && matchSel(dice[idx].v, sel)) { dice.push({ v: rollDie(sides), dropped: false, exp: true }); guard++; }
    }
    return;
  }
  if (op === "ro") { dice.forEach(d => { if (!d.dropped && matchSel(d.v, sel)) { d.v = rollDie(sides); d.rer = true; } }); return; }
  if (op === "rr") { dice.forEach(d => { let g = 0; while (!d.dropped && matchSel(d.v, sel) && g < 1000) { d.v = rollDie(sides); d.rer = true; g++; } }); return; }
  if (op === "ra") { const add = []; dice.forEach(d => { if (!d.dropped && matchSel(d.v, sel)) add.push({ v: rollDie(sides), dropped: false, exp: true }); }); dice.push(...add); return; }
}
/* Which of a term's dice would be dropped if it were showing these faces - the same keep/drop
   operators the roller itself applies, re-run rather than reimplemented, so a tumbling advantage
   strikes out the same die the finished roll would. Only SELECTION ops are replayed: rerolls and
   explosions changed which dice exist at roll time and can't be redone against faces that are only
   passing through. */
export function dropFlagsFor(values, ops, sides) {
  const dice = values.map(v => ({ v, dropped: false }));
  const opRe = /(kh|kl|ph|pl|k|p)([<>]?\d+|h\d+|l\d+)?/gi;
  let m; while ((m = opRe.exec(ops || ""))) applyOp(dice, m[1].toLowerCase(), m[2], sides);
  return dice.map(d => d.dropped);
}

export function totalHtml(rolled) {
  const coeffs = (rolled.coeffs || []).join(',');
  return `<b class="roll-total" data-final="${rolled.value}"${rolled.rollId ? ` data-roll="${rolled.rollId}"` : ''}${coeffs ? ` data-coeffs="${coeffs}"` : ''}>${rolled.value}</b>`;
}

function evalDice(tok, termIdx, rollId) {
  const mm = tok.match(/^(\d*)d(\d+)(.*)$/i);
  const count = mm[1] === "" ? 1 : +mm[1], sides = +mm[2], rest = mm[3] || "";
  // Hard cap on dice per term, so a typo ("1000d6") can't lock the tab up. It is reported in the
  // roll's own render rather than applied quietly - a silently truncated roll is a wrong number
  // presented as a right one, which is the one thing this sheet never does (see DOCS: degrade to
  // manual, never guess).
  const MAX_DICE = 500, rolledCount = Math.min(count, MAX_DICE);
  const capped = count > MAX_DICE;
  const dice = [];
  for (let i = 0; i < rolledCount; i++) dice.push({ v: rollDie(sides), dropped: false });
  const opRe = /(rr|ro|ra|mi|ma|kh|kl|ph|pl|k|p|e)([<>]?\d+|h\d+|l\d+)?/gi;
  let om; while ((om = opRe.exec(rest))) applyOp(dice, om[1].toLowerCase(), om[2], sides);
  const total = dice.filter(d => !d.dropped).reduce((s, d) => s + d.v, 0);
  if (sides === 20) dice.forEach(d => { if (!d.dropped) _d20kept.push(d.v); });
  /* Each face is its own element carrying the die it came off and the number it settled on, which
     is what lets the tumbling animation flash it through other faces of the SAME die and then put
     it back (see animateRoll in roll-anim.js). Dropped and rerolled faces keep their own markup -
     a dropped die is still a die, and watching the one advantage discarded is half the fun. */
  /* Dropped-ness is a CLASS, not an <s> wrapper, because it has to be able to change while the
     dice are tumbling: with advantage, which of the two is kept depends on what they're currently
     showing, so the strike-through moves between them frame by frame. A wrapper element would mean
     restructuring the DOM mid-animation; a class is one toggle. `data-ops` carries the term's own
     selection operators so the animator can re-run the real keep/drop rule rather than reimplement
     one - see dropFlagsFor below. */
  const selOps = (rest.match(/(kh|kl|ph|pl|k|p)([<>]?\d+|h\d+|l\d+)?/gi) || []).join("");
  const face = d => {
    const cls = "die" + (d.dropped ? " die-dropped" : "") + (d.rer || d.exp ? " die-note" : "");
    const inner = `<span class="${cls}" data-sides="${sides}" data-final="${d.v}" data-term="${termIdx == null ? "" : termIdx}"${rollId ? ` data-roll="${rollId}"` : ""}${selOps ? ` data-ops="${escapeHtml(selOps)}"` : ""}>${d.v}</span>`;
    return (d.rer || d.exp) ? "<b>" + inner + "</b>" : inner;
  };
  const render = escapeHtml(tok) + " (" + dice.map(face).join(", ") + ")"
    + (capped ? ` <b>[capped at ${MAX_DICE} of ${count} dice]</b>` : "");
  return { value: total, render, dice, sides };
}
function evaluate(expr) {
  _d20kept = [];
  const rollId = ++rollSequence;
  const annotations = [];
  expr = expr.replace(/\[[^\]]*\]/g, m => { annotations.push(m.slice(1, -1)); return ""; });
  const re = /(\d*d\d+[hlkproaeim<>\d]*|\d+|[+\-*()])/gi;
  const tokens = []; let m; while ((m = re.exec(expr))) tokens.push(m[1]);
  const out = [], ops = [], prec = { "+": 1, "-": 1, "*": 2 }, display = [];
  let termIdx = 0;   // die terms in source order - the animation keys each face back to its term
  for (const t of tokens) {
    if (/^[+\-*]$/.test(t)) {
      while (ops.length && ops[ops.length - 1] !== "(" && prec[ops[ops.length - 1]] >= prec[t]) out.push(ops.pop());
      ops.push(t); display.push(" " + t + " ");
    } else if (t === "(") { ops.push(t); display.push("("); }
    else if (t === ")") { while (ops.length && ops[ops.length - 1] !== "(") out.push(ops.pop()); ops.pop(); display.push(")"); }
    else if (/d/i.test(t)) { const r = evalDice(t, termIdx++, rollId); out.push(r); display.push(r.render); }
    else { out.push({ value: Number(t) }); display.push(t); }
  }
  while (ops.length) out.push(ops.pop());
  const run = () => {
    const st = [];
    for (const o of out) {
      if (typeof o === "string") { const b = st.pop(), a = st.pop(); st.push(o === "+" ? a + b : o === "-" ? a - b : a * b); }
      else st.push(o.value);
    }
    return st.length ? st[0] : 0;
  };
  const value = run();
  /* How much the total moves per point on each die term, measured rather than assumed: bump the
     term by one, re-run the same RPN, take the difference. That's +1 for "1d20+5", -1 for "10-1d6"
     and 2 for "2*1d6" - so the tumbling animation can show a live total without re-parsing anything.
     It is exact for any expression linear in that term, which is every expression anyone rolls; a
     die multiplied by another die would only be approximate, and only mid-flash. */
  const terms = out.filter(o => o && typeof o === "object" && o.dice);
  terms.forEach(t => {
    const was = t.value;
    t.value = was + 1;
    t.coeff = run() - value;
    t.value = was;
  });
  return { value, display: display.join(""), annotations, terms, coeffs: terms.map(t => t.coeff), d20: _d20kept.slice(), rollId };
}


// Validate the complete expression before using pmcrwf's shared dice evaluator.
export function evalExpr(raw) {
  const expr = String(raw).replace(/\s/g, '').toLowerCase();
  if (!expr || expr.length > 256) throw new Error('Invalid dice expression');
  const tokens = expr.match(/\d*d\d+(?:(?:kh|kl)\d+)?|\d+|[()+*-]/g) || [];
  if (tokens.join('') !== expr) throw new Error('Invalid dice expression');
  let depth = 0, operand = true;
  for (const token of tokens) {
    if (token === '(') { if (!operand) throw new Error('Expected an operator'); depth++; }
    else if (token === ')') { if (operand || !depth--) throw new Error('Unbalanced parentheses'); }
    else if (/^[+*-]$/.test(token)) { if (operand) throw new Error('Expected dice or a number'); operand = true; }
    else {
      if (!operand) throw new Error('Expected an operator');
      const dice = token.match(/^(\d*)d(\d+)(?:(?:kh|kl)(\d+))?$/);
      if (dice && (!(Number(dice[1] || 1) >= 1 && Number(dice[1] || 1) <= 500) || !(Number(dice[2]) >= 1 && Number(dice[2]) <= 10000) || (dice[3] && (Number(dice[3]) < 1 || Number(dice[3]) > Number(dice[1] || 1))))) throw new Error('Dice outside limits');
      operand = false;
    }
  }
  if (depth || operand) throw new Error('Incomplete dice expression');
  const result = evaluate(expr);
  if (!Number.isSafeInteger(result.value)) throw new Error('Dice result outside limits');
  return result;
}
