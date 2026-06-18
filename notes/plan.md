### Inputs
graphology: .fasta alignment or .vcf or similar alignment/variant call input
D3: .json-converted graphology tree

### Libraries
- D3 (visualization)
- graphology (tree management)
- vcf-js (.vcf parser for JS)
- distance/adjacency matrix calculations/conversions, plus MSN construction are manual

### Alignment to Visualized MSN Pipeline
Extract IDs and sequences from file format -> Create distance matrix -> Build a fully connected network from distance matrix -> Perform Kruskal's algorithm on the full set of edges and remove those not associated with an MSN -> Detect "highly connected components" (clusters) from the MSN from a custom threshold and return a cluster map -> Collapse MSN to clustered components if desired -> Export to .json compatible with D3 -> Visualize network with D3 elements

### Initial Network Construction
Network is constructed using a graphology network object modified with Kruskal's algorithm performed manually.
Clustering threshold assessed manually, converted to a "connected component" cluster map via graphology, and collapsed to a clustered network by modifying the graphology object if desired.

### Time Complexity
Matrix building is the largest computational bottleneck, which can be solved via bit packing - achieves ~10 seconds with one million difference sites and 300 samples. If higher performance is desired, WASM parallel processing will be necessary.

### Sample Information
Sample information will be available via popup once a node is click-selected, including the individual IDs associated with each genotype.

### Graph Modification
#### Network Selection and Rearrangement
Manual click-and-drag rearrangement, plus preset force layout options from D3:
- Nice layout
- Randomized layout

Slider to change edge length, which would require the distance legend be simultaneously updated.

#### Changing Clustering Threshold/Distance Calculation
SNP Distance Metrics Options (dropdown):
- Simple bitwise distance
- Dissimilarity proportion

Slider to change clustering threshold:
- Edges between nodes weighted by similarity higher than the threshold will combine the affected nodes into one meta-node. 
- The edges between the meta-node and other nodes will be determined by the minimum edges in the cluster that allow the same connections.
- Original MSN is preserved because the cluster-collapsed version is a copy, so any further clustering will be just as non-intensive.

Users can alternate between a 'collapsed' view of the network with pie chart icons over clustered meta-nodes, or a 'full' view of all nodes with boundaries drawn around each cluster. Either a dropdown or buttons.

#### Removing Nodes
Delete or hide nodes with graphology remove function, add them back within one deletion via copy. Removing nodes will require reconstruction of the spanning network, but it still does not require reconstruction of the distance matrix, so it's still computationally efficient at the few hundred node level.

Interface:
- Node option buttons are available in a sidebar once a node is selected. Users can choose to remove or hide nodes. 

#### Faceting the Graph
Users select which populations and nodes to include
- Subset each population into a separate section to view simultaneously with subset switch
- View one or several populations at a time via checkboxes
- View one cluster at a time via circle boundary selection 
- Lasso select several nodes at once to view in isolation

### Legends
- Color legend for populations
- Size legend for node size (number of individuals with the genotype)
- Distance legend for edge length
- Pie chart icons depending on collapse
- Drawn circular boundaries if a clustered MSN is viewed in full 

### Plot Saving
Static plot output as .pdf