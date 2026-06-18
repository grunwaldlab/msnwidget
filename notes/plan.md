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
Every genotype node will have (at least) the associated:
- Sample IDs of members
- Population name
- Genotype
- Cluster number (if applicable)

### Alignment to Visualized MSN Pipeline
Extract IDs and sequences from file format -> Create distance matrix -> Build a fully connected network from distance matrix -> Perform Kruskal's algorithm on the full set of edges and remove those not associated with an MSN -> Detect "highly connected components" (clusters) from the MSN from a custom threshold and return a cluster map -> Collapse MSN to clustered components if desired -> Export to .json compatible with D3 -> Visualize network with D3 force layout

### Network Construction Backend
Network is constructed using a graphology network object modified with Kruskal's algorithm performed manually.
Clustering threshold is assessed manually, converted to a "connected component" cluster map via graphology, and collapsed to a clustered network by modifying the graphology object if desired.

### Time Complexity
Matrix construction is the largest computational bottleneck, which can be solved via bit packing - achieves ~10 seconds with one million difference sites and 300 samples. If higher performance is desired, WASM parallel processing will be necessary.

### Node/Cluster-Level Interactivity
#### Node Popups
- Double click a node to view popup, small exit symbol to close it
- Contains sample IDs, variation number, population name, cluster number, option button to hide

#### Node Select
- Select one single or multiple nodes by single-clicking the node to select, and again to de-select
- Lasso select multiple nodes through mouse click-and-drag
- Selected nodes can be moved via click-and-drag

#### Cluster Select
- In 'full view', the user can select entire clusters by clicking the boundaries drawn around them

#### Hide Nodes
- Option in node popup, node and associated edges will not be rendered in D3, but will remain in the graphology structure
- Hidden nodes will appear in a small floating panel with an option to unhide them  

### Full Plot Interactivity
#### Distance Calculation Metric
Dropdown containing:
- Simple bitwise similarity metric
- Proportion of dissimilarity metric

#### Clustering Threshold
Slider representing various similarity thresholds for clustering, which in default full view will only draw circular boundaries around the clusters

#### Network Views
Full view:
- All nodes are rendered, but circular boundaries are drawn around the clusters

Collapsed View:
- Only cluster meta-nodes are rendered
- Node icons are replaced with pie charts representing the proportion of each population within the cluster
- Popups function the same with meta-nodes, but now contain the population proportions from the pie chart annotation and the option to hide the meta-node

Users can alternate between a 'collapsed' view and a 'full' view of the network, which can be changed with a switch (in a floating panel with the clustering slider, distance metric dropdown, and list of hidden nodes)

### Legends
- Color legend for populations
- Size legend for node size (number of samples with the genotype)
- Distance legend with a line thickness/darkness scale 

### Plot Saving NOTE: will be handled by flexquilt
Static plot output as .pdf