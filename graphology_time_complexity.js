import Graph from 'graphology';
import { connectedComponents } from 'graphology-components';

// samples = [{id, seq}], adjacencyMatrix = NxN similarity values

// --- 1. Generate random FASTA-like sequences ---
function randomDNA(length = 500) {
  const bases = ["A", "C", "G", "T"];
  return Array.from({ length }, () => bases[Math.floor(Math.random() * 4)]).join("");
}

function generateFastaSamples(n = 100, length = 50) {
  return Array.from({ length: n }, (_, i) => ({
    id: `sample_${i + 1}`,
    seq: randomDNA(length)
  }));
}

// --- 2. Simple alignment similarity score (Hamming similarity) ---
function sequenceSimilarity(seqA, seqB) {
  const len = Math.min(seqA.length, seqB.length);
  let matches = 0;
  for (let i = 0; i < len; i++) {
    if (seqA[i] === seqB[i]) matches++;
  }
  return matches / len; // normalized similarity 0–1
}

// --- 3. Build adjacency matrix for Graphology ---
function buildAdjacencyMatrix(samples) {
  const n = samples.length;
  const matrix = Array.from({ length: n }, () => Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const sim = sequenceSimilarity(samples[i].seq, samples[j].seq);
      matrix[i][j] = sim;
      matrix[j][i] = sim;
    }
  }
  return matrix;
}

function clusterByThreshold(samples, adjacencyMatrix, threshold = 0.8) {
  const graph = new Graph();

  // Add nodes
  samples.forEach(s => graph.addNode(s.id));

  // Add edges only if similarity >= threshold
  samples.forEach((s1, i) => {
    samples.forEach((s2, j) => {
      if (i < j && adjacencyMatrix[i][j] >= threshold) {
        graph.addEdge(s1.id, s2.id, { weight: adjacencyMatrix[i][j] });
      }
    });
  });
  console.log("edges added:", graph.edges())

  const components = connectedComponents(graph);
  return { graph, components };
};

function componentsToClusters(samples, components) {
  return components.map((comp, idx) => ({
    id: `cluster_${idx + 1}`,
    members: comp,
  }));
}

function clusterDistance(clusterA, clusterB, samples, adjacencyMatrix) {
  let total = 0;
  let count = 0;

  clusterA.members.forEach(a => {
    clusterB.members.forEach(b => {
      const i = samples.findIndex(s => s.id === a);
      const j = samples.findIndex(s => s.id === b);
      total += (1 - adjacencyMatrix[i][j]); // convert similarity → distance
      count++;
    });
  });

  return total / count;
}

function buildClusterTree(clusters, samples, adjacencyMatrix) {
  const nodes = clusters.map(c => ({ ...c }));

  while (nodes.length > 1) {
    let bestA = null, bestB = null, bestDist = Infinity;

    // find closest pair
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const d = clusterDistance(nodes[i], nodes[j], samples, adjacencyMatrix);
        if (d < bestDist) {
          bestDist = d;
          bestA = i;
          bestB = j;
        }
      }
    }

    // merge
    const merged = {
      id: `merge_${Date.now()}_${Math.random()}`,
      children: [nodes[bestA], nodes[bestB]],
      distance: bestDist,
      members: [...nodes[bestA].members, ...nodes[bestB].members]
    };

    // remove old, add new
    nodes.splice(bestB, 1);
    nodes.splice(bestA, 1);
    nodes.push(merged);
  }

  return nodes[0]; // root
}


// SAMPLE GENERATION
let start = performance.now();
const samples = generateFastaSamples(200, 1000);
let end = performance.now();
console.log(`Generated ${samples.length} samples in ${(end - start).toFixed(2)} ms`);

// ADJACENCY MATRIX BUILDING
start = performance.now();
const adjacencyMatrix = buildAdjacencyMatrix(samples);
end = performance.now();
console.log(`Built adjacency matrix in ${(end - start).toFixed(2)} ms`);
// 100 samples of 1000 bases: a few milliseconds
// 200 samples of 1000 bases: 200 ms
// 200 samples of 10000 bases: 2 seconds
// 200 samples of 100000 bases: 20 seconds

// CLUSTERING
start = performance.now();
const { graph, components } = clusterByThreshold(samples, adjacencyMatrix, 0.3);
console.log("Clusters:", components);
end = performance.now();
console.log(`Clustered samples in ${(end - start).toFixed(2)} ms`);
// 100 samples of 1000 bases (threshold 0.75): a few milliseconds
// 200 samples of 1000 bases (threshold 0.75): a few milliseconds
// 200 samples of 10000 bases (threshold 0.25): a few milliseconds
// 200 samples of 10000 bases (threshold 0.1): a few milliseconds
// 200 samples of 100000 bases (threshold 0.1): a few milliseconds
let clusters = componentsToClusters(samples, components);

let tree = buildClusterTree(clusters, samples, adjacencyMatrix);
console.log("Cluster tree:", tree);


