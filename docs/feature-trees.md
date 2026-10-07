# Talent and feat selection

Feat selection and talent selection are separate screens, with one shared browser.
The browser uses existing typed prerequisite expressions and selection replay; prose
never determines eligibility. The active feat slot is evaluated before its own grant,
and class access and bonus-feat restrictions still apply. Earlier valid grants and
the active valid selection determine possession; future levels cannot unlock earlier
choices. Pending secondary choices confer no benefits.

Nodes group parameterized feats under one primary name. Secondary options appear
only after choosing that primary. Talent tabs use the existing tree IDs; feats
share one graph without categories. Grey nodes remain readable but cannot be
selected. Possessed nodes
are highlighted, and selectable nodes use normal styling. Only Show Eligible keeps
possessed nodes for context. Prerequisite conditions (such as trained skills) are
read-only nodes. Multiple prerequisite arrows are conjunctive unless marked “or”.

Graph ranks follow prerequisite depth from left to right. Barycentric sweeps and
adjacent swaps reduce line crossings instead of sorting names alphabetically.
Disconnected branches occupy separate vertical bands. Arrows exit the full source
column before bending, so shorter cards do not route lines behind wider neighbours.
Remaining curve intersections use overpasses: SVG masks cut a short gap in the
underpassing line while retaining the overpassing curve and its dash pattern.
Shared source branches and destination joins remain connected. Masks are in graph
coordinates, so they scale with zoom and reveal the active theme's background.
Cards fit their names; read-only prerequisites use smaller text and padding. Curves
and arrowheads share an endpoint; paths into unavailable nodes are dotted.
All cards start folded. Triangles open the verbatim mechanics in a dialog without
moving the graph. Unfold all opens the visible articles together, with individual
disclosures and Fold all/Unfold all controls inside that dialog.
Zoom ranges from 25% to 200%, with a reset button; scaled viewport bounds preserve
horizontal and vertical scrolling. Search matches names and verbatim article text,
retaining prerequisite ancestors. Filters, zoom and scroll positions are view
state, not character benefits.

Feature records use the same closed `article: {sourceId, blocks}` format documented
in species-selection.md. Redirected talent pages are extracted from their exact
heading on the pinned parent tree, ending at the next heading of equal or greater
rank. Reference Book attribution is retained. No generated mechanics replace source
text. Awareness adds Expert Tracker, Keen Shot, Reset Initiative, Uncanny Dodge I,
Uncanny Dodge II and Weak Point with explicitly reviewed typed prerequisites and no
automated situational effects. Existing IDs and saved files remain compatible.

Force Sensitivity adds the closed `nonDroid` prerequisite, evaluated against the
species' `isDroid` flag. It prevents the feat (and its class-skill access) from being
granted to a droid; it does not implement droid construction.
