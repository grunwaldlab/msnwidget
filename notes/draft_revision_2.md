# More in-depth review of each component

## Input
- Infer matrix type from the diagonal: all-zero means dissimilarity; all-one means similarity. Reject mixed or other diagonal values.

## MSN Calculation
- Use Prim directly over the dense distance matrix to avoid constructing the complete Graphology graph; deterministic equal-weight choices use endpoint IDs.
- Keep optional tied-edge inclusion as a function parameter, not a UI control. Validate its alternative-MST edge set against fixtures.

## Clustering
- Use complete-linkage (farthest-neighbor) clustering by default. At similarity threshold `s`, clusters merge only when the maximum cross-cluster dissimilarity is `<= 1 - s`.
- Restrict the UI slider to 90–100% similarity, default 95%.
- Compute the linkage hierarchy on dataset/group load. Threshold changes cut the hierarchy and rebuild collapsed views; they do not rebuild the MSN.

## Metadata
- Metadata upload requires at least one matching sample ID; unmatched extra rows remain allowed and are reported.
- Recognize common sample ID column aliases and reject ambiguous ID columns.
- Summarize date metadata as ranges and color ISO dates continuously.
- Bind uploaded metadata tables to their dataset; do not silently reuse them for another dataset.
- If the active metadata contains `color_by`, restrict color variables to the comma- or semicolon-separated column names listed there.

## UI
### Data
- Load metadata/load alignment/choose file buttons should mirror Heat Tree's plus-sign buttons.
- Do not include distance metric, matrix type, or tied edges in the active UI. Keep metric as a FASTA/VCF function parameter and tied-edge inclusion as a function parameter.

### Controls
- Zoom should be a slider that stays synchronized with fit and manual zoom/pan.

### Node Controls
- Rename Node Labels to Node Controls.
- Move group-by options here and call them "Subset by:" and "Subset:"

### Export
- Mirror Heat Tree's format dropdown and single export button.
- Add image width/height boxes.
- Remove the visible "Plots export the current view" hint.

### Plot Window
- Keep progress notices separate from errors; send errors to the console only.
- Remove summary counts from the widget and plot exports; don't relocate them.
- Keep structured counts available through the widget state API.
- Make the hamburger collapse the complete control bar and background, leaving only the toggle.
- Re-clicking the active tab collapses its sub-bar.
- Change the edge legend to similarity values from 1 (light/thin) to 0 (dark/thick), preserving the current edge styling and distance-based tooltips.

## Major Re-color Bug
- Resolved by limiting the D3 node join to top-level node groups; nested pie-chart groups were being rebound as nodes on rerender. Added a browser regression check across color, font, and threshold changes.

## General
- Keep consistent indentation.
- Remove duplicate validation only where a public function's own invariants remain protected.

## Future Things to Think About
- Be able to unzip gzipped FASTA + VCF? Would VCF support slow down efficiency in general compared to alignments?
- Consider reporting the number of alternate networks instead of rendering all eligible tied edges. Current tie inclusion retains eligible equal-weight edges through its Kruskal path.
- Be able to support nearest- and average-neighbor clustering via function parameter (not UI); complete linkage is now the default
- Be able to support Kruskal's algorithm as an alterative (also as a function parameter)
