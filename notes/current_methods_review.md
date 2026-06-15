### Inputs
#### Distance Calculations/Clustering
- alignment .fasta, .vcf, or NEXUS file
- metadata table with population names, sample information, etc
- SNP threshold

#### MSN Construction
Distance matrices (multiple options):
- hamming distance

### Pre-processing Runtime
- clustering calculations and distance matrix building can be slow with high-level libraries
- MSN construction in python, widget visualization in JS
- Kruskal's algorithm generally runs much faster than Prim's

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
C++ libraries have faster runtimes, which is necessary for input files containing thosuands of nodes.
- igraph (R and Python)
    - many available clustering algorithms for population detection
- networkx (Python)
    - written in C++, useful for larger datasets
- ggraph (R)
    - facet graph capability (for viewing populations individually)

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