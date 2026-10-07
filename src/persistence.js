import {validateCharacter, newCharacter} from './rules.js';
export const STORAGE_KEY = 'wkolon-roster-v1';

export function validateRoster(roster, pack) {
  if (!roster || roster.schemaVersion !== 1 || !Array.isArray(roster.characters) || !roster.characters.length || roster.characters.length > 100 || typeof roster.activeId !== 'string') throw new Error('Invalid character roster');
  roster.characters.forEach(c => validateCharacter(c, pack));
  if (new Set(roster.characters.map(c => c.id)).size !== roster.characters.length || !roster.characters.some(c => c.id === roster.activeId)) throw new Error('Invalid roster character IDs');
  if (roster.logs !== undefined) {
    const kinds = ['roll','rest','hp','resource','condition','info'];
    if (!roster.logs || typeof roster.logs !== 'object' || Array.isArray(roster.logs) || Object.entries(roster.logs).some(([id,entries]) => !roster.characters.some(c=>c.id===id) || !Array.isArray(entries) || entries.length>200 || entries.some(e=>!e || !kinds.includes(e.kind) || typeof e.text!=='string' || e.text.length>2000))) throw new Error('Invalid event log');
  }
  return roster;
}

export function createStore(pack, onStatus, storage = localStorage) {
  let roster, timer = null, protectedSave = false, recovery = null;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw) {
      recovery = raw;
      roster = validateRoster(JSON.parse(raw), pack);
      recovery = null;
    }
  } catch (e) {
    protectedSave = true;
    onStatus('Stored data needs recovery. Export the recovery file before replacing it.', true);
  }
  if (!roster) {
    const c = newCharacter(pack);
    roster = {schemaVersion: 1, activeId: c.id, characters: [c]};
  }
  const current = () => roster.characters.find(c => c.id === roster.activeId);
  const flush = () => {
    clearTimeout(timer); timer = null;
    if (protectedSave) { onStatus('Storage protected. Export a recovery file, then restore a valid character.', true); return false; }
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(roster));
      onStatus('Saved in this browser', false); return true;
    } catch (e) { onStatus('Save failed. Export your character to keep it.', true); return false; }
  };
  const schedule = () => { clearTimeout(timer); timer = setTimeout(flush, 300); onStatus('Saving…', false); };
  const pending = () => { if (timer !== null) flush(); };
  window.addEventListener('pagehide', pending);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') pending(); });
  return {
    get roster() { return roster; }, get recovery() { return recovery; }, current, schedule, flush,
    switch(id) { pending(); roster.activeId = id; flush(); },
    add() { pending(); const c = newCharacter(pack); roster.characters.push(c); roster.activeId = c.id; flush(); return c; },
    duplicate() { const c = structuredClone(current()); c.id = crypto.randomUUID(); c.name = `${c.name || 'Unnamed'} copy`; roster.characters.push(c); roster.activeId = c.id; flush(); },
    remove() { const id = roster.activeId; if(roster.logs) delete roster.logs[id]; roster.characters = roster.characters.filter(c => c.id !== id); if (!roster.characters.length) roster.characters.push(newCharacter(pack)); roster.activeId = roster.characters[0].id; flush(); },
    import(text) {
      // Validate completely before any mutation. Import gets a new local ID.
      const c = structuredClone(validateCharacter(JSON.parse(text), pack));
      c.id = crypto.randomUUID();
      roster.characters.push(c); roster.activeId = c.id;
      // Recovery must be explicitly exported first; importing doesn't bypass protection.
      flush(); return c;
    },
    unlockAfterRecovery() { protectedSave = false; recovery = null; flush(); },
  };
}

export function downloadJSON(value, filename) {
  const url = URL.createObjectURL(new Blob([typeof value === 'string' ? value : JSON.stringify(value, null, 2)], {type: 'application/json'}));
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
