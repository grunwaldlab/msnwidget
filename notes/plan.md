# Genomic Variant-Based Minimum Spanning Network Widget
### Concept
This interactive widget will visualize a minimum spanning network between nodes that represent various multilocus genotypes of members of various populations from an alignment or variant call format.  

### Inputs
- Input to graphology: .fasta alignment/similar alignment OR .vcf/similar variant call input OR pre-existing distance matrix from user
- Input to D3: .json-converted graphology graph

### Libraries
- D3 (visualization)
- graphology (tree management)
- vcf-js (.vcf parser for JS)
- distance/adjacency matrix calculations/conversions, plus MSN construction are manual

### Metadata
Every genotype node will have the associated:
- Sample IDs of members
- Other user-uploaded metadata

### Alignment to Visualized MSN Pipeline
Extract IDs and sequences from file format -> Create distance matrix -> Build a fully connected network from distance matrix -> Perform Kruskal's algorithm on the full set of edges and remove those not associated with an MSN -> Detect "highly connected components" (clusters) from the MSN from a custom threshold and return a cluster map -> Collapse MSN to clustered components if desired -> Export to .json compatible with D3 -> Visualize network with D3 force layout

### Network Construction Backend
Network is constructed using a graphology network object modified with Kruskal's algorithm performed manually.
Clustering threshold is assessed manually, converted to a "connected component" cluster map via graphology, and collapsed to a clustered network by modifying the graphology object if desired.

### Time Complexity
Matrix construction is the largest computational bottleneck, which can be solved via bit packing - achieves ~10 seconds with one million difference sites and 300 samples. If higher performance is desired, WASM parallel processing will be necessary.

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
- Contains sample IDs, selected pie chart variable proportions, and mean/variance (numerical or proportional for continuous/categorical variables respectively)  

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
- Slider representing various similarity thresholds for clustering
- Cluster views updated as clustering threshold changes

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

### Interactions Handled Externally
#### Distance Matrix Upload
Users can upload a pre-existing distance matrix to build the graph directly.

#### Distance Calculation Metric
Dropdown containing:
- Simple bitwise similarity metric
- Proportion of dissimilarity metric
- Potential other population genomics-informed distance

#### Plot Saving
Static plot output as .pdf

### Legends
- Color legend for color-by variable (externally handled IF this variable aesthetic is shared with other plots)
- Size legend for number of samples per node (externally handled IF this variable aesthetic is shared with other plots)
- Distance legend with a line thickness/darkness scale (necessarily internal)