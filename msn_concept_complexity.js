import Graph from 'graphology';
import { connectedComponents } from 'graphology-components';

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

function sequenceSimilarity(seqA, seqB) {
  const len = Math.min(seqA.length, seqB.length);
  let matches = 0;
  for (let i = 0; i < len; i++) {
    if (seqA[i] === seqB[i]) matches++;
  }
  return matches / len; // normalized similarity 0–1
}

function buildDistanceMatrix(samples) {
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

function graphFromDistanceMatrix(samples, distanceMatrix) {
  const graph = new Graph();

  // Add nodes
  samples.forEach(s => graph.addNode(s.id));

  // Add weighted edges (distance = weight)
  for (let i = 0; i < samples.length; i++) {
    for (let j = i + 1; j < samples.length; j++) {
      const dist = distanceMatrix[i][j];
      graph.addEdge(samples[i].id, samples[j].id, { weight: dist });
    }
  }
  return graph;
}


function makeUnionFind(nodes) {
  const parent = {}, rank = {};
  for (const n of nodes) { parent[n] = n; rank[n] = 0; }
 
  function find(x) {
    if (parent[x] !== x) {
        parent[x] = find(parent[x]);
    }
    return parent[x];
  }
  function union(a, b) {
    const ra = find(a), rb = find(b);
    if (ra === rb) {
        return false;
    }
    if (rank[ra] < rank[rb]) {
        parent[ra] = rb;
    } else if (rank[ra] > rank[rb]) {
        parent[rb] = ra;
    } else {
        parent[rb] = ra;
        rank[ra]++;
    }
    return true;
  }
 
  return { find, union };
}

function computeMSN(graph) {
  const edges = graph.edges().map(e => ({
    key:    e,
    source: graph.source(e),
    target: graph.target(e),
    weight: graph.getEdgeAttribute(e, 'weight'),
  })).sort((a, b) => a.weight - b.weight);
 
  const uf      = makeUnionFind(graph.nodes());
  const mst     = new Graph({ type: 'undirected', multi: false });
  const mstKeys = new Set();
 
  // Copy node attributes
  graph.forEachNode((node, attrs) => mst.addNode(node, { ...attrs }));
 
  for (const edge of edges) {
    if (uf.union(edge.source, edge.target)) {
      mst.addEdgeWithKey(
        edge.key, edge.source, edge.target,
        graph.getEdgeAttributes(edge.key)
      );
      mstKeys.add(edge.key);
      if (mst.size === graph.order - 1) break;   // MST complete
    }
  }
 
  return { mst, mstEdgeKeys: mstKeys };
}

function clusterByThreshold(mst, threshold) {
  const uf = makeUnionFind(mst.nodes());
 
  mst.forEachEdge((e, attrs, source, target) => {
    if (attrs.weight >= threshold) uf.union(source, target);
  });
 
  // Assign stable integer indices to roots
  const roots = new Map();
  let idx = 0;
  const clusterMap = {};
 
  mst.forEachNode(node => {
    const root = uf.find(node);
    if (!roots.has(root)) roots.set(root, idx++);
    clusterMap[node] = roots.get(root);
  });
 
  return clusterMap;
}

export function collapseToClusterGraph(mst, clusterMap) {
  const collapsed = new Graph({ type: 'undirected', multi: false });

  // --- build meta-nodes ---
  // aggregate frequency, member list, mean missing rate per cluster
  const clusterStats = {};

  mst.forEachNode((node, attrs) => {
    const c = clusterMap[node];
    if (!clusterStats[c]) {
      clusterStats[c] = {
        id:          `C${c}`,
        cluster:     c,
        members:     [],
        frequency:   0,
        missingSum:  0,
      };
    }
    clusterStats[c].members.push(node);
    clusterStats[c].frequency   += (attrs.frequency   ?? 1);
    clusterStats[c].missingSum  += (attrs.missingRate ?? 0);
  });

  Object.values(clusterStats).forEach(cs => {
    collapsed.addNode(`C${cs.cluster}`, {
      id:          `C${cs.cluster}`,
      cluster:     cs.cluster,
      members:     cs.members,
      frequency:   cs.frequency,
      missingRate: cs.missingSum / cs.members.length,
      size:        cs.members.length,
    });
  });

  // --- build between-cluster edges ---
  // for each MST edge that crosses a cluster boundary,
  // keep only the minimum weight edge between each pair of clusters
  const betweenEdges = new Map();  // 'C0-C1' → min weight

  mst.forEachEdge((e, attrs, source, target) => {
    const cs = clusterMap[source];
    const ct = clusterMap[target];
    if (cs === ct) return;   // within-cluster edge — discard

    const key = [Math.min(cs, ct), Math.max(cs, ct)].join('-');
    const existing = betweenEdges.get(key);
    if (!existing || attrs.weight < existing.weight) {
      betweenEdges.set(key, {
        source:  `C${cs}`,
        target:  `C${ct}`,
        weight:  attrs.weight,
        // preserve the original node pair for reference
        via:     `${source}→${target}`,
      });
    }
  });

  betweenEdges.forEach(({ source, target, weight, via }) => {
    collapsed.addEdge(source, target, { weight, via });
  });

  return collapsed;
}
//-----------------------------------------------------------------------------------------------//

// SAMPLE GENERATION
const samples = generateFastaSamples(200, 10000);

// DISTANCE MATRIX BUILDING
let start = performance.now();
let distanceMatrix = buildDistanceMatrix(samples);
let end = performance.now();
console.log(`Built distance matrix in ${(end - start).toFixed(2)} ms`);
// 100 samples of 1000 bases: a few milliseconds
// 200 samples of 1000 bases: 200 ms
// 200 samples of 10000 bases: 2 seconds
// 200 samples of 100000 bases: 20 seconds

// GRAPH BUILDING
start = performance.now();
const graph = graphFromDistanceMatrix(samples, distanceMatrix);
end = performance.now();
console.log(distanceMatrix);
console.log(`Built graph in ${(end - start).toFixed(2)} ms`);
// 200 samples of 10000 bases: 40 ms

// MSN BUILDING
start = performance.now();
const msn = computeMSN(graph);
end = performance.now();
console.log(`Built MSN in ${(end - start).toFixed(2)} ms`);
// 200 samples of 10000 bases: 44 ms

// CLUSTERING
start = performance.now();
const clusterMap = clusterByThreshold(msn.mst, 0.25);
console.log("Cluster map:", clusterMap);
end = performance.now();
console.log(`Clustered samples in ${(end - start).toFixed(2)} ms`);
// 200 samples of 10000 bases (threshold 0.25): a few milliseconds

// COLLAPSE TO CLUSTER GRAPH
start = performance.now();
const clusterGraph = collapseToClusterGraph(msn.mst, clusterMap);
end = performance.now();
console.log(`Collapsed to cluster graph in ${(end - start).toFixed(2)} ms`);
// 200 samples of 10000 bases (threshold 0.25): a few milliseconds

// CLUSTERING
// start = performance.now();
// const { graph, components } = clusterByThreshold(samples, adjacencyMatrix, 0.3);
// console.log("Clusters:", components);
// end = performance.now();
// console.log(`Clustered samples in ${(end - start).toFixed(2)} ms`);
// // 100 samples of 1000 bases (threshold 0.75): a few milliseconds
// // 200 samples of 1000 bases (threshold 0.75): a few milliseconds
// // 200 samples of 10000 bases (threshold 0.25): a few milliseconds
// // 200 samples of 10000 bases (threshold 0.1): a few milliseconds
// // 200 samples of 100000 bases (threshold 0.1): a few milliseconds
// let clusters = componentsToClusters(samples, components);