### Inputs
#### Distance Calculations/Clustering
- alignment .fasta, .vcf, or NEXUS file
- metadata table with population names, sample information, etc
- SNP threshold

#### MSN Construction
Distance matrices (multiple options):
- simple bitwise distance
- dissimilarity proportion

### Pre-processing Runtime
- clustering calculations and distance matrix building can be slow with high-level libraries
- MSN construction in python, widget visualization in JS
- Kruskal and Prim performance depends on graph density and representation; weighted igraph MST calls default to Prim. The widget now uses dense-matrix Prim without materializing complete-graph edges; Kruskal remains in the optional equal-weight tie-inclusion path.

### Metadata
Associated metadata table of:
- hex code vector associated with population for color
- population names

### Software
#### Computation
- biopython (Python)
    - distance calculations simultaneous with spanning tree construction
- adegenet (R)
    - population genetics objects for information extraction
- scikit-bio (Python)
    - objects for distance matrices
- scipy
    - built in MSN and distance calculation functionality

#### Construction
C-backed graph libraries can improve runtime, but complete-graph memory and distance calculation are also major limits for large inputs.
- igraph (R and Python)
    - graph algorithms and clustering; weighted MST defaults to Prim
- networkx (Python)
    - Python graph library with optional accelerated backends
- ggraph (R)
    - ggplot2-based graph visualization and faceting, not graph construction

#### Visualization
- D3 (JS)
    - interactivity: manual rotating and inspection of nodes
    - most flexible and lightweight, but requires custom UI for most things
    - force simulation likely not necessary in a report context
- vis-network (JS)
    - large variety of ready-made functionality
- cytoscape (JS)
    - helpful for biological networks
    - subgraphs
- graphology/Sigma (JS)
    - allows various graph types and supports very large networks

### Typical Population/Node Count
In literature and examples, networks are often comprised of thousands of nodes.

### Annotation
Pie charts, popups, sample ID labels, node coloring, line thickness to represent connectivity are all possibilities for annotation
