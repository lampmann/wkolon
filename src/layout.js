/* ============================================================
   layout.js - free-form module layout.
   Move, resize (8 handles), snap-to-grid, snap-to-modules, persistent
   z-order, grid overlay, marquee multi-select (group move + group resize),
   scroll-follow + edge auto-scroll while dragging, save/load layout file.

   Model: `activated` = modules absolutely positioned (arrangement persists);
   `free` = EDIT mode (drag/resize/select, inputs disabled, grid overlay).
   Styles live in css/layout.css. Only HTML dependency is the script tag +
   the css/layout.css <link>.
   ============================================================ */
(function () {
  "use strict";
  const LKEY = "wkolon-layout";
  /* The Event Log starts collapsed on a FRESH install: the roll mirror in the corner is the primary
     rolling surface now - it has the same command line and shows the same entries - so the module
     is where you go to read back through history rather than something that needs to be open. Only
     a fresh install: the Object.assign below replaces `collapsed` wholesale from a saved layout, so
     anyone who already has one keeps exactly what they left. */
  const state = { free: false, activated: false, grid: 16, snapGrid: true, snapEdge: true, zTop: 0, map: {}, collapsed: { dice: true } };
  function validatedLayout(d) {
    const object = v => v && typeof v === 'object' && !Array.isArray(v);
    const validKey = k => /^[a-z][a-z0-9-]{0,80}$/.test(k);
    if (!object(d) || !object(d.map) || Object.keys(d.map).length > 100) throw new Error('not a layout file');
    for (const [k,p] of Object.entries(d.map)) {
      if (!validKey(k) || !object(p) || !['x','y','w'].every(n=>Number.isFinite(p[n]) && p[n]>=0 && p[n]<=1000000) || p.w<32 || ['h','hc','z'].some(n=>p[n]!==undefined && (!Number.isFinite(p[n]) || p[n]<0 || p[n]>1000000))) throw new Error('invalid module position');
    }
    const collapsed=d.collapsed || {}, stacks=d.stacks || {};
    if (!object(collapsed) || !object(stacks) || Object.entries(collapsed).some(([k,v])=>!validKey(k) || typeof v!=='boolean') || Object.keys(stacks).length>100) throw new Error('invalid layout groups');
    for (const st of Object.values(stacks)) {
      if (!object(st) || !Array.isArray(st.members) || st.members.length>100 || !st.members.every(validKey) || typeof st.active!=='string' || !st.members.includes(st.active)) throw new Error('invalid module stack');
    }
    return { free:!!d.free, activated:!!d.activated, grid:Math.max(1,Math.min(64,Number(d.grid)||16)), snapGrid:d.snapGrid!==false, snapEdge:d.snapEdge!==false, zTop:Math.max(0,Math.min(1000000,Number(d.zTop)||0)), map:d.map, collapsed, stacks };
  }
  try { const d = JSON.parse(localStorage.getItem(LKEY)); if (d) Object.assign(state, validatedLayout(d)); } catch (e) { /* Invalid layout preferences use the default flow. */ }

  if (!state.collapsed) state.collapsed = {};   // a layout saved before collapsing existed
  if (!state.stacks) state.stacks = {};         // { id: { members: [key, ...], active: key } }

  const DIRS = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];
  const byId = id => document.getElementById(id);
  const container = () => document.querySelector(".modules");
  const modules = () => [...document.querySelectorAll(".modules > .module")];
  const key = m => m.dataset.module || "";
  const moduleByKey = k => modules().find(m => key(m) === k) || null;
  const sX = () => window.scrollX || window.pageXOffset || 0;
  const sY = () => window.scrollY || window.pageYOffset || 0;
  function save() { try { localStorage.setItem(LKEY, JSON.stringify(state)); } catch (e) {} }

  /* ---- merged modules (stacks) ----
     Dropping a module onto another in Free mode merges them: every member keeps its own element and
     ids (the rest of the sheet never notices), all members share one position and size, only the
     active one is shown, and a tab bar at the top of each switches between them. Dragging a tab out
     in Free mode takes that module back out. */
  const stackIdOf = k => Object.keys(state.stacks).find(id => state.stacks[id].members.includes(k)) || null;
  const stackMates = m => { const id = stackIdOf(key(m)); return id ? state.stacks[id].members.filter(k => k !== key(m)).map(moduleByKey).filter(Boolean) : []; };
  const isHiddenMember = m => m.classList.contains("lay-stack-hidden");
  function moduleTitle(m) {
    const h2 = m.querySelector(":scope > h2");
    return h2 ? [...h2.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join("").replace(/\s+/g, " ").trim() || key(m) : key(m);
  }
  /* Copies a member's position and size to the rest of its stack. */
  function syncStack(m) {
    const p = state.map[key(m)]; if (!p) return;
    stackMates(m).forEach(o => {
      const q = state.map[key(o)] || (state.map[key(o)] = {});
      Object.assign(q, { x: p.x, y: p.y, w: p.w, h: p.h, hc: p.hc, z: p.z });
      applyPos(o);
    });
  }
  function renderStacks() {
    modules().forEach(m => { m.classList.remove("lay-stack-hidden", "lay-stacked"); const t = m.querySelector(":scope > .lay-tabs"); if (t) t.remove(); });
    // A stack left with fewer than two modules on the page (one removed, a stale save) dissolves.
    Object.keys(state.stacks).forEach(id => {
      const st = state.stacks[id];
      st.members = st.members.filter((k, i, a) => moduleByKey(k) && a.indexOf(k) === i);
      if (st.members.length < 2) delete state.stacks[id];
      else if (!st.members.includes(st.active)) st.active = st.members[0];
    });
    if (!state.activated) return;
    Object.values(state.stacks).forEach(st => {
      st.members.forEach(k => {
        const m = moduleByKey(k);
        m.classList.add("lay-stacked");
        m.classList.toggle("lay-stack-hidden", k !== st.active);
        const bar = document.createElement("div"); bar.className = "lay-tabs";
        bar.innerHTML = st.members.map(mk => `<button type="button" class="char-tab lay-tab${mk === st.active ? " active" : ""}" data-tab="${mk}">${escapeText(moduleTitle(moduleByKey(mk)))}</button>`).join("");
        m.insertBefore(bar, m.firstChild);
      });
    });
  }
  function escapeText(t) { return String(t).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
  function switchTab(k) {
    const id = stackIdOf(k); if (!id) return;
    state.stacks[id].active = k;
    const m = moduleByKey(k); if (m) { applyPos(m); }
    renderStacks(); sizeContainer(); save();
  }
  /* The stationary module keeps its place, size and tab order; the dragged one (or its whole
     stack) joins behind it and takes the same box. */
  function mergeInto(dragged, target) {
    const tKey = key(target), dKeys = stackIdOf(key(dragged)) ? [...state.stacks[stackIdOf(key(dragged))].members] : [key(dragged)];
    const dId = stackIdOf(key(dragged)); if (dId) delete state.stacks[dId];
    let tId = stackIdOf(tKey);
    if (!tId) { tId = "s" + Date.now().toString(36); state.stacks[tId] = { members: [tKey], active: tKey }; }
    dKeys.forEach(k => { if (!state.stacks[tId].members.includes(k)) state.stacks[tId].members.push(k); });
    // A module that was never resized sizes to its content; the stack gets the height it has now.
    const pt = state.map[tKey];
    if (pt && !pt.h && !target.classList.contains("lay-collapsed")) pt.h = target.offsetHeight;
    renderStacks();
    applyPos(target); syncStack(target);
    clearSelection(); sizeContainer(); save();
  }
  /* Takes a module out of its stack; it keeps the stack's size and lands where it's dropped. */
  function detach(m) {
    const id = stackIdOf(key(m)); if (!id) return;
    const st = state.stacks[id];
    st.members = st.members.filter(k => k !== key(m));
    if (st.active === key(m)) st.active = st.members[0];
    renderStacks(); save();
  }
  /* The visible module under a viewport point, other than `m` and its own stack; topmost wins. */
  function mergeTargetAt(m, cx, cy) {
    const skip = new Set([m, ...stackMates(m)]);
    return modules().filter(o => !skip.has(o) && !isHiddenMember(o)).filter(o => {
      const r = o.getBoundingClientRect(); return cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom;
    }).sort((a, b) => (Number(b.style.zIndex) || 0) - (Number(a.style.zIndex) || 0))[0] || null;
  }

  /* ---- selection ---- */
  const selected = new Set();
  const selectedModules = () => [...selected].map(moduleByKey).filter(Boolean);
  function clearSelection() { selected.clear(); updateSelectionUI(); }
  function selectAdd(m) { selected.add(key(m)); }
  function toggleSelect(m) { if (selected.has(key(m))) selected.delete(key(m)); else selected.add(key(m)); updateSelectionUI(); }
  function updateSelectionUI() {
    modules().forEach(m => m.classList.toggle("lay-selected", selected.has(key(m))));
    updateSelbox();
  }

  /* ---- handles ---- */
  function addHandles() {
    modules().forEach(m => {
      if (m.querySelector(":scope > .lay-h")) return;
      DIRS.forEach(d => { const h = document.createElement("div"); h.className = "lay-h " + d; h.dataset.dir = d; m.appendChild(h); });
    });
  }

  /* ---- collapse ----
     Every module's markup is `<h2>title</h2>` followed by its actual content, with nothing else -
     that's consistent across all of them, so rather than touch index.html once per module
     this wraps the "everything after the h2" part into one `.lay-body` div at runtime and toggles
     that div's display. Must run BEFORE addHandles(): the 8 resize handles are appended as direct
     children of `.module` (position: absolute against the module's own box), and if this ran after
     them it would sweep the handles into the body wrapper too. */
  function wrapBodies() {
    modules().forEach(m => {
      if (m.querySelector(":scope > .lay-body")) return;
      const h2 = m.querySelector(":scope > h2"); if (!h2) return;
      const body = document.createElement("div"); body.className = "lay-body";
      let n = h2.nextSibling;
      while (n) { const next = n.nextSibling; body.appendChild(n); n = next; }
      m.appendChild(body);   // h2 is the only sibling left, so this lands right after it
    });
  }
  /* One toggle button, prepended into each module's own <h2> - the same place Exhaustion's rules-ref
     button and Combat's status span already live, so a button inside a module title isn't a new
     pattern here. */
  function addCollapseToggles() {
    modules().forEach(m => {
      const h2 = m.querySelector(":scope > h2"); if (!h2 || h2.querySelector(":scope > .lay-collapse-btn")) return;
      const btn = document.createElement("button");
      btn.type = "button"; btn.className = "lay-collapse-btn"; btn.setAttribute("aria-expanded", "true");
      h2.insertBefore(btn, h2.firstChild);
    });
  }
  function applyCollapse(m) {
    const on = !!state.collapsed[key(m)];
    m.classList.toggle("lay-collapsed", on);
    const btn = m.querySelector(":scope > h2 > .lay-collapse-btn");
    if (btn) { btn.textContent = on ? "▸" : "▾"; btn.setAttribute("aria-label", on ? "Expand module" : "Collapse module"); btn.setAttribute("aria-expanded", String(!on)); }
    /* A collapsed module's height comes from its (now-hidden) content normally; if it was ever
       manually resized in Free mode it also carries an explicit inline height that content-hiding
       alone can't shrink. So each state gets its own remembered height: folding drops to `hc` (or
       to auto - just the title bar - for one never dragged while folded), and expanding restores
       `h`. Dragging the bottom edge writes whichever of the two applies at the time. */
    const p = state.map[key(m)];
    if (p) m.style.height = on ? (p.hc ? p.hc + "px" : "") : (p.h ? p.h + "px" : "");
  }
  function toggleCollapse(m) {
    const k = key(m); state.collapsed[k] = !state.collapsed[k];
    applyCollapse(m);
    /* Collapsing used to run a compaction pass, sliding everything below up to fill the gap. It was
       removed along with the Compact button: an arrangement you built by hand rearranging itself
       because you folded something is exactly the "helpful" surprise this sheet avoids elsewhere.
       A folded module leaves a hole, and the hole is yours to use or close. */
    sizeContainer();
    save();
  }

  /* ---- positions ---- */
  function ensurePositions() {
    const crect = container().getBoundingClientRect();
    // A module added to the sheet after you arranged yours (Senses, say) goes below everything
    // rather than into its flow spot, which your arrangement may already cover.
    const placed = modules().filter(m => state.map[key(m)]);
    let bottom = placed.reduce((b, m) => { const p = state.map[key(m)]; return Math.max(b, p.y + (p.h || m.offsetHeight)); }, 0);
    modules().forEach(m => {
      if (state.map[key(m)]) return;
      const r = m.getBoundingClientRect();
      if (placed.length) {
        state.map[key(m)] = { x: 0, y: bottom + 16, w: Math.round(r.width), h: 0, z: 0 };
        bottom += 16 + m.offsetHeight;
      } else {
        state.map[key(m)] = { x: Math.max(0, Math.round(r.left - crect.left)), y: Math.max(0, Math.round(r.top - crect.top)), w: Math.round(r.width), h: 0, z: 0 };
      }
    });
  }
  function applyPos(m) {
    const p = state.map[key(m)]; if (!p) return;
    m.style.left = p.x + "px"; m.style.top = p.y + "px"; m.style.width = p.w + "px";
    const collapsed = m.classList.contains("lay-collapsed");
    const h = collapsed ? p.hc : p.h;
    m.style.height = h ? h + "px" : ""; if (p.z) m.style.zIndex = p.z;
  }
  function clearPos(m) { m.style.left = m.style.top = m.style.width = m.style.height = m.style.zIndex = ""; }
  function bumpZ(m) { const p = state.map[key(m)]; if (!p) return; state.zTop = (state.zTop || 0) + 1; p.z = state.zTop; m.style.zIndex = p.z; }
  function sizeContainer() {
    const c = container(); if (!state.activated) { c.style.minHeight = ""; return; }
    let max = 0; modules().forEach(m => { const p = state.map[key(m)]; const b = (p ? p.y : 0) + m.offsetHeight; if (b > max) max = b; });
    c.style.minHeight = (max + 24) + "px";
  }
  function updateGrid() {
    const on = state.free && state.snapGrid && state.activated;
    const c = container(); c.classList.toggle("lay-grid-on", on);
    if (on) { let g = byId("lay-grid-overlay"); if (!g) { g = document.createElement("div"); g.id = "lay-grid-overlay"; c.appendChild(g); } g.style.backgroundSize = state.grid + "px " + state.grid + "px"; }
  }
  function apply() {
    const c = container();
    if (state.free) state.activated = true;
    if (state.activated) { ensurePositions(); c.classList.add("lay-active"); modules().forEach(applyPos); sizeContainer(); }
    else { c.classList.remove("lay-active"); modules().forEach(clearPos); c.style.minHeight = ""; clearSelection(); }
    modules().forEach(applyCollapse);
    renderStacks();
    c.classList.toggle("lay-free", state.free);
    if (!state.free) clearSelection();
    updateGrid(); updateSelbox();
  }

  /* ---- snapping ---- */
  function snapGridOnly(x, y) { if (state.snapGrid) { const g = state.grid; x = Math.round(x / g) * g; y = Math.round(y / g) * g; } return { x: Math.max(0, x), y: Math.max(0, y) }; }
  function snapMove(m, x, y) {
    const w = m.offsetWidth, h = m.offsetHeight;
    if (state.snapGrid) { const g = state.grid; x = Math.round(x / g) * g; y = Math.round(y / g) * g; }
    if (state.snapEdge) {
      const T = 7;
      const mates = new Set(stackMates(m));
      modules().forEach(o => {
        if (o === m || mates.has(o) || isHiddenMember(o)) return; const p = state.map[key(o)]; if (!p) return;
        const ow = o.offsetWidth, oh = o.offsetHeight;
        if (Math.abs(x - p.x) < T) x = p.x;
        if (Math.abs(x - (p.x + ow)) < T) x = p.x + ow;
        if (Math.abs((x + w) - (p.x + ow)) < T) x = p.x + ow - w;
        if (Math.abs((x + w) - p.x) < T) x = p.x - w;
        if (Math.abs(y - p.y) < T) y = p.y;
        if (Math.abs(y - (p.y + oh)) < T) y = p.y + oh;
        if (Math.abs((y + h) - (p.y + oh)) < T) y = p.y + oh - h;
        if (Math.abs((y + h) - p.y) < T) y = p.y - h;
      });
    }
    return { x: Math.max(0, x), y: Math.max(0, y) };
  }
  function snapResizeEdges(m, dir, left, top, right, bottom) {
    if (state.snapGrid) {
      const g = state.grid;
      if (dir.includes("e")) right = Math.round(right / g) * g;
      if (dir.includes("w")) left = Math.round(left / g) * g;
      if (dir.includes("s")) bottom = Math.round(bottom / g) * g;
      if (dir.includes("n")) top = Math.round(top / g) * g;
    }
    if (state.snapEdge) {
      const T = 7;
      const mates = new Set(stackMates(m));
      modules().forEach(o => {
        if (o === m || mates.has(o) || isHiddenMember(o)) return; const p = state.map[key(o)]; if (!p) return;
        const ow = o.offsetWidth, oh = o.offsetHeight, ex = [p.x, p.x + ow], ey = [p.y, p.y + oh];
        if (dir.includes("e")) ex.forEach(v => { if (Math.abs(right - v) < T) right = v; });
        if (dir.includes("w")) ex.forEach(v => { if (Math.abs(left - v) < T) left = v; });
        if (dir.includes("s")) ey.forEach(v => { if (Math.abs(bottom - v) < T) bottom = v; });
        if (dir.includes("n")) ey.forEach(v => { if (Math.abs(top - v) < T) top = v; });
      });
    }
    return { left, top, right, bottom };
  }

  /* ---- edge auto-scroll ---- */
  function edgeScrollSpeed(cx, cy) {
    const EDGE = 70, MAX = 24; let x = 0, y = 0;
    if (cy < EDGE) y = -Math.ceil((EDGE - cy) / EDGE * MAX);
    else if (cy > innerHeight - EDGE) y = Math.ceil((cy - (innerHeight - EDGE)) / EDGE * MAX);
    if (cx < EDGE) x = -Math.ceil((EDGE - cx) / EDGE * MAX);
    else if (cx > innerWidth - EDGE) x = Math.ceil((cx - (innerWidth - EDGE)) / EDGE * MAX);
    return { x, y };
  }

  /* ---- drag (single or group) with scroll-follow + auto-scroll ---- */
  function startDrag(primary, e) {
    e.preventDefault();
    bumpZ(primary);
    const grp = (selected.has(key(primary)) && selected.size > 1) ? selectedModules() : [primary];
    const isGroup = grp.length > 1;
    grp.forEach(m => m.classList.add("lay-dragging"));
    const origins = new Map(grp.map(m => [m, { ...state.map[key(m)] }]));
    const startPX = e.clientX + sX(), startPY = e.clientY + sY();
    let lastCX = e.clientX, lastCY = e.clientY;
    document.body.style.userSelect = "none";
    function update() {
      const dx = (lastCX + sX()) - startPX, dy = (lastCY + sY()) - startPY;
      const po = origins.get(primary);
      const s = isGroup ? snapGridOnly(po.x + dx, po.y + dy) : snapMove(primary, po.x + dx, po.y + dy);
      const adx = s.x - po.x, ady = s.y - po.y;
      grp.forEach(m => { const o = origins.get(m), p = state.map[key(m)]; p.x = Math.max(0, o.x + adx); p.y = Math.max(0, o.y + ady); m.style.left = p.x + "px"; m.style.top = p.y + "px"; });
      if (isGroup) updateSelbox();
      else {
        const t = mergeTargetAt(primary, lastCX, lastCY);
        if (t !== target) { if (target) target.classList.remove("lay-merge-target"); target = t; if (target) target.classList.add("lay-merge-target"); }
      }
    }
    let target = null;
    function mv(ev) { lastCX = ev.clientX; lastCY = ev.clientY; update(); }
    function onScroll() { update(); }
    let raf = requestAnimationFrame(function tick() { const sp = edgeScrollSpeed(lastCX, lastCY); if (sp.x || sp.y) { scrollBy(sp.x, sp.y); update(); } raf = requestAnimationFrame(tick); });
    function up() {
      cancelAnimationFrame(raf);
      document.removeEventListener("pointermove", mv); document.removeEventListener("pointerup", up); removeEventListener("scroll", onScroll);
      document.body.style.userSelect = ""; grp.forEach(m => m.classList.remove("lay-dragging"));
      if (target) { target.classList.remove("lay-merge-target"); mergeInto(primary, target); return; }
      grp.forEach(syncStack); sizeContainer(); save();
    }
    document.addEventListener("pointermove", mv); document.addEventListener("pointerup", up); addEventListener("scroll", onScroll, { passive: true });
  }

  /* ---- single-module resize (8 handles) ---- */
  function startResize(m, e, dir) {
    e.preventDefault(); e.stopPropagation();
    const p = state.map[key(m)]; if (!p) return;
    bumpZ(m);
    const sx = e.clientX, sy = e.clientY, ox = p.x, oy = p.y, ow = p.w || m.offsetWidth, oh = p.h || m.offsetHeight;
    const MINW = 140, MINH = 48;
    document.body.style.userSelect = "none";
    function mv(ev) {
      const dx = ev.clientX - sx, dy = ev.clientY - sy;
      let left = ox, top = oy, right = ox + ow, bottom = oy + oh;
      if (dir.includes("e")) right = ox + ow + dx;
      if (dir.includes("w")) left = ox + dx;
      if (dir.includes("s")) bottom = oy + oh + dy;
      if (dir.includes("n")) top = oy + dy;
      ({ left, top, right, bottom } = snapResizeEdges(m, dir, left, top, right, bottom));
      if (right - left < MINW) { if (dir.includes("w")) left = right - MINW; else right = left + MINW; }
      if (bottom - top < MINH) { if (dir.includes("n")) top = bottom - MINH; else bottom = top + MINH; }
      left = Math.max(0, left); top = Math.max(0, top);
      p.x = left; p.y = top; p.w = right - left;
      /* Folded and open are two different heights, remembered separately. Writing one number for
         both meant either a folded module snapped back to a title bar the moment you let go, or
         unfolding it restored the height you had dragged it to WHILE folded and clipped its
         content. `hc` is how tall it is folded; `h` is how tall it is open. */
      if (m.classList.contains("lay-collapsed")) p.hc = bottom - top; else p.h = bottom - top;
      m.style.left = p.x + "px"; m.style.top = p.y + "px"; m.style.width = p.w + "px"; m.style.height = (bottom - top) + "px";
    }
    function up() { document.removeEventListener("pointermove", mv); document.removeEventListener("pointerup", up); document.body.style.userSelect = ""; syncStack(m); sizeContainer(); save(); }
    document.addEventListener("pointermove", mv); document.addEventListener("pointerup", up);
  }

  /* ---- group selection box + proportional group resize ---- */
  function selectionRect() {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    selectedModules().forEach(m => { const p = state.map[key(m)]; const w = p.w || m.offsetWidth, h = p.h || m.offsetHeight; minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x + w); maxY = Math.max(maxY, p.y + h); });
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }
  function updateSelbox() {
    let box = byId("lay-selbox");
    if (!state.free || selected.size < 2) { if (box) box.remove(); return; }
    if (!box) { box = document.createElement("div"); box.id = "lay-selbox"; DIRS.forEach(d => { const h = document.createElement("div"); h.className = "lay-sh " + d; h.dataset.dir = d; box.appendChild(h); }); container().appendChild(box); }
    const r = selectionRect(); box.style.left = r.x + "px"; box.style.top = r.y + "px"; box.style.width = r.w + "px"; box.style.height = r.h + "px";
  }
  function startGroupResize(dir, e) {
    e.preventDefault(); e.stopPropagation();
    const mods = selectedModules(); const box0 = selectionRect();
    const origins = new Map(mods.map(m => [m, { x: state.map[key(m)].x, y: state.map[key(m)].y, w: state.map[key(m)].w || m.offsetWidth, h: state.map[key(m)].h || m.offsetHeight }]));
    const sx = e.clientX, sy = e.clientY;
    document.body.style.userSelect = "none";
    function mv(ev) {
      const dx = ev.clientX - sx, dy = ev.clientY - sy;
      let left = box0.x, top = box0.y, right = box0.x + box0.w, bottom = box0.y + box0.h;
      if (dir.includes("e")) right = box0.x + box0.w + dx;
      if (dir.includes("w")) left = box0.x + dx;
      if (dir.includes("s")) bottom = box0.y + box0.h + dy;
      if (dir.includes("n")) top = box0.y + dy;
      left = Math.max(0, left); top = Math.max(0, top);
      const nW = Math.max(60, right - left), nH = Math.max(40, bottom - top);
      const scX = nW / box0.w, scY = nH / box0.h;
      mods.forEach(m => {
        const o = origins.get(m), p = state.map[key(m)];
        p.x = Math.round(left + (o.x - box0.x) * scX); p.y = Math.round(top + (o.y - box0.y) * scY);
        p.w = Math.max(60, Math.round(o.w * scX)); p.h = Math.max(40, Math.round(o.h * scY));
        m.style.left = p.x + "px"; m.style.top = p.y + "px"; m.style.width = p.w + "px"; m.style.height = p.h + "px";
      });
      updateSelbox();
    }
    function up() { document.removeEventListener("pointermove", mv); document.removeEventListener("pointerup", up); document.body.style.userSelect = ""; mods.forEach(syncStack); sizeContainer(); save(); }
    document.addEventListener("pointermove", mv); document.addEventListener("pointerup", up);
  }

  /* ---- marquee ---- */
  function startMarquee(e, cont) {
    clearSelection();
    const band = document.createElement("div"); band.id = "lay-marquee"; cont.appendChild(band);
    const ox = e.clientX, oy = e.clientY;
    function bounds(ev) { return { x1: Math.min(ox, ev.clientX), y1: Math.min(oy, ev.clientY), x2: Math.max(ox, ev.clientX), y2: Math.max(oy, ev.clientY) }; }
    function mv(ev) { const b = bounds(ev), cr = cont.getBoundingClientRect(); band.style.left = (b.x1 - cr.left) + "px"; band.style.top = (b.y1 - cr.top) + "px"; band.style.width = (b.x2 - b.x1) + "px"; band.style.height = (b.y2 - b.y1) + "px"; }
    function up(ev) {
      const b = bounds(ev); document.removeEventListener("pointermove", mv); document.removeEventListener("pointerup", up); band.remove();
      modules().forEach(m => { if (isHiddenMember(m)) return; const r = m.getBoundingClientRect(); if (r.right > b.x1 && r.left < b.x2 && r.bottom > b.y1 && r.top < b.y2) selectAdd(m); });
      updateSelectionUI();
    }
    document.addEventListener("pointermove", mv); document.addEventListener("pointerup", up);
  }

  /* ---- pointer routing ---- */
  document.addEventListener("pointerdown", e => {
    if (window.matchMedia("(max-width: 700px)").matches) return;
    if (!state.free || e.button !== 0) return;
    const sh = e.target.closest("#lay-selbox .lay-sh"); if (sh) { startGroupResize(sh.dataset.dir, e); return; }
    const rh = e.target.closest(".lay-h"); if (rh) { const m = rh.closest(".module"); if (m) startResize(m, e, rh.dataset.dir); return; }
    const tab = e.target.closest(".lay-tab"); if (tab) { startTabDrag(tab, e, true); return; }
    const m = e.target.closest(".module");
    if (m && m.parentElement && m.parentElement.classList.contains("modules")) {
      if (e.shiftKey) { toggleSelect(m); return; }
      if (!selected.has(key(m))) clearSelection();
      startDrag(m, e); return;
    }
    const cont = e.target.closest(".modules"); if (cont) startMarquee(e, cont);
  });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && state.free) clearSelection(); });
  /* A module tab is a switch (click), a handle for reordering (drag along the bar, marked the same
     way as the character tabs: a line before or after the nearest tab, the dragged one excluded),
     and in Free mode a way out of the stack (pull it well clear of the bar and its module leaves at
     the pointer and carries on as an ordinary drag, so it can be dropped anywhere or merged). */
  function tabReorderTarget(bar, ignoreKey, x) {
    const tabs = [...bar.querySelectorAll(".lay-tab")].filter(t => t.dataset.tab !== ignoreKey);
    let best = null, bestDist = Infinity;
    tabs.forEach(t => {
      const r = t.getBoundingClientRect();
      const d = x < r.left ? r.left - x : x > r.right ? x - r.right : 0;
      if (d < bestDist) { bestDist = d; best = { el: t, r }; }
    });
    return best ? { key: best.el.dataset.tab, el: best.el, after: x >= best.r.left + best.r.width / 2 } : null;
  }
  function clearTabMarks() {
    document.querySelectorAll(".lay-tab").forEach(t => t.classList.remove("drop-before", "drop-after", "dragging"));
  }
  function startTabDrag(tab, e, allowDetach) {
    e.preventDefault(); e.stopPropagation();
    const k = tab.dataset.tab, sx = e.clientX, sy = e.clientY, bar = tab.closest(".lay-tabs");
    let moved = false, target = null;
    const nearBar = ev => { const r = bar.getBoundingClientRect(); return ev.clientY >= r.top - 14 && ev.clientY <= r.bottom + 14 && ev.clientX >= r.left - 30 && ev.clientX <= r.right + 30; };
    function mv(ev) {
      if (!moved && Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) < 6) return;
      moved = true;
      clearTabMarks(); tab.classList.add("dragging");
      if (nearBar(ev) || !allowDetach) {
        target = tabReorderTarget(bar, k, ev.clientX);
        if (target) target.el.classList.add(target.after ? "drop-after" : "drop-before");
        return;
      }
      // Pulled clear of the bar in Free mode: the module leaves the stack at the pointer.
      done(); clearTabMarks();
      const m = moduleByKey(k); if (!m) return;
      const crect = container().getBoundingClientRect(), p = state.map[k];
      detach(m);
      p.x = Math.max(0, Math.round(ev.clientX - crect.left - 30)); p.y = Math.max(0, Math.round(ev.clientY - crect.top - 12));
      applyPos(m);
      startDrag(m, ev);
    }
    function up() {
      done(); clearTabMarks();
      if (!moved) { switchTab(k); return; }
      const id = stackIdOf(k); if (!id || !target) return;
      const members = state.stacks[id].members.filter(x => x !== k);
      const at = members.indexOf(target.key); if (at < 0) return;
      members.splice(target.after ? at + 1 : at, 0, k);
      state.stacks[id].members = members;
      renderStacks(); save();
    }
    function done() { document.removeEventListener("pointermove", mv); document.removeEventListener("pointerup", up); }
    document.addEventListener("pointermove", mv); document.addEventListener("pointerup", up);
  }
  // Outside Free mode the tabs still reorder (and switch); only pulling a module out needs Free mode.
  document.addEventListener("pointerdown", e => {
    if (window.matchMedia("(max-width: 700px)").matches) return;
    if (state.free || e.button !== 0) return;
    const tab = e.target.closest(".lay-tab"); if (tab) startTabDrag(tab, e, false);
  });
  /* Plain click delegation, not routed through the pointerdown handler above: that one only acts
     while state.free (dragging/resizing), and CSS already sets pointer-events:none on every button
     inside a module while Free is on - including this one - so there's nothing to guard against
     the two handlers fighting over the same click. */
  document.addEventListener("click", e => {
    if (e.target.closest(".lay-tab")) return;   // handled on pointerup by startTabDrag
    const btn = e.target.closest(".lay-collapse-btn"); if (!btn) return;
    const m = btn.closest(".module"); if (m) toggleCollapse(m);
  });

  /* ---- save / load layout file ---- */
  function exportLayout() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "wkolon-layout.json"; a.click();
  }
  function importLayout(file) {
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const d = validatedLayout(JSON.parse(rd.result));
        Object.assign(state, { free: false, stacks: {} }, d, { free: false });
        syncControls(); apply(); save();
      } catch (err) { alert("Bad layout file: " + err); }
    };
    rd.readAsText(file);
  }

  /* ---- presets ----
     Named arrangements shipped in layouts/, listed in layouts/index.json as { "Label": "file.json" }
     (same shape as the theme manifest). A preset file is exactly what "save file" writes, so making
     one is: arrange the sheet, save the file, drop it in layouts/ and list it. The picker stays
     hidden until the list has something in it. */
  async function loadPresetList() {
    const wrap = byId("lay-preset-wrap"), sel = byId("lay-preset"); if (!wrap || !sel) return;
    try {
      const res = await fetch("layouts/index.json"); if (!res.ok) return;
      const list = Object.entries(await res.json()).filter(([, f]) => typeof f === "string" && f);
      list.forEach(([name, file]) => sel.add(new Option(name, file)));
      wrap.hidden = !list.length;
    } catch (e) { /* no presets: the picker stays hidden */ }
  }
  async function applyPreset(file, name) {
    if (!confirm(`Replace your current arrangement with the ${name} layout?`)) return;
    try {
      const res = await fetch("layouts/" + file); if (!res.ok) throw new Error(res.status);
      const d = validatedLayout(await res.json());
      Object.assign(state, { free: false, stacks: {}, collapsed: {} }, d, { free: false });
      syncControls(); apply(); save();
    } catch (err) { alert("Could not load the " + name + " layout: " + err.message); }
  }

  /* ---- control bar ---- */
  function syncControls() {
    if (byId("lay-free")) byId("lay-free").checked = state.free;
    if (byId("lay-grid")) byId("lay-grid").checked = state.snapGrid;
    if (byId("lay-edge")) byId("lay-edge").checked = state.snapEdge;
    if (byId("lay-gridsize")) byId("lay-gridsize").value = state.grid;
  }
  function updateHint() { const el = byId("lay-hint"); if (el) el.textContent = state.free ? "Editing layout" : ""; }
  function buildBar() {
    if (byId("lay-bar")) return;
    const bar = document.createElement("div"); bar.id = "lay-bar";
    bar.innerHTML = `<b>Layout:</b>
      <label><input type="checkbox" id="lay-free"> Free (move/resize)</label>
      <label><input type="checkbox" id="lay-grid"> snap to grid</label>
      <label>grid <input type="number" id="lay-gridsize" min="1" max="64" style="width:3rem"></label>
      <label><input type="checkbox" id="lay-edge"> snap to modules</label>
      <label id="lay-preset-wrap" hidden>preset <select id="lay-preset"><option value="">-</option></select></label>
      <button id="lay-reset">reset</button>
      <button id="lay-save">save file</button>
      <label>load <input type="file" id="lay-load" accept="application/json"></label>
      <span class="hint" id="lay-hint"></span>`;
    const c = container(); c.parentNode.insertBefore(bar, c);
    syncControls();
    byId("lay-free").addEventListener("change", e => { state.free = e.target.checked; apply(); save(); updateHint(); });
    byId("lay-grid").addEventListener("change", e => { state.snapGrid = e.target.checked; updateGrid(); save(); });
    byId("lay-edge").addEventListener("change", e => { state.snapEdge = e.target.checked; save(); });
    byId("lay-gridsize").addEventListener("change", e => { state.grid = Math.max(1, Math.min(64, Number(e.target.value) || 16)); e.target.value = state.grid; updateGrid(); save(); });
    byId("lay-reset").addEventListener("click", () => { if (confirm("Reset module layout back to the default flow? This also expands any collapsed modules.")) { state.map = {}; state.collapsed = {}; state.stacks = {}; state.free = false; state.activated = false; state.zTop = 0; clearSelection(); syncControls(); apply(); save(); updateHint(); } });
    byId("lay-save").addEventListener("click", exportLayout);
    byId("lay-preset").addEventListener("change", e => { const f = e.target.value, name = e.target.selectedOptions[0] ? e.target.selectedOptions[0].text : f; e.target.value = ""; if (f) applyPreset(f, name); });
    loadPresetList();
    byId("lay-load").addEventListener("change", e => { if (e.target.files[0]) importLayout(e.target.files[0]); e.target.value = ""; });
    updateHint();
  }

  function refresh() { buildBar(); wrapBodies(); addCollapseToggles(); addHandles(); apply(); }
  window.__layout = { refresh, state, apply, snapMove, modules, ensurePositions, save, selected, selectAdd, updateSelectionUI, selectionRect,
    toggleCollapse, wrapBodies, addCollapseToggles, mergeInto, detach, switchTab, stackIdOf };
})();
