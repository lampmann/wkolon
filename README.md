# Wkolon

A browser character sheet and builder for **Star Wars Saga Edition**.
The primary deployment is https://lampmann.github.io/wkolon/.

Create a character, assign abilities, choose species and a starting class, train
skills, select feats and talents, buy and equip gear, and advance through levels.
The sheet calculates ability modifiers, defenses, damage threshold, HP, skills,
BAB and weapon attacks. Every defense, skill and attack shows its calculation.
Build validation identifies missing choices and rejects choices whose
prerequisites were not met at the level when they were taken.

Characters autosave in the browser. Multiple character tabs, duplication, JSON
import/export, light/dark themes and a printable sheet are included. Export a
character to move it between browsers or retain a backup. GitHub Pages requires
no application server, account, runtime scraping or external database.

The initial catalog includes eight species, the five heroic classes, 25 skills,
18 feats, 15 talents and 10 equipment records. It is a starter catalog, not a
complete implementation of every sourcebook. Prestige classes, droid creation,
Force power selection, vehicles and additional catalogs are future work.
Conditional feats/talents appear as reminders; numeric sheet and attack
modifiers handle table rulings and circumstances.

## Rules data

The [rules-data contract](docs/rules-data.md) was defined before calculations.
The reviewed [core pack](data/core.json) contains stable IDs, explicit mechanics,
structured prerequisites and source revision/history links. Character exports
pin the pack version and store an ordered level ledger instead of derived totals.

Use the wiki's MediaWiki API, not browser HTML scraping:

```sh
python3 tools/wiki-extract.py --titles 'Abilities' 'Heroic Classes' 'Level Benefits'
python3 tools/wiki-extract.py --category Species --output .build/species-snapshot.json
python3 tools/wiki-extract.py --xml export.xml --output .build/export-snapshot.json
```

The importer handles category pagination/subcategories, batched revision capture,
redirect aliases (including talent-tree sections), retries and resume. Use
`--refresh` to refetch requested records. A captured snapshot is **review input**,
not an automatically executable pack. Compilation checks the reviewed revision manifest and refuses changed revisions.
New mechanical mappings need explicit
review of prerequisites, stacking, conditions, timing and errata.

To reproduce the initial pack's revision capture and reviewed mapping:

```sh
python3 tools/wiki-extract.py --titles-file tools/core-titles.txt --output .build/wiki-snapshot.json
python3 tools/compile-core.py
npm run validate
```

Raw snapshots are gitignored. Reviewed structured data is committed so the Pages
site works immediately. Wiki adaptations retain CC BY-SA 4.0 attribution;
application source is MIT licensed. See [DATA-LICENSE.md](DATA-LICENSE.md).

## Reused pmcrwf patterns

Inspected `lampmann/pmcrwf`'s `src/persistence.js`, `src/characters.js`,
`src/theme.js`, UI styles and browser checks. Wkolon adapts its debounced saves
with pagehide/visibility flushing, atomic roster storage, validated imports,
storage-failure messages, CSS variable themes and print layout. The Saga rules
engine and data model are separate from its D&D implementation. Character keys
are namespaced, because both Pages sites share an origin and browser storage.

## Development and Pages

```sh
npm ci
npm run validate
npm test
npx playwright install chromium
npm run test:browser
```

Browser checks serve the site under `/wkolon/` to test Pages-relative paths.
Desktop/mobile previews are written to `.build/` and uploaded by CI.
To preview locally, `python3 -m http.server 8931` is sufficient.

In GitHub **Settings → Pages**, choose **GitHub Actions**. The Pages workflow
stages only website files, validates the pack and calculations, and deploys on
pushes to `main` or a manual run. CI separately tests browser flows. Publishing a
new rules pack is a reviewed code change; deployment never fetches wiki rules.

The tab icon is the user-supplied cat photograph, stretched horizontally to square.
