### Inputs
Python side: .vcf
JS side: .json

Network attributes are calculated and built with Python libraries, then exported to JSON following initial calculation and subsequent re-calculations through the JS widget visualization interface.

### Libraries
#### Python
- scipy (MSN and hamming)
- networkx

#### JS
- D3 or vis-network

### Network Construction
Constructed with Kruskal's algorithm

### Sample Information
Sample information will be available via popup, including the individual IDs associated with each genotype

### Graph Modification
#### Network Rearrangement
Manual click-and-drag, plus preset layout options as in poppr MSN widget:
- Nice layout

Slider to change edge length, which would require the distance legend be simultaneously updated.

#### Changing Clustering Threshold/Algorithm/Distance Calculation

#### Removing Nodes
Pairwise deletion:

#### Faceting the Graph
Users select which populations (and potentially genotype nodes) to include
- Possibly subset each population into a separate section

### Legends
- Color legend for populations
- Size legend for node size (number of individuals with the genotype)
- Distance legend for edge length