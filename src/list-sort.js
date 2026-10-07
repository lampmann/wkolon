// Adapted from pmcrwf/src/text-utils.js.
import {escapeHTML} from './wiki-content.js';
// Sorting changes the display only; callers retain the original record indexes.
export function createListSort(columns) {
  const state = { key: "name", descending: false };
  const value = (row, key) => { const c = columns.find(c => c.key === key); return c.get ? c.get(row) : row[key]; };
  return {
    rows(rows) { return [...rows].sort((a, b) => this.compare(a, b)); },
    compare(a, b) {
        const av = value(a, state.key), bv = value(b, state.key);
        const missing = v => v == null || v === "" || (typeof v === "number" && !Number.isFinite(v));
        if (missing(av) !== missing(bv)) return missing(av) ? 1 : -1;
        const c = columns.find(c => c.key === state.key);
        const cmp = missing(av) ? 0 : c.compare ? c.compare(av, bv) : c.numeric ? Number(av) - Number(bv) : String(av).localeCompare(String(bv), undefined, { sensitivity: "base", numeric: true });
        return (state.descending ? -cmp : cmp) || String(value(a, "name") || "").localeCompare(String(value(b, "name") || ""));
    },
    header(key, label, cell = true) {
      if (!key) return `<th scope="col">${escapeHTML(label)}</th>`;
      const active = state.key === key;
      const button = `<button type="button" class="list-sort" data-sort="${key}" aria-label="Sort by ${escapeHTML(label)}"${columns.find(c => c.key === key).hint ? ` title="${escapeHTML(columns.find(c => c.key === key).hint)}"` : ""}>${escapeHTML(label)}${active ? state.descending ? " ▲" : " ▼" : ""}</button>`;
      return cell ? `<th scope="col" aria-sort="${active ? state.descending ? "descending" : "ascending" : "none"}">${button}</th>` : button;
    },
    headers(cell = true) { return columns.map(c => this.header(c.key, c.label, cell)).join(cell ? "" : " "); },
    click(e, render) {
      const button = e.target.closest(".list-sort"); if (!button) return false;
      const c = columns.find(c => c.key === button.dataset.sort); if (!c) return false;
      state.descending = state.key === c.key ? !state.descending : !!c.numeric;
      state.key = c.key; render(); return true;
    },
  };
}
