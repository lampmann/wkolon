# Species selection

The table adapts pmcrwf's Manage Spells controls and expandable detail rows.
Species names expand the article; Select changes the character independently.
Search matches names and the complete bundled species article, case-insensitively.
Filtering, sorting, and selecting keep expanded descriptions available.

Names start A–Z (▼), toggling to Z–A (▲). Numeric columns start highest first.
Ability Modifiers compares the sum of the six modifiers; ties use the species name.
Size compares the rules pack's size order. Speed compares normal speed, then the
sum of all listed movement speeds; ties use the species name. Headers expose the
actual direction through `aria-sort`, and tooltips explain the non-obvious keys.

## Presentation data

Before implementation, the presentation format is defined as
`article: {sourceId, blocks: WikiNode[]}` on species and `rulePages` records.
A node is a text string or `{tag, children, href?, ruleId?, colspan?, rowspan?}`.
Tags use a closed list of paragraphs, emphasis, headings, lists, tables and links.
URLs must be HTTPS links to swse.miraheze.org/wiki/; every text and attribute is
escaped when rendered. There are no raw HTML, styles, event handlers, images,
comments or executable expressions. This tree never drives calculations.
`ruleId` identifies a bundled complete species feat article shown in a dialog;
other rule links open the original wiki page. Descriptions retain the wiki order:
introduction, characteristics, species traits, species feats.

`tools/wiki-articles.py` fetches raw revisions and their MediaWiki-parsed HTML at
those exact revisions. `tools/compile-wiki-articles.py` produces the presentation
tree. The reviewed-revision manifest gates every source, with attribution and
contributor history in Rules. Images and other wiki artwork are not included.

The starter catalog now also includes the illustrated Gungan and Gamorrean.
Gungan's swim speed is a separate `speeds.swim` value. Gamorrean's automatic
Improved Damage Threshold is a `startingFeats` grant; its Primitive restriction is
`excludedStartingFeats`, applied only to the initial class's automatic grants.
Characters, saved species IDs, point assignments, and pack version remain compatible.
