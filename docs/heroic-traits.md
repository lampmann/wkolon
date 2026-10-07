# Finishing a character

Sources were fetched through the MediaWiki revisions API, not inferred:
[Heroic Traits, revision 24623](https://swse.miraheze.org/w/index.php?oldid=24623),
[Destiny, revision 24869](https://swse.miraheze.org/w/index.php?oldid=24869), and
[Backgrounds, revision 16107](https://swse.miraheze.org/w/index.php?oldid=16107).
Individual Destiny and Background pages supply their reviewed mechanics.

## Data contract

Before calculating any new benefits, the pack adds optional `destinies` and
`backgrounds` arrays with the usual stable IDs, names and pinned source IDs.
Destinies carry local plain-text references. Backgrounds also carry a category
(`event`, `occupation`, `planet`), `relevantSkills`, `skillChoices` (one for events
and occupations, two for planets), `bonusLanguages`, `untrainedBonus`, optional
`conditionalFocus`, and `excludedSpecies` for a planet that is a species' homeworld.
References are plain text, never executable rules. Individual descriptions take
precedence over abbreviated index tables; Exiled grants its conditional Skill
Focus only when Knowledge (Galactic Lore) is trained.

Character files may add `heroicTraits`, an object of descriptive string fields:
age, gender, height (m), weight (kg), eyeColor, hairColor, skinColor, appearance,
personality, background, goals, era and heroType. Name and Player retain their
existing fields. Age is descriptive; it does not infer an age category or apply
aging adjustments. Era and hero type come from Heroic Traits' named sections.

`story` is a single tagged object, so Destiny and Background cannot coexist:

- `{kind: "none"}`
- `{kind: "destiny", id: string|null, details: string, points: integer}`
- `{kind: "background", id: string|null, skills: (string|null)[], language: string}`

A null ID is an unfinished choice. Background skill choices expand class skills;
they do not grant training or enlarge the trained-skill pool. Occupation bonuses
apply only to untrained checks and use the highest competence bonus. Planet
languages are automatic, except Dac requires one of its two languages. Event
situational benefits and Destiny bonus/penalty/fulfilled effects remain local
rules references for table adjudication. Destiny Points start at one and increase
on level advancement, subject to the character-level cap.

Older character files need neither new property; they receive empty traits and
Neither. Validation accepts those files without discarding notes or languages.
The finishing tab omits Notes and additional Languages; Notes stays on the sheet,
and additional Languages is editable in Character. Languages derive from INT
and Linguist, rather than the Heroic Traits checklist.
