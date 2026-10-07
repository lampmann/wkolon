# pmcrwf UI reuse

Source: [lampmann/pmcrwf at 10150598750d32ab6f7831fe0389b42dfcf24b7d](https://github.com/lampmann/pmcrwf/tree/10150598750d32ab6f7831fe0389b42dfcf24b7d).
Copied at the repository owner's request to make the two projects sister sites.

## Copied assets

- `css/base.css`, `css/layout.css`, `css/print.css`: original stylesheets.
- `css/themes/`: complete, unchanged theme catalog and manifest.
- `src/layout.js`: original layout editor, including dragging, resizing,
  snapping, multi-selection, stacking, folding and layout import/export.
- `src/theme.js`: original theme loader and shared preference.
- `src/roll-mirror.js`: original corner roll panel, folding, hiding and resizing.
- `src/math-fields.js`: original arithmetic and relative adjustment routines.
- `src/dice.js`: original dice evaluator with a strict expression entry point.
- `src/offline.js` and `sw.js`: hosted offline registration and complete-build
  cache/update pattern.

## Adaptations

The sheet uses the same toolbar, character tabs, modular layout, compact tables,
stat blocks, HP bar and fixed-size, scrollable creator dialog. `style.css` supplies
Saga-specific controls and responsive/print adjustments. Condition Track follows pmcrwf's Exhaustion row selection: clicking a row sets
that step; clicking the current step moves back one. Passed steps are tinted,
and the current row is bold. Keyboard buttons provide the same interaction.
Saga applies the selected penalty, half speed at step four and incapacitation
at step five. Normal State resets the track directly; its selected row remains
normal when clicked again. Terminal text uses species `isDroid` metadata to show
Unconscious or Disabled. The module keeps its original storage/layout ID (`condition`).

Saga creation retains
its existing ordered level ledger and prerequisite checks. Advancement uses the
same dialog frame as creation.

Layout initializes after rules and characters load, and refreshes after sheet
changes. Keys and layout download names are namespaced for Wkolon. Narrow screens
use normal flow while preserving the saved desktop arrangement. Printing expands
collapsed/stacked modules and retains numerical roll values.

Themes deliberately share pmcrwf's `charsheet-theme` browser preference. The
original Wkolon light/dark preference migrates only if a shared theme is absent.
Wkolon character data stays under `wkolon-roster-v1`. Optional roster `logs` map
character IDs to validated, bounded `{kind, text}` arrays; characters from the
original site and exports without logs remain valid. Rendering escapes all log
text. Mirror preferences use `wkolon-rollmirror`; module layouts use
`wkolon-layout`.

Dice commands support dice, integers, arithmetic, parentheses and keep-highest/
lowest (`4d6kh3`). A complete-input validator rejects malformed or excessive
expressions before invoking the copied evaluator. Saga d20 buttons use the
existing Saga roll logic; D&D advantage and rule effects are not imported.

The hosted cache includes the reviewed Saga pack and ES module dependencies,
all themes and layout presets. CI stamps the worker with the commit ID. Requests
and cache deletion are restricted to Wkolon's scope/namespace so pmcrwf's cache
is unaffected. Browser checks exercise a `/wkolon/` deployment and offline reload.

No pmcrwf character data, D&D rules, data-folder workflow or game calculations
are copied. The user-supplied square cat tab icon is retained.


Ability generation ports pmcrwf's method buttons, score pool, unique-index
assignment, point-cost selectors and manual input event handling. Saga's 25-point
budget, 8–18 costs and species adjustments come from the reviewed pack. Number
inputs update derived readouts during typing and never rebuild on blur. Existing
characters retain their scores; rolled pools and assignments survive reload/export.

Feat menus show each primary name once, with a second selector for skill, weapon
group or proficiency subtype. Eligibility is still evaluated before each grant.
Incomplete secondary choices grant no benefits. Concrete saved IDs are preserved.
Rules disclosures read bundled fields, prerequisites and existing reminders;
main-sheet and builder controls no longer open the wiki. The Rules view keeps
revision and contributor attribution. Local references are cached for offline use.

Builder skills run vertically. Knowledge is one primary entry with secondary
field selectors; multiple fields retain their existing individual skill IDs in
saves and exports. The same controls handle training gained on advancement.
