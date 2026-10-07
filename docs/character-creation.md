# Character creation tabs

Order and tab wording were fetched from the wiki API, not inferred from memory.
Source: [Character Creation, revision 26288](https://swse.miraheze.org/w/index.php?oldid=26288),
2025-03-12T00:09:37Z. The source's revision and contributor history also appear in Rules.

`src/creation-steps.js` preserves its ten headings, including the period in the
first heading and lowercase “your” in the last. Generation and assignment,
feats and talents each have distinct tabs. New drafts begin with an unassigned standard pool. Existing character scores retain
their assignments; new manual/point-buy/rolled pools save separately from ability
assignments. Editing an assigned pool entry updates that ability's base score.

The visual options/talent-tree revamp remains pending the user's sketch in
[the project todo list](https://github.com/lampmann/wkolon/blob/main/TODO.md).
