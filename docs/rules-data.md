# Rules data contract (version 1)

This contract was written before the calculation engine. The browser consumes a
reviewed static `data/core.json` pack. It never interprets wiki prose as code.
Character files store choices and play state, not calculated totals.

## Pack

`schemaVersion`, `id`, `version`, `name`, `license`, `sources`, `rules`, and arrays
`species`, `classes`, `skills`, `feats`, `talents`, `equipment` are required.
Each record has a stable, namespaced `id`, `name`, and `sourceId`. Sources contain
wiki title, permanent revision URL, revision ID, timestamp, and history URL.
IDs do not depend on display labels. Characters pin a pack ID and version.

- **Rules:** point-buy costs and budget, standard array, feat/ability milestones,
  skill training/focus bonuses, armor penalties, size modifiers and condition penalties.
- **Species:** ability adjustments, size, speed in squares, automatic languages,
  bonus feat/skill counts, unconditional defense bonuses, conditional skill focus,
  and concise trait reminders. Optional `isDroid: boolean` defaults to `false`
  and selects the Condition Track terminal label: `Helpless (Disabled)` for a
  droid, `Helpless (Unconscious)` otherwise. This classification does not
  implement droid construction or other droid mechanics.
- **Classes:** explicit BAB table for class levels 1–20, hit die, starting HP,
  starting trained skill count, class skill IDs, defense bonuses, starting feat IDs,
  permitted bonus feat IDs, talent tree IDs, starting credit dice and multiplier.
- **Skills:** key ability, trained-only flag and armor-check flag. Each Knowledge
  specialty is its own skill.
- **Feats / talents:** prerequisite expression, repeatability (`never`, `choice`,
  `stack`), optional choice (`skill`, `weaponGroup`), `effects`, and `reminder`.
  Talent records also identify class-accessible trees. Combat conditions remain
  reminders until the engine explicitly supports them.
- **Equipment:** kind (`weapon`, `armor`, `gear`), cost in credits and kg weight.
  Weapons add group, size, mode, damage dice and damage type. Armor adds category,
  armor bonus, Fortitude equipment bonus, max Dexterity bonus and skill effects.

## Embedded references

Any record may include `reference: [{heading, text, sourceId}]`. Each entry is
plain text with a short heading and mechanics tied to a reviewed, pinned source.
These entries supplement the typed calculation fields; they never drive
calculations or contain HTML. The sheet renders bundled stats, prerequisites and
existing reminders locally in collapsed disclosures. Source links remain in
Rules. Additional verbatim references and the visual creation redesign are tracked in
`TODO.md`; no new generated prose is added to the current pack.

## Prerequisites and effects

Prerequisites use a closed JSON vocabulary: `all`, `any`, `ability` with `min`,
`feat`, `talent`, `trained`, `bab` with `min`, `classSkill`, `untrained`,
`proficientChoice`, `focusChoice`. A `$choice` target binds to the record's choice.
Evaluate against the character **before** granting that selection. Unknown
expressions are errors, never silently eligible.

Effects use `target`, `amount`, `type`, optional `perLevel`. Supported targets:
`defenses`, `hp`, `threshold`, `skillFocus`, `skillTraining`, `weaponFocus`,
`weaponSpecialization`. Unsupported effects cannot be marked automated.
Skill Focus competence bonuses use the highest value, not their sum.
Armor and class defense rules have explicit engine operations, not additive effects.
No JavaScript, HTML, eval, or expression strings are permitted in packs.

## Character and level ledger

`schemaVersion: 1`, `ruleset: {id, version}`, identity, species ID, base abilities,
ability generation method, initial trained skill IDs, purchased inventory, current
HP/Force Points/credits/condition, notes, numeric modifiers, and an ordered `levels`
array. Each level contains class ID, HP die result, feat choices, talent choice,
one multiclass starting feat when applicable, and two different ability increases
on every fourth heroic level. Selection entries are `{id, choice?, pending?}`. `pending: true` records a
chosen feat family awaiting its subtype; it grants no effect. Existing concrete
feat IDs remain unchanged. Ability-generation drafts may store
`abilityGeneration: {pool: number[], assign: {str, dex, con, int, wis, cha}}`.
Assignments are pool indexes or `null`; indexes are unique, even when rolled
values are equal. An unassigned base score is temporarily 10. Validation checks
pool/score consistency and reports missing assignments. Older files infer pool
assignments from their existing scores. Manual input saves only valid integers
without rebuilding the focused input.

Chronological validation prevents future feats/talents satisfying past
prerequisites. Replaying the ledger derives class levels, BAB, feats, talents and
ability increases. Constitution and Intelligence increases apply retroactively.
Multiclassing grants one starting feat and expands class skills, not the original
class's starting trained-skill count. Drafts may have missing choices; invalid
choices are reported and excluded from calculations.

## Extraction

1. Discover actual category membership through MediaWiki `categorymembers`, with
   continuation and recursive subcategory traversal; do not assume menu pages are categories.
2. Fetch batches of at most 50 titles through `query` + `revisions`, `rvslots=main`,
   `rvprop=ids|timestamp|sha1|content`, `redirects=1`, `maxlag=5`. Keep requested
   aliases, canonical titles, page IDs, revision IDs, timestamps and checksums.
3. Keep raw snapshots in `.build/` (ignored). XML from `Special:Export` is an
   equivalent offline intake, including templates where needed. Talent links
   frequently redirect to a section of a tree; retain that section in provenance.
4. Normalize predictable tables/templates into candidates. Review prerequisites,
   timing, stacking, conditional abilities, errata and book attribution separately.
   Missing/ambiguous fields stay on the review queue, never become inferred rules.
5. Compile only reviewed records; validate references and calculations in CI.
   A changed source revision goes back to review before updating an existing pack.

`tools/wiki-extract.py` implements resumable API/category discovery and XML intake.
`tools/compile-core.py` uses an explicit reviewed mapping of the captured records.
The compiler checks `tools/reviewed-revisions.json` and refuses changed source revisions until the mapping and manifest are reviewed.
The initial pack covers the five heroic classes, eight species, core skills and a
selected feat/talent/equipment catalog. Prestige classes, droid creation and Force
power libraries require additional reviewed records and engine/UI support.

The wiki API advertises CC BY-SA 4.0 for wiki contributions. Preserve source
attribution and revision/history links, mark adaptations, and keep data attribution
separate from application code. The initial pack contains numeric facts and short
original reminders, not wholesale rulebook prose or artwork. The wiki's license
statement alone does not establish ownership of underlying publisher material.

API documentation: https://www.mediawiki.org/wiki/API:Revisions and
https://www.mediawiki.org/wiki/API:Categorymembers.
