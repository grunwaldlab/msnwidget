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

  const components = connectedComponents(graph);
  return { graph, components };
};

// SAMPLE GENERATION
let start = performance.now();
const samples = generateFastaSamples(200, 100000);
console.log("FASTA-like samples:", samples);
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
// 200 samples of 100000 bases: 20 seconds

// CLUSTERING
start = performance.now();
const { graph, components } = clusterByThreshold(samples, adjacencyMatrix, 0.1);
console.log("Clusters:", components);
end = performance.now();
console.log(`Clustered samples in ${(end - start).toFixed(2)} ms`);
// 100 samples of 1000 bases (threshold 0.75): a few milliseconds
// 200 samples of 1000 bases (threshold 0.75): a few milliseconds
// 200 samples of 10000 bases (threshold 0.25): a few milliseconds
// 200 samples of 10000 bases (threshold 0.1): a few milliseconds
// 200 samples of 100000 bases (threshold 0.1): a few milliseconds

// TREE BUILDING (using connected components as clusters)

//const { Graph } = require("graphology");
//const graph = new Graph();

/*
samples.forEach(s => graph.addNode(s.id));

samples.forEach((s1, i) => {
  samples.forEach((s2, j) => {
    if (i < j) {
      graph.addEdge(s1.id, s2.id, { weight: adjacencyMatrix[i][j] });
    }
  });
});
*/


