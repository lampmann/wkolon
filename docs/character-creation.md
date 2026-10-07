# Character creation tabs

Order and tab wording were fetched from the wiki API, not inferred from memory.
Source: [Character Creation, revision 26288](https://swse.miraheze.org/w/index.php?oldid=26288),
2025-03-12T00:09:37Z. The source's revision and contributor history also appear in Rules.

`src/creation-steps.js` retains the source order with the user's requested changes:
eight numbered tabs, generation and assignment combined as “Generate & Assign Ability
Scores”, and “Determine Combat Statistics” omitted. Feats and talents retain distinct
tabs, as does the source's lowercase “your” in the last heading. Combat statistics
continue to calculate automatically on the sheet. New drafts begin with an unassigned standard pool. Existing character scores retain
their assignments; new manual/point-buy/rolled pools save separately from ability
assignments. Editing an assigned pool entry updates that ability's base score.

The visual options/talent-tree revamp remains pending the user's sketch in
[the project todo list](https://github.com/lampmann/wkolon/blob/main/TODO.md).
