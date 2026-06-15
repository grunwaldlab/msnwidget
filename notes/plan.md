### Inputs
Python side: .vcf
JS side: .json

Network attributes are calculated and built with Python libraries, then exported to JSON following initial calculation and subsequent re-calculations through the JS widget visualization interface.

### Libraries
#### Python
- numpy (calculations)
- scipy-sparse (Kruskal's MSN)
- JSON

#### JS
- vis-network OR D3 OR graphology/Sigma combination

### Network Construction
Constructed with Kruskal's algorithm via scipy-sparse

### Sample Information
Sample information will be available via popup, including the individual IDs associated with each genotype

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
Delete or hide nodes with vis-network remove function, add them back within one deletion

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