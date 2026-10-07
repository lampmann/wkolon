/* ---------- Math-aware number fields (type "+5"/"-3" to adjust; clamps to bounds) ---------- */
export function evalArith(s) {
  // safe arithmetic for the number boxes: regex whitelist means no code injection is possible
  if (!/^[\d.+\-*\/().\s]+$/.test(s)) return null;
  try { const v = Function('"use strict"; return (' + s + ')')(); return typeof v === "number" && isFinite(v) ? v : null; }
  catch (e) { return null; }
}
export function commitMath(el, opts) {
  let raw = (el.value || "").trim();
  const allowEmpty = el.hasAttribute("data-allow-empty");
  const prev = Number(el.dataset.prev || 0);
  let val;
  if (raw === "") { if (allowEmpty) { el.value = ""; el.dataset.prev = "0"; return; } val = prev; }
  else if (/^[+-]\d+(\.\d+)?$/.test(raw)) { val = prev + Number(raw); }      // typed just "+5" / "-3" / "+0.05"
  else if (/^-?\d+(\.\d+)?$/.test(raw)) { val = Number(raw); }               // plain absolute number
  else { const a = evalArith(raw); val = a === null ? prev : a; }            // arithmetic, e.g. "30+5"
  const min = el.dataset.min !== undefined ? Number(el.dataset.min) : -Infinity;
  let max = el.dataset.max !== undefined ? Number(el.dataset.max) : Infinity;
  if (el.dataset.maxFrom && !(opts && opts.skipMaxFrom)) {
    const f = document.getElementById(el.dataset.maxFrom);
    const raw = f ? (f.value !== undefined ? f.value : f.textContent) : "";
    if (raw !== "" && !isNaN(Number(raw))) max = Math.min(max, Number(raw));
  }
  val = el.hasAttribute("data-decimal") ? Math.round(val * 100) / 100 : Math.round(val);
  val = Math.min(max, Math.max(min, val));
  el.value = String(val);
  el.dataset.prev = String(val);
}
