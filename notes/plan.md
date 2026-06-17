### Inputs
graphology: .fasta alignment or .vcf or similar alignment/variant call input
D3: .json-converted graphology tree

### Libraries
- vis-network OR D3 (visualization)
- graphology (backend tree management)
- distance/adjacency matrix calculations/conversions are manual

### Alignment to Clustered MSN
Extract IDs and sequences from file format -> Create similarity matrix -> Cluster genotypes w/ graphology connected components -> Cluster new genotype array according to threshold w/ graphology connected components -> Create nodes with graphology network structure -> Export to .json -> Feed to D3

### Initial Network Construction
Clustering threshold assessed manually, converted to a "connected component" via graphology.
Filtered network constructed with Kruskal's algorithm via graphology.

### Sample Information
Sample information will be available via popup, including the individual IDs associated with each genotype

### Time Complexity
Adjacency matrix calculation and node building are both O(n^2). N will be a lower value after clustering is complete.

Clustering appears much less computationally intensive than adjacency matrix calculation (staying in the milliseconds range as matrix calculation extends to seconds with the same amount of samples).

Webworkers will likely be needed as a backend for adjacency matrix building, but it likely won't be necessary for anything beyond that. Allowing the user to import their own adjacency matrix will significantly reduce computation time, in that case.


### Graph Modification
#### Network Rearrangement
Manual click-and-drag, plus preset layout options as in poppr MSN widget:
- Nice layout
- Randomized layout

Slider to change edge length, which would require the distance legend be simultaneously updated.

#### Changing Clustering Threshold/Distance Calculation
SNP Distance Metrics Options:
- Simple bitwise distance
- Dissimilarity proportion

Slider to change clustering threshold:
- Edges between nodes weighted by similarity higher than the threshold will combine the affected nodes into one meta-node. 
- The edges between the meta-node and other nodes will be determined by the minimum edges in the cluster that allow the same connections.
- Original MSN is preserved because the cluster-collapsed version is a copy, so any further clustering will be just as non-intensive.

#### Removing Nodes
Delete or hide nodes with graphology remove function, add them back within one deletion via copy. Removing nodes will require reconstruction of the spanning network, but it still does not require reconstruction of the distance matrix, so it's still computationally efficient at the few hundred node level.

#### Faceting the Graph
Users select which populations (and potentially genotype nodes) to include
- Subset each population into a separate section to view simultaneously
- View one population at a time (different color legend?)
- View one genotype cluster at a time

### Legends
- Color legend for populations
- Size legend for node size (number of individuals with the genotype)
- Distance legend for edge length
- Pie chart icons upon zooming out

### Plot Saving
Plot output as .pdf