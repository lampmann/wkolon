/* ============================================================
   OFFLINE - registers the service worker, and only where it helps.

   NOT ON LOCALHOST. The obvious thing is to register everywhere, and it is
   wrong. sw.js serves cache-first (see its header, and the reason it has to),
   so on the machine where somebody is editing these files it would answer
   every request with yesterday's copy and quietly ignore their edits - the
   worst possible bug to hand a person who is mid-change and now cannot trust
   what they're looking at. A local player runs wkolon.cmd, which is a server
   sitting on the files; they already have the app offline in the only sense
   that matters. Hosting is the case that needs a cache, so hosting is the
   case that gets one.

   The update line is the other half of sw.js's all-or-nothing rule. A new
   build finishes installing while this page is still running the old one, and
   swapping under it would mix two versions of forty interdependent scripts.
   So the new build waits, this says so, and the swap happens on the click.
   ============================================================ */

function offlineEligible() {
  if (!("serviceWorker" in navigator)) return false;
  const h = location.hostname;
  if (h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h === "") return false;
  return location.protocol === "https:";   // service workers need a secure origin anyway
}

/* A quiet line in the corner. Built here rather than in the HTML because it is about the delivery of
   the page, not about anything on it - the sheet should not carry markup for its own hosting. */
function showUpdateNote(onTake) {
  if (document.getElementById("update-note")) return;
  const d = document.createElement("div");
  d.id = "update-note";
  d.innerHTML = `A new version of wkolon is ready. <button type="button" id="update-note-take">Reload</button>
    <button type="button" id="update-note-later" aria-label="it will apply next time you open the sheet">later</button>`;
  document.body.appendChild(d);
  d.addEventListener("click", e => {
    if (e.target.id === "update-note-take") { d.remove(); onTake(); }
    else if (e.target.id === "update-note-later") d.remove();
  });
}

function registerOffline() {
  if (!offlineEligible()) return;
  navigator.serviceWorker.register("sw.js").then(reg => {
    /* Already waiting when we arrived: installed during an earlier visit that never took it. */
    if (reg.waiting) showUpdateNote(() => takeUpdate(reg));
    reg.addEventListener("updatefound", () => {
      const sw = reg.installing; if (!sw) return;
      sw.addEventListener("statechange", () => {
        // "installed" with a controller already present means this is an UPDATE, not a first install.
        // On a first visit there is nothing to interrupt and nothing to announce.
        if (sw.state === "installed" && navigator.serviceWorker.controller) showUpdateNote(() => takeUpdate(reg));
      });
    });
  }).catch(err => console.warn("Offline support unavailable:", err));

  /* The new worker took over; the page is now running against a cache it did not load from, so it
     has to be reloaded exactly once. The guard is for the pathological case where a worker activates
     repeatedly - an endless reload loop is a far worse failure than no offline support. */
  let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloaded) return;
    reloaded = true;
    location.reload();
  });
}

function takeUpdate(reg) {
  if (reg.waiting) reg.waiting.postMessage({ type: "skip-waiting" });
}

document.addEventListener("DOMContentLoaded", registerOffline);
