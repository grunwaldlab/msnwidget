# Genomic Minimum Spanning Network Widget

A draft browser-based implementation of `../notes/plan.md`, using Graphology for graph construction, D3 for visualization, and `@gmod/vcf` (vcf-js) for VCF parsing. `src/main.js` is the earlier standalone prototype; it overlaps with the later production modules, but is not imported by the demo, widget, or worker.

## Run and Verify

Run commands from this directory (`msnwidget/`):

```sh
npm install
npm run dev
npm test
npx playwright install chromium
npm run test:browser
npm run build
npm run build:lib
```

`build` produces the standalone demo in `dist/`. `build:lib` produces the ES module, stylesheet, and bundled module worker in `dist-lib/`. Serve applications over HTTP(S), not `file://`. The package remains private and versioned `0.0.0` while the API is a draft.

## Embedding

```js
import { msnWidget } from 'msnwidget';
import 'msnwidget/style.css';

const widget = msnWidget('#network', {
  name: 'Aligned samples',
  fasta: '>sample_a\nACGT\n>sample_b\nACGA\n>sample_c\nACGA',
  metadata: [
    { id: 'sample_a', population: 'North', elevation: 100 },
    { id: 'sample_b', population: 'South', elevation: 250 },
    { id: 'sample_c', population: 'North', elevation: 200 },
  ],
}, {
  threshold: 0.95,
  view: 'full',
  colorBy: 'population',
  maxSamples: 1500,
  includeTies: false,
  metric: 'bitwise', // FASTA/VCF only; also supports 'proportion'
  // useWorker: false, // Force direct main-thread computation in worker-restricted viewers.
});

await widget.ready;
widget.setThreshold(0.9);
widget.setView('collapsed');
await widget.setMetadata('id,population\nsample_a,North\nsample_b,South');
await widget.setGroup('population', 'North'); // Rebuild an MSN from North samples only.
const graph = widget.getGraph(); // Independent copy of the active group's MSN.
const state = widget.getState();
await widget.exportPlot('svg'); // Also png and pdf; triggers a download.
widget.destroy();
```

In the source demo, import from `./src/index.js`; its widget stylesheet is included automatically by Vite. For a built library consumer, import the separate stylesheet. Retain the `dist-lib/assets/` worker directory alongside the library; the emitted worker URL is relative to the ES module. The worker performs computation locally and does not require network access. If workers are unavailable or blocked by a viewer/CSP, the widget falls back to running the same core calculation on the main thread. Set `useWorker: false` to force that path. Large datasets can pause the viewer while the fallback runs. Serve over HTTP(S), not `file://`. PDF dependencies are loaded only on export.

Pass an array of dataset objects to populate the Data menu, or omit datasets to create an empty uploadable widget. `widget.load(dataset)` asynchronously replaces the active dataset. A newer load cancels the previous worker and rejects its promise with `AbortError`; destruction also cancels a pending load. Load failures keep the prior valid graph visible, log the error to the console, and reject the returned promise. Await `ready` or `load()` before accessing the graph or assigning metadata. Metadata tables are associated with the dataset where they were uploaded; switching datasets does not silently reuse the previous dataset's metadata. Multiple widgets can coexist independently.

Dataset descriptors support one of `fasta` (text), `vcf` (text), `distanceMatrix` (object or JSON text), or parsed `{ samples, kind, matrix? }` data from the core parsers. Metadata can be rows as above, CSV/TSV text, or named tables:

```js
metadata: [
  { name: 'Locations', data: 'id,population\nsample_a,North\nsample_b,South' },
  { name: 'Collection dates', data: 'id,year\nsample_a,2024\nsample_b,2025' },
]
```

Metadata table selection replaces, rather than merges, the active table. Uploads add named tables. At least one metadata ID must match a sample in the active dataset; unmatched extra rows are reported. CSV/TSV ID columns may be named `id`, `sample_id`, `sampleIdentifier`, `isolate_id`, `specimen_id`, or `taxon_id` (case and punctuation are ignored); ambiguous ID columns are rejected. Group-by chooses a metadata field and group; changing it rebuilds the genotype set and MSN from only that group's samples. The full input sample IDs are retained for switching back to all groups. Color-by uses Viridis for categorical, numeric, and ISO date metadata, with categorical values ordered by frequency and missing values shown in grey. If the active metadata includes `color_by`, its comma- or semicolon-separated values restrict which metadata columns can be selected for coloring. Date fields are summarized as ranges rather than numeric means and variances. Labels can use IDs or any metadata column. Empty metadata cells are missing values; IDs remain strings, while numeric nonempty cells are converted to numbers. Data and metadata are rendered as text, never HTML.

## Input and Scientific Conventions

**FASTA:** aligned, equally sized, nonempty sequences. The first token after `>` is the sample ID. Lowercase DNA is normalized; IUPAC ambiguity, gaps, `?`, and `.` are treated as missing. Duplicate IDs, unknown DNA characters, and unequal lengths are rejected. Identical normalized profiles become one multilocus genotype node with all member IDs and metadata records retained.

**VCF:** uncompressed text with sample columns and a `GT` field in every record. GT calls are compared as unordered allele-index multisets: `0|1` and `1/0` are equivalent. Any partially missing call is missing at that site. Invalid allele indices are rejected, including nonmissing alleles in partial calls. Haploid, diploid, and higher-ploidy calls are retained as genotype strings; different ploidies are different calls. This is a genotype-call mismatch metric, not allele dosage distance or haplotype inference. The draft uses every record regardless of FILTER and does not support indexed, compressed, or streamed VCF.

**Distance matrices:** JSON with unique string IDs and a square, symmetric matrix in `[0, 1]`. A zero diagonal identifies dissimilarity; a diagonal of one identifies similarity. Similarity matrices are converted using `distance = 1 - similarity`:

```json
{
  "ids": ["sample_a", "sample_b", "sample_c"],
  "matrix": [[0, 0.1, 0.3], [0.1, 0, 0.2], [0.3, 0.2, 0]]
}
```

Matrix input keeps the provided nodes separate, even when an off-diagonal distance is zero. The sequence-distance metric is not applied to precomputed matrices. Graphology 0.26 cannot safely use inherited object property names as graph node IDs, so IDs such as `__proto__`, `constructor`, and `toString` are explicitly rejected.

**Distances:** mismatching jointly called sites divided by jointly called sites (pairwise deletion). Unknown calls are never silently interpreted as A. A pair with no jointly called sites is rejected. The bitwise option packs DNA into two bits per base with a separate called-site mask; the proportion option is an unpacked reference implementation. Both yield the same DNA distance. VCF uses genotype-call comparisons with either selection.

**Network construction:** a dense-matrix Prim implementation builds the minimum spanning network without materializing the complete graph. By default, equal-weight ties are broken deterministically by endpoint IDs, producing one minimum spanning tree. The `includeTies` function option retains equally weighted edges that could participate in alternative minimum spanning trees, producing a minimum spanning network; this tie-inclusion path uses Kruskal's equal-weight groups. Edge weights remain dissimilarities. The edge legend expresses the inverse similarity (`1 - dissimilarity`): similarity 1 is light/thin and similarity 0 is dark/thick. `metric` is a function option for FASTA and VCF only (`bitwise` or `proportion`); matrix values are already calculated.

**Clusters:** the widget uses complete-linkage (farthest-neighbor) clustering over the genotype pairwise dissimilarities. At similarity threshold `s`, clusters merge only while their maximum cross-cluster distance is `<= 1 - s`. The UI range is 90–100% similarity, default 95%. The linkage hierarchy is computed once per dataset/group load; changing the threshold cuts that hierarchy and rebuilds the collapsed display, but does not recompute the MSN. This differs from single-linkage connectivity on the MSN. Pairwise missing-site deletion may violate metric/triangle-inequality assumptions. Cluster labels are deterministic for a fixed hierarchy and threshold, but are not persistent identifiers across threshold changes. Cluster summaries use per-sample metadata, population variance for numerical columns, date ranges for date columns, and observed-value proportions for categorical columns. Missing-rate aggregation is sample weighted.

## Interactions

- Data, Controls, Node Controls, and Export menus follow the companion heat-tree's compact style. The hamburger collapses the full control bar and its background, leaving only the toggle; re-clicking an open tab collapses the sub-bar.
- Group-by recomputes the MSN on the selected metadata group rather than merely hiding nodes from the all-sample network. Select “All samples” to rebuild the full network.
- The floating panel controls similarity, full/collapsed views, and unhiding. The Controls panel provides fit, zoom slider, pan, auto-fit, and lasso settings. The cluster threshold slider is restricted to 90–100%.
- Full view shows genotype nodes inside circular cluster boundaries; collapsed view shows cluster meta-nodes. Node pies show composition of the selected variable, including mixed populations in a single genotype.
- Click nodes or boundaries to toggle selection. Shift-drag, or enable Lasso mode, to add everything enclosed by the polygon to the selection. Dragging a selected node or boundary moves the selected visible nodes together.
- Double-click a node or boundary to open its summary. Only one popup stays open; selecting or dragging closes it. Keyboard Space selects and Enter inspects focused nodes/boundaries.
- Hide selection removes selected genotypes and their edges from rendering only. The underlying Graphology tree and threshold clusters remain intact. Hiding a meta-node or boundary hides all its members. Unhide all restores them.
- Zoom/pan, fit to view, auto-fit, labels, label font, color/pie variable, subset-by controls, and legends are available. Mouse or touch dragging moves nodes; desktop Shift-drag supports lasso.
- SVG, PNG (2x resolution), and vector PDF exports include the current view and legends. Choose output width and height in the Export panel. Summary counts are not rendered in the widget or exports; structured stats remain available through `widget.getState()`.

## Modules and Remaining Work

- `src/network.js`: active parsers, packed distances, direct dense-matrix Prim MSN construction, complete-linkage hierarchy, aggregation, and D3 conversion. `computeMSN` on a supplied graph uses Prim by default; tied-edge inclusion uses deterministic equal-weight Kruskal groups. The similarly named helpers in `src/main.js` are prototype-era copies, not runtime dependencies. `network.js` is exported through `msnwidget/core`, usable from Node without a DOM.
- `src/network.worker.js`: optional cancellable construction worker; `src/network.js` also supports direct synchronous construction for worker-restricted viewers.
- `src/widget.js` / `src/widget.css`: isolated widget UI, force layout, interactions, and exports.
- `src/demo.js`: deterministic 60-sample demonstration without the prototype's expensive startup benchmark.
- `tests/network.test.js`: algorithm and input validation tests.
- `tests/widget.spec.js`: Chromium interaction, worker, export, mobile, and lifecycle tests.

For `g` genotype nodes and `L` sites, distances cost roughly `O(g^2 * L/16)` for packed DNA, Prim costs `O(g^2)`, and complete-linkage hierarchy construction costs `O(g^2 log g)` in the worst case. Pairwise distance storage remains `O(g^2)`; complete-graph Graphology storage is avoided. A group change rebuilds distances, MSN, and linkage for that subset. Workers prevent computation from blocking the UI but do not remove its computational or memory cost. The default limit is 1,500 input samples and is configurable; it is a guardrail, not a performance claim. Large cohort/million-site benchmarks, WASM/parallel distance processing, sparse construction, NEXUS, and more genetic distance metrics remain follow-up work. Circular boundaries can overlap; they are not convex-hull or non-overlapping community layouts. The test suite currently exercises Chromium, not all browser engines.
