# Revision Decisions

## MSN Construction and Clustering
- Build the default MSN directly from the dense dissimilarity matrix with Prim's algorithm; do not materialize the complete Graphology graph on the normal path.
- Break equal-weight Prim choices deterministically by endpoint IDs.
- Keep optional tied-edge inclusion as a function parameter, not an active UI control. The tied-edge path retains edges eligible in alternative minimum spanning trees using equal-weight groups.
- Cluster genotype nodes with complete linkage (farthest-neighbor) by default. At similarity threshold `s`, merge clusters only when their maximum cross-cluster dissimilarity is `<= 1 - s`.
- The widget threshold slider covers 90–100% similarity and defaults to 95%. Compute the linkage hierarchy on dataset/group load; threshold changes cut the hierarchy and update collapsed views without rebuilding the MSN.
- Selecting a metadata group rebuilds distances, the MSN, and linkage from only that group's samples.
- Compare scientific behavior against explicit fixtures; do not build R `genind` objects solely to mirror poppr.
- Prefer a cancellable module worker, with direct synchronous fallback when unavailable. Worker assets must ship with the widget and have no external network dependency.

## Inputs and Metadata
- Infer matrix type from its diagonal: zero means dissimilarity; one means similarity, converted with `1 - similarity`. Reject invalid or mixed diagonals.
- Keep `metric` as a function option for FASTA/VCF only; keep tied-edge inclusion as a function option. Neither appears in the active UI.
- Metadata must have unique string sample IDs and at least one ID matching the active dataset. Additional unmatched rows are allowed and reported.
- Recognize common sample-ID header aliases; reject ambiguous ID columns.
- Associate uploaded metadata tables with their dataset. Do not silently carry a table to another dataset; restore its table selection when returning to that dataset.
- Summarize date fields as ranges and color ISO dates continuously rather than treating them as numeric means/variances.

## UI and Styling
- Use Heat Tree-inspired plus-sign file buttons, compact white-card presentation, and a hamburger toggle for the settings bar.
- Name the menus Data, Controls, Node Controls, and Export. Put subset-by controls in Node Controls.
- Use a zoom slider; retain fit, pan, auto-fit, and lasso controls.
- Use one export format selector and export button, with width and height inputs. Keep SVG, PNG, and PDF exports.
- Keep legends on the plot and use Viridis for categorical, numeric, and date color fields.
- Keep informational progress notices in the widget; send errors to the console while preserving API rejection behavior.
- Remove the summary counts from the widget and plot exports; retain structured stats through the widget state API.
- If active metadata includes `color_by`, allow only its comma- or semicolon-separated column names as color fields.
- Label the edge legend as similarity, with 1 at the light/thin end and 0 at the dark/thick end; edge weights and tooltips remain dissimilarities.
- The hamburger collapses the entire control bar and background, leaving only the toggle. Re-clicking an active tab collapses the sub-bar.
- Keep node and cluster popup behavior.

## Validation and Errors
- Preserve validations that protect public core functions and structural invariants; remove duplicate checks only when ownership is clear.
- Keep unique sample IDs because graph and metadata association rely on them.
- Graphology node IDs remain strings; object-valued IDs are not a workaround for reserved-property-name limitations.
- The MSN is undirected.

## Deferred
- Alternative linkage methods, Kruskal as a selectable algorithm, compressed FASTA/VCF, and alternate-network counts remain future work.
- Revisit other intermittent interaction bugs after major behavior changes.
