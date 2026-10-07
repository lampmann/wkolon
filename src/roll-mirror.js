/* ============================================================
   ROLL MIRROR - the tail of the Event Log, pinned to the corner.

   The Event Log is a module like any other, which means it can be anywhere
   in your layout - and once you have a few modules open it is usually a
   scroll away from the button you just clicked. That's fine for reading
   history and useless for the thing you actually want, which is seeing what
   the die did a second ago without leaving the roll you're in the middle of.

   So: a small fixed panel in the bottom-right that mirrors the newest
   entries. It is a MIRROR and nothing else - no state of its own, no second
   copy of the log to keep in step. Every entry it shows was put there by
   logEvent(), and switching characters repaints it from the same stored log
   the module reads. Deleting it would lose nothing but convenience.

   Fold rolls it up to its title bar; the × hides it entirely and leaves a
   small tab to bring it back. Both are per browser rather than per
   character - it's a preference about your screen, not a fact about your
   character, so it sits in its own localStorage key next to the theme.
   ============================================================ */

const MIRROR_MAX = 40;          // entries kept in the corner; the module itself keeps everything
const MIRROR_KEY = "wkolon-rollmirror";

let MIRROR = { folded: false, hidden: false, w: 0, h: 0 };

function loadMirrorPrefs() {
  try {
    const d = JSON.parse(localStorage.getItem(MIRROR_KEY));
    if (d && typeof d === "object") MIRROR = { folded: !!d.folded, hidden: !!d.hidden,
      w: Math.max(0, Math.floor(Number(d.w)) || 0), h: Math.max(0, Math.floor(Number(d.h)) || 0) };
  } catch (e) { /* a corrupt pref is not worth a broken sheet - keep the defaults */ }
}
function saveMirrorPrefs() {
  try { localStorage.setItem(MIRROR_KEY, JSON.stringify(MIRROR)); }
  catch (e) { console.warn("Could not save the roll mirror's state", e); }
}

function mirrorEl() { return document.getElementById("roll-mirror"); }
function mirrorBody() { return document.getElementById("roll-mirror-body"); }

/* Paints the frame (folded/hidden state, buttons). The entries themselves are added one at a time
   by mirrorLogEntry so a roll doesn't cost a full rebuild - see repaintRollMirror for the
   character-switch case, which does rebuild because the whole log has changed underneath it. */
function renderRollMirror() {
  const el = mirrorEl(); if (!el) return;
  el.classList.toggle("mirror-folded", MIRROR.folded);
  el.style.display = MIRROR.hidden ? "none" : "";
  const tab = document.getElementById("roll-mirror-tab");
  if (tab) tab.style.display = MIRROR.hidden ? "" : "none";
  /* A size the user dragged to, if any. Applied as width on the panel and height on the body, so
     folding still collapses to the title bar rather than leaving a tall empty box. */
  if (MIRROR.w) el.style.width = MIRROR.w + "px";
  const bodyEl = mirrorBody();
  if (bodyEl && MIRROR.h) bodyEl.style.maxHeight = MIRROR.h + "px";
  const fold = document.getElementById("roll-mirror-fold");
  if (fold) {
    fold.textContent = MIRROR.folded ? "▲" : "▼";
    fold.setAttribute("aria-label", MIRROR.folded ? "Expand roll log" : "Collapse roll log");
  }
}

function toggleMirrorFold() { MIRROR.folded = !MIRROR.folded; saveMirrorPrefs(); renderRollMirror(); }
function hideRollMirror() { MIRROR.hidden = true; saveMirrorPrefs(); renderRollMirror(); }
function showRollMirror() { MIRROR.hidden = false; saveMirrorPrefs(); renderRollMirror(); }

/* One new entry, newest at the bottom next to the command line (like a chat), oldest trimmed off the top. Called from logEvent, so
   anything that reaches the Event Log reaches here - rolls, rests, HP changes, resource spends. */
function mirrorLogEntry(kind, html) {
  const body = mirrorBody(); if (!body) return;
  const d = document.createElement("div");
  d.className = "ev ev-" + kind;
  d.innerHTML = html;
  body.appendChild(d);
  while (body.children.length > MIRROR_MAX) body.removeChild(body.firstChild);
  body.scrollTop = body.scrollHeight;
  /* A ROLL arriving while the panel is hidden shouldn't silently vanish - that's exactly the moment
     it's wanted. Restricted to kind "roll": every OTHER kind (info, rest, hp, resource, condition)
     used to reopen the panel too, so loading a house-rule preset, taking a rest, or ticking a
     condition could pop a hidden window back open with no visible cause - from the outside, "some
     unrelated click reopened this window" with no explanation. Not narrowed further to "roll entries
     that actually show a die": the creator's own ability-score/gold/hit-die rolls log as kind "roll"
     with hand-built HTML that carries no <span class="die">, and are exactly the rolls you'd want the
     panel to surface. Folded is left alone either way - that's a deliberate "I know it's there". */
  if (MIRROR.hidden && kind === "roll") showRollMirror();
}

/* Rebuild from the active character's stored log - switching characters replaces the whole history,
   so appending is meaningless and the panel has to start again from what that character has. */
function repaintRollMirror() {
  const body = mirrorBody(); if (!body) return;
  const entries = typeof window.getRollEntries === "function" ? window.getRollEntries() : [];
  // The stored log is newest-first; the panel reads top to bottom, oldest to newest.
  body.innerHTML = entries.slice(0, MIRROR_MAX).reverse()
    .map(e => `<div class="ev ev-${e.kind}">${window.renderRollEntry(e)}</div>`).join("");
  body.scrollTop = body.scrollHeight;
}

/* Resizing from the TOP-LEFT, because the panel is pinned to the bottom-right: CSS `resize` only
   ever offers a bottom-right grabber, which on this panel would drag its own corner off-screen.
   Dragging up and left therefore makes it bigger, which is what the corner it's anchored to implies. */
function wireMirrorResize() {
  const grip = document.getElementById("roll-mirror-grip"); if (!grip) return;
  const el = mirrorEl(), body = mirrorBody();
  const MIN_W = 14, MIN_H = 4;   // rem - below this it stops being readable
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  let start = null;

  const onMove = e => {
    if (!start) return;
    const dx = start.x - e.clientX, dy = start.y - e.clientY;   // up/left is bigger
    MIRROR.w = Math.round(Math.max(MIN_W * rem, Math.min(window.innerWidth - 20, start.w + dx)));
    MIRROR.h = Math.round(Math.max(MIN_H * rem, Math.min(window.innerHeight - 80, start.h + dy)));
    el.style.width = MIRROR.w + "px";
    if (body) body.style.maxHeight = MIRROR.h + "px";
    e.preventDefault();
  };
  const onUp = () => {
    if (!start) return;
    start = null;
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);
    saveMirrorPrefs();
  };
  grip.addEventListener("mousedown", e => {
    start = { x: e.clientX, y: e.clientY, w: el.getBoundingClientRect().width,
              h: body ? body.getBoundingClientRect().height : 0 };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    e.preventDefault();
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const el = mirrorEl(); if (!el) return;
  loadMirrorPrefs();
  repaintRollMirror();
  renderRollMirror();
  wireMirrorResize();

  /* The same command line the Event Log module has, on the panel that is now the one you keep open.
     It calls the same runCommand, so there is one parser and one set of commands, not two. */
  const cmd = document.getElementById("roll-mirror-cmd");
  if (cmd) cmd.addEventListener("keydown", e => {
    if (e.key !== "Enter") return;
    if (typeof runCommand === "function") runCommand(e.target.value);
    e.target.value = "";
  });

  el.addEventListener("click", e => {
    if (e.target.id === "roll-mirror-fold") { toggleMirrorFold(); return; }
    if (e.target.id === "roll-mirror-close") { hideRollMirror(); return; }
  });
  const tab = document.getElementById("roll-mirror-tab");
  if (tab) tab.addEventListener("click", showRollMirror);
});
