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

#### Changing Clustering Threshold/Algorithm/Distance Calculation
SNP Distance Metrics Options:
- Simple bitwise distance
- Dissimilarity proportion

#### Removing Nodes
Delete or hide nodes with graphology remove function, add them back within one deletion

#### Faceting the Graph
Users select which populations (and potentially genotype nodes) to include
- Subset each population into a separate section to view simultaneously
- View one population at a time (different color legend?)

### Legends
- Color legend for populations
- Size legend for node size (number of individuals with the genotype)
- Distance legend for edge length
- Pie chart icons upon zooming out

### Plot Saving
Plot output as .pdf