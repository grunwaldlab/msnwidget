# Genomic Variant-Based Minimum Spanning Network Widget
### Concept
This interactive widget will visualize a minimum spanning network between nodes that represent various multilocus genotypes of members of various populations from an alignment or variant call format.  

### Inputs
- Input to the MSN calculation: .fasta alignment/similar alignment OR .vcf/similar variant call input OR pre-existing similarity/dissimilarity matrix from user (type inferred from the diagonal)
- Input to D3: .json-converted graphology graph

### Libraries
- D3 (visualization)
- graphology (tree management)
- vcf-js (.vcf parser for JS)
- distance/adjacency matrix calculations/conversions, plus MSN construction are manual

### Metadata
Every genotype node will have the associated:
- Sample IDs of members
- Other user-uploaded metadata, with dates summarized as ranges rather than numeric mean/variance

### Alignment to Visualized MSN Pipeline
Extract IDs and sequences -> Subset samples to the selected metadata group, if any -> Create the group's distance matrix -> Build the MSN directly from the dense matrix with Prim's algorithm -> Optionally retain tied edges that can occur in alternative minimum spanning trees -> Build a complete-linkage hierarchy -> Cut the hierarchy at the selected similarity threshold -> Collapse to clustered components if desired -> Visualize with the D3 force layout

### Network Construction Backend
The default MSN is constructed directly from the dense dissimilarity matrix with Prim's algorithm; the complete graph is not materialized in Graphology on this path. Equal-weight choices are deterministic by endpoint IDs. An API option retains edges eligible in alternative minimum spanning trees using equal-weight groups.
Complete-linkage (farthest-neighbor) clustering uses pairwise genotype distances. At similarity threshold `s`, clusters merge only when their maximum cross-cluster dissimilarity is `<= 1 - s`. The hierarchy is computed on dataset/group load and cut at each threshold; changing the threshold updates cluster assignments and the collapsed display without rebuilding the MSN.
Selecting a metadata group rebuilds genotype nodes, pairwise distances, MSN, and linkage from only that group's samples; it is not a visual-only filter of the all-sample network.

### Time Complexity
Pairwise distance calculation and complete-linkage construction are expected bottlenecks. Prim avoids storing complete-graph edges, but the pairwise distance matrix remains quadratic. Benchmark before setting performance targets or deciding whether WASM/parallel processing is needed.

### Local Node/Cluster Interactions
The following can be done by interacting with individual nodes, edges, and clusters:

#### Node Popups
- Double click a node to view popup, small exit symbol to close it
- If another node or cluster (boundary or meta-node) is selected, the popup closes (one open at a time)
- Popups disappear when nodes are dragged
- Contains sample IDs and other associated metadata

#### Cluster popups
- Double-click a meta node in 'collapsed' view or double-click a circular boundary in 'full' view to view a cluster summary popup, small exit symbol to close it 
- If another node, meta-node or circular boundary is selected, the popup closes (one open at a time)
- Popups disappear when nodes are dragged
- Contains sample IDs, selected pie chart variable proportions, mean/variance for numeric variables, date ranges, and observed proportions for categorical variables

#### Node Select
- Select one single or multiple nodes by single-clicking the node to select, and again to de-select
- Lasso select multiple nodes through mouse click-and-drag
- Selected nodes can be moved via click-and-drag

#### Cluster Select
- In 'full' view, the user can select entire clusters by clicking the boundaries drawn around them
- In 'collapsed' view, the user can select clusters by clicking the associated meta-node
- Lasso select and click-and-drag also apply to clusters

#### Hide Nodes/Clusters
- Small popup 'hide' button appears once a node, meta-node, or cluster is selected
- If multiple nodes or clusters are selected, the 'hide' button only appears alongside the most recent node or cluster selected 
- The 'hide' button will hide all selected nodes/clusters
- Node and associated edges will not be rendered in D3, but will remain in the graphology structure
- If a node or cluster is double-clicked, the button disappears
- Button disappears on drag (moving) and reappears once stopped

### Global Interactions
The following can be done by interacting with controls in a floating panel positioned over the plot:

#### Clustering Threshold
- Slider from 90% to 100% similarity, defaulting to 95%
- Complete-linkage cluster views update as the threshold changes

#### Network Views
Users can alternate between a 'collapsed' view and a 'full' view of the network, which can be changed with a switch

Full view:
- All nodes are rendered, but circular boundaries are drawn around the clusters

Collapsed View:
- Only cluster meta-nodes are rendered
- Node icons are replaced with pie charts representing the proportion of each population within the cluster

#### Unhide Nodes/Clusters
- While no nodes are hidden, the 'unhide all' button is greyed out
- If button is clicked, all previously hidden nodes and clusters are re-rendered

#### Distance Calculation Metric
- Bitwise or proportion metric is a function parameter for FASTA/VCF inputs only; it is not an active UI control.
- Matrix type is inferred from the diagonal: zero for dissimilarity, one for similarity.

#### Plot Saving
Static plot output as .svg, .png, or .pdf

### Legends
- Color legend for color-by variable (Viridis scaling for categorical, numeric, and date values)
- Size legend for number of samples per node
- Distance legend with a line thickness/darkness scale

### Reference
Base the top menu bar construction off of this package (will eventually be a companion): https://www.npmjs.com/package/@grunwaldlab/heat-tree, with the following sections:
- Data: dataset and metadata selection, plus-sign upload buttons
- Controls: fit to view, manual/auto zoom/pan
- Node Controls: text (default to ID, or use metadata variables), color variable, font, subset-by field and subset
- Export: format selector, export button, and image sizing inputs
- Match Heat Tree's compact controls and white-card UI; use a hamburger toggle for the settings bar, place legends over the plot, and use Viridis color scaling for categorical, numeric, and date values.
