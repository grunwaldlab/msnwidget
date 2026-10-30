import Graph from 'graphology';
import VCFParser from '@gmod/vcf';
import { csvParse, tsvParse } from 'd3';

const BASES = { A: 0, C: 1, G: 2, T: 3 };
const MISSING = /^[NRYWSKMBDHV?.-]$/;

// Validate that samples have nonempty, unique string IDs.
function validateSamples(samples) {
  if (!Array.isArray(samples) || !samples.length) throw new Error('At least one sample is required.');
  const ids = new Set();
  for (const sample of samples) {
    if (typeof sample.id !== 'string' || !sample.id.trim() || ids.has(sample.id)) {
      throw new Error('Sample IDs must be nonempty, unique strings.');
    }
    ids.add(sample.id);
  }
}

// Parse a FASTA string into an alignment dataset.
export function parseFasta(text) {
  const samples = [];
  let sample;
  for (const raw of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith(';')) continue;
    if (line.startsWith('>')) {
      sample = { id: line.slice(1).trim().split(/\s+/)[0], sequence: '' };
      samples.push(sample);
    } else {
      if (!sample) throw new Error('FASTA sequence encountered before a header.');
      sample.sequence += line.replace(/\s/g, '').toUpperCase();
    }
  }
  validateSamples(samples);
  const length = samples[0].sequence.length;
  if (!length || samples.some(s => s.sequence.length !== length)) {
    throw new Error('FASTA must contain nonempty, equally sized aligned sequences.');
  }
  for (const s of samples) {
    s.sequence = [...s.sequence].map(base => {
      if (base in BASES) return base;
      if (MISSING.test(base)) return 'N';
      throw new Error(`Unexpected character "${base}" in ${s.id}.`);
    }).join('');
  }
  return { samples, kind: 'alignment' };
}

export function parseVcf(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => line.trim());
  const header = lines.filter(line => line.startsWith('#')).join('\n');
  const parser = new VCFParser({ header, strict: true });
  const samples = parser.samples.map(id => ({ id, variants: [] }));
  validateSamples(samples);
  for (const line of lines.filter(line => !line.startsWith('#'))) {
    if (line.split('\t').length !== samples.length + 9) throw new Error('VCF sample column count does not match the header.');
    const variant = parser.parseLine(line);
    if (!variant.FORMAT?.split(':').includes('GT')) throw new Error('Every VCF record must contain GT calls.');
    const genotypes = variant.GENOTYPES();
    for (const sample of samples) {
      const gt = genotypes[sample.id];
      if (!gt) {
        sample.variants.push(null);
        continue;
      }
      const alleles = gt.split(/[|/]/);
      if (alleles.some(a => a !== '.' && (!/^\d+$/.test(a) || Number(a) > (variant.ALT?.length ?? 0)))) {
        throw new Error(`Invalid GT call for ${sample.id} at ${variant.CHROM}:${variant.POS}.`);
      }
      if (alleles.includes('.')) { sample.variants.push(null); continue; }
      // Compare unordered genotype calls, not phase or inferred haplotypes.
      sample.variants.push(alleles.map(Number).sort((a, b) => a - b).join('/'));
    }
  }
  if (!samples[0].variants.length) throw new Error('VCF has no variant records.');
  return { samples, kind: 'variants' };
}

export function parseDistanceMatrix(input) {
  const data = typeof input === 'string' ? JSON.parse(input) : input;
  if (!data || !Array.isArray(data.ids)) throw new Error('Distance JSON requires ids and matrix arrays.');
  const samples = data.ids.map(id => ({ id }));
  validateSamples(samples);
  const n = samples.length;
  if (!Array.isArray(data.matrix) || data.matrix.length !== n || data.matrix.some(row => !Array.isArray(row) || row.length !== n)) {
    throw new Error('Distance matrix must be square and match the IDs.');
  }
  const diagonal = data.matrix.map((row, index) => row[index]);
  const matrixType = diagonal.every(value => value === 0) ? 'dissimilarity'
    : diagonal.every(value => value === 1) ? 'similarity' : null;
  if (!matrixType) throw new Error('Matrix diagonal must contain only zeros (dissimilarity) or only ones (similarity).');
  const matrix = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const value = data.matrix[i][j];
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) throw new Error('Matrix values must be numbers between 0 and 1.');
      if (Math.abs(value - data.matrix[j][i]) > 1e-10) throw new Error('Distance matrix must be symmetric.');
      matrix[i * n + j] = matrixType === 'similarity' ? 1 - value : value;
    }
  }
  return { samples, matrix, kind: 'matrix', matrixType: 'dissimilarity', inputMatrixType: matrixType, matrixIsNormalized: true };
}

const METADATA_ID_ALIASES = new Set(['id', 'sampleid', 'sampleidentifier', 'isolateid', 'specimenid', 'taxonid']);

function normalizeColumnName(value) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isDateValue(value) {
  if (value instanceof Date) return Number.isFinite(value.getTime());
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:[Tt ][0-9:.+-]+Z?)?$/.test(value)) return false;
  return Number.isFinite(Date.parse(value));
}

export function parseMetadata(text) {
  const rows = (text.split(/\r?\n/)[0].includes('\t') ? tsvParse : csvParse)(text.replace(/^\uFEFF/, ''));
  const idColumns = rows.columns.filter(column => METADATA_ID_ALIASES.has(normalizeColumnName(column)));
  if (!idColumns.length) throw new Error('Metadata must have a sample ID column (for example: id, sample_id, or isolate_id).');
  const idColumn = idColumns.length === 1 ? idColumns[0] : null;
  if (!idColumn) throw new Error(`Metadata has ambiguous sample ID columns: ${idColumns.join(', ')}.`);
  const columns = rows.columns.filter(column => column !== idColumn);
  const normalizedRows = rows.map(row => ({ id: row[idColumn], ...Object.fromEntries(columns.map(column => [column, row[column]])) }));
  validateSamples(normalizedRows);
  // convert numeric columns to numbers, but leave non-numeric columns as strings
  return normalizedRows.map(row => Object.fromEntries(Object.entries(row).map(([key, value]) => [key,
    key !== 'id' && !isDateValue(value) && value.trim() && Number.isFinite(Number(value)) ? Number(value) : value,
  ])));
}

export function parseDataset(text, format) {
  if (format === 'fasta') return parseFasta(text);
  if (format === 'vcf') return parseVcf(text);
  if (format === 'matrix') return parseDistanceMatrix(text);
  throw new Error(`Unsupported input format: ${format}.`);
}

// the following functions implement bit packing to enable fast bitwise distance calculations for aligned DNA sequences, but are not used for variant or distance matrix datasets

// count the number of set bits in a 32-bit integer using the Hamming weight algorithm.
function popcount32(x) {
  x -= (x >>> 1) & 0x55555555;
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

// pack a DNA sequence into a Uint32Array of 2-bit values
export function packDNA(sequence) {
  // Keep this boundary safe because packDNA is also exported as a core helper.
  if (typeof sequence !== 'string' || !sequence.length) throw new Error('DNA sequence must be a nonempty string.');
  const packed = new Uint32Array(Math.ceil(sequence.length / 16));
  const valid = new Uint32Array(packed.length);
  for (let i = 0; i < sequence.length; i++) {
    const base = sequence[i].toUpperCase();
    if (base in BASES) {
      packed[i >> 4] |= BASES[base] << ((i % 16) * 2);
      valid[i >> 4] |= 1 << ((i % 16) * 2);
    } else if (!MISSING.test(base)) throw new Error(`Invalid DNA base "${base}".`);
  }
  return { packed, valid, length: sequence.length };
}

// compute the proportion of mismatches between two packed DNA sequences, ignoring missing sites
export function distancePacked(a, b) {
  // Keep this boundary safe because distancePacked is also exported as a core helper.
  if (a.length !== b.length) throw new Error('Packed sequences must have equal lengths.');
  let mismatches = 0;
  let compared = 0;
  for (let i = 0; i < a.packed.length; i++) {
    const mask = a.valid[i] & b.valid[i];
    const diff = a.packed[i] ^ b.packed[i];
    mismatches += popcount32((diff | (diff >>> 1)) & mask);
    compared += popcount32(mask);
  }
  if (!compared) throw new Error('A sample pair has no jointly called sites.');
  return mismatches / compared;
}

export function buildDistanceMatrix(samples, metric = 'bitwise') {
  validateSamples(samples);
  if (!['bitwise', 'proportion'].includes(metric)) throw new Error('Unknown distance metric.');
  const n = samples.length;
  const alignment = samples[0].sequence !== undefined;
  if (alignment && samples.some(s => typeof s.sequence !== 'string' || /[^ACGTNRYWSKMBDHV?.-]/i.test(s.sequence))) throw new Error('Expected valid DNA sequences for every sample.');
  const sequences = samples.map(s => alignment ? s.sequence.toUpperCase() : s.variants);
  if (sequences.some(s => !s?.length || s.length !== sequences[0].length)) throw new Error('Samples must have equally sized nonempty profiles.');
  const packed = alignment && metric === 'bitwise' ? sequences.map(packDNA) : null;
  const matrix = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      let distance;
      if (packed) distance = distancePacked(packed[i], packed[j]);
      else {
        let compared = 0;
        let mismatches = 0;
        for (let k = 0; k < sequences[i].length; k++) {
          const a = sequences[i][k], b = sequences[j][k];
          if (a == null || b == null || (alignment && (MISSING.test(a) || MISSING.test(b)))) continue;
          compared++;
          if (a !== b) mismatches++;
        }
        if (!compared) throw new Error(`No jointly called sites between ${samples[i].id} and ${samples[j].id}.`);
        distance = mismatches / compared;
      }
      matrix[i * n + j] = matrix[j * n + i] = distance;
    }
  }
  return matrix;
}

export function graphFromDistanceMatrix(samples, matrix) {
  validateSamples(samples);
  // Graphology 0.26 uses plain objects for adjacency and cannot safely handle these IDs.
  if (samples.some(s => Object.hasOwn(Object.prototype, s.id))) throw new Error('Sample IDs cannot be reserved JavaScript object property names.');
  const n = samples.length;
  if (matrix.length !== n * n) throw new Error('Matrix size does not match samples.');
  const graph = new Graph({ type: 'undirected' });
  samples.forEach(({ id, ...attrs }) => graph.addNode(id, { ...attrs, id }));
  for (let i = 0; i < n; i++) {
    if (matrix[i * n + i] !== 0) throw new Error('Distance matrix diagonal must be zero.');
    for (let j = i + 1; j < n; j++) {
      const weight = matrix[i * n + j];
      if (!Number.isFinite(weight) || weight < 0 || weight > 1 || Math.abs(weight - matrix[j * n + i]) > 1e-10 || !Number.isFinite(matrix[j * n + i])) {
        throw new Error('Expected a symmetric normalized dissimilarity matrix.');
      }
      graph.addUndirectedEdgeWithKey(`e${i}-${j}`, samples[i].id, samples[j].id, { weight, similarity: 1 - weight });
    }
  }
  return graph;
}

function unionFind(nodes) {
  const parent = new Map(nodes.map(id => [id, id]));
  function find(id) {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root);
    while (id !== root) {
      const next = parent.get(id);
      parent.set(id, root);
      id = next;
    }
    return root;
  }
  return { find, union(a, b) {
    const ra = find(a), rb = find(b);
    if (ra === rb) return false;
    parent.set(rb, ra);
    return true;
  } };
}

// unused Kruskal's algorithm
function computeMSNKruskal(graph, { includeTies = false } = {}) {
  const edges = graph.edges().map(key => ({ key, weight: graph.getEdgeAttribute(key, 'weight'), pair: JSON.stringify(graph.extremities(key).sort()) }));
  if (edges.some(e => !Number.isFinite(e.weight) || e.weight < 0)) throw new Error('Edge weights must be finite nonnegative distances.');
  edges.sort((a, b) => a.weight - b.weight || (a.pair < b.pair ? -1 : a.pair > b.pair ? 1 : 0));
  const uf = unionFind(graph.nodes());
  const mst = new Graph({ type: 'undirected' });
  graph.forEachNode((id, attrs) => mst.addNode(id, { ...attrs }));
  for (let i = 0; i < edges.length;) {
    let end = i + 1;
    while (end < edges.length && edges[end].weight === edges[i].weight) end++;
    const tied = edges.slice(i, end);
    if (includeTies) {
      const eligible = tied.filter(({ key }) => {
        const [source, target] = graph.extremities(key);
        return uf.find(source) !== uf.find(target);
      });
      for (const { key } of eligible) {
        const [source, target] = graph.extremities(key);
        mst.addUndirectedEdgeWithKey(key, source, target, { ...graph.getEdgeAttributes(key) });
      }
      for (const { key } of eligible) {
        const [source, target] = graph.extremities(key);
        uf.union(source, target);
      }
    } else {
      for (const { key } of tied) {
        const [source, target] = graph.extremities(key);
        if (uf.union(source, target)) mst.addUndirectedEdgeWithKey(key, source, target, { ...graph.getEdgeAttributes(key) });
      }
    }
    if (graph.order && graph.nodes().every(id => uf.find(id) === uf.find(graph.nodes()[0]))) break;
    i = end;
  }
  if (graph.order > 1 && graph.nodes().some(id => uf.find(id) !== uf.find(graph.nodes()[0]))) throw new Error('Cannot construct a spanning tree from a disconnected graph.');
  return { mst, mstEdgeKeys: new Set(mst.edges()) };
}

function pairKey(a, b) {
  return JSON.stringify(a < b ? [a, b] : [b, a]);
}

function primFromAccessors(nodeIds, getWeight, getEdgeAttributes) {
  const mst = new Graph({ type: 'undirected' });
  for (const id of nodeIds) mst.addNode(id, { ...getEdgeAttributes.node(id) });
  if (nodeIds.length < 2) return { mst, mstEdgeKeys: new Set() };

  const root = [...nodeIds].sort()[0];
  const included = new Set([root]);
  const best = new Map(nodeIds.map(id => [id, Infinity]));
  const parent = new Map();
  for (const id of nodeIds) {
    if (id === root) continue;
    const weight = getWeight(root, id);
    if (Number.isFinite(weight)) {
      best.set(id, weight);
      parent.set(id, root);
    }
  }

  while (included.size < nodeIds.length) {
    let next;
    for (const id of nodeIds) {
      if (included.has(id) || !Number.isFinite(best.get(id))) continue;
      if (next === undefined || best.get(id) < best.get(next)
        || (best.get(id) === best.get(next) && pairKey(parent.get(id), id) < pairKey(parent.get(next), next))) next = id;
    }
    if (next === undefined) throw new Error('Cannot construct a spanning tree from a disconnected graph.');

    const source = parent.get(next), key = `e${JSON.stringify([source, next])}`;
    mst.addUndirectedEdgeWithKey(key, source, next, { ...getEdgeAttributes.edge(source, next), weight: best.get(next) });
    included.add(next);

    for (const id of nodeIds) {
      if (included.has(id)) continue;
      const weight = getWeight(next, id);
      if (!Number.isFinite(weight) || weight < 0) continue;
      const current = best.get(id), currentParent = parent.get(id);
      if (weight < current || (weight === current && (currentParent === undefined || pairKey(next, id) < pairKey(currentParent, id)))) {
        best.set(id, weight);
        parent.set(id, next);
      }
    }
  }
  return { mst, mstEdgeKeys: new Set(mst.edges()) };
}

export function computeMSN(graph, { includeTies = false } = {}) {
  if (graph.type !== 'undirected') throw new Error('MSN input must be undirected.');
  if (includeTies) return computeMSNKruskal(graph, { includeTies });
  const weights = new Map();
  graph.forEachEdge((key, attrs, source, target) => {
    if (!Number.isFinite(attrs.weight) || attrs.weight < 0) throw new Error('Edge weights must be finite nonnegative distances.');
    weights.set(graph.edge(source, target), attrs.weight);
  });
  return primFromAccessors(graph.nodes(), (source, target) => {
    const key = graph.edge(source, target);
    return key === undefined ? Infinity : weights.get(key);
  }, {
    node: id => graph.getNodeAttributes(id),
    edge: (source, target) => graph.getEdgeAttributes(graph.edge(source, target)),
  });
}

export function computeMSNFromDistanceMatrix(samples, matrix, { includeTies = false } = {}) {
  validateSamples(samples);
  const n = samples.length;
  if (!matrix || matrix.length !== n * n) throw new Error('Matrix size does not match samples.');
  if (samples.some(sample => Object.hasOwn(Object.prototype, sample.id))) throw new Error('Sample IDs cannot be reserved JavaScript object property names.');
  const ids = samples.map(sample => sample.id);
  const indexById = new Map(ids.map((id, index) => [id, index]));
  const weightAt = (i, j) => matrix[i * n + j];
  for (let i = 0; i < n; i++) {
    if (weightAt(i, i) !== 0) throw new Error('Distance matrix diagonal must be zero.');
    for (let j = i + 1; j < n; j++) {
      const weight = weightAt(i, j);
      const reverse = weightAt(j, i);
      if (!Number.isFinite(weight) || weight < 0 || weight > 1 || !Number.isFinite(reverse) || reverse < 0 || reverse > 1 || Math.abs(weight - reverse) > 1e-10) {
        throw new Error('Expected a symmetric finite dissimilarity matrix.');
      }
    }
  }
  if (includeTies) return computeMSNKruskal(graphFromDistanceMatrix(samples, matrix), { includeTies });
  return primFromAccessors(ids, (source, target) => weightAt(indexById.get(source), indexById.get(target)), {
    node: id => ({ ...samples[indexById.get(id)] }),
    edge: (source, target) => {
      const weight = weightAt(indexById.get(source), indexById.get(target));
      return { weight, similarity: 1 - weight };
    },
  });
}

export function buildCompleteLinkage(ids, distanceMatrix, maxDissimilarity = 1) {
  if (!Number.isFinite(maxDissimilarity) || maxDissimilarity < 0 || maxDissimilarity > 1) throw new Error('Maximum dissimilarity must be between 0 and 1.');
  if (!Array.isArray(ids) || new Set(ids).size !== ids.length || ids.some(id => typeof id !== 'string')) {
    throw new Error('Complete-linkage clustering requires unique string IDs.');
  }
  const n = ids.length;
  if (!distanceMatrix || distanceMatrix.length !== n * n) throw new Error('Distance matrix size does not match clustering IDs.');
  const cutoff = maxDissimilarity;
  const distanceAtInput = (a, b) => distanceMatrix[a * n + b];
  for (let i = 0; i < n; i++) {
    if (distanceAtInput(i, i) !== 0) throw new Error('Dissimilarity matrix diagonal must be zero.');
    for (let j = i + 1; j < n; j++) {
      const value = distanceAtInput(i, j);
      const reverse = distanceAtInput(j, i);
      if (!Number.isFinite(value) || value < 0 || value > 1 || !Number.isFinite(reverse) || reverse < 0 || reverse > 1 || Math.abs(value - reverse) > 1e-10) {
        throw new Error('Complete-linkage clustering requires a symmetric dissimilarity matrix in [0, 1].');
      }
    }
  }
  if (!n) return { ids: [], merges: [], completeThrough: maxDissimilarity };

  const total = Math.max(1, 2 * n - 1);
  const packedDistances = new Float64Array(total * (total - 1) / 2);
  const packedIndex = (a, b) => {
    if (a > b) [a, b] = [b, a];
    return b * (b - 1) / 2 + a;
  };
  const getDistance = (a, b) => a === b ? 0 : packedDistances[packedIndex(a, b)];
  const setDistance = (a, b, value) => { packedDistances[packedIndex(a, b)] = value; };

  // At most n² pairs are inserted over the full agglomeration. Typed arrays
  // keep the heap bounded without allocating one object per pair.
  const heapCapacity = Math.max(1, n * n);
  const heapWeights = new Float64Array(heapCapacity);
  const heapA = new Uint32Array(heapCapacity);
  const heapB = new Uint32Array(heapCapacity);
  const labels = Array(total);
  const active = new Uint8Array(total);
  const merges = [];
  let heapSize = 0;
  const pairLess = (weightA, a1, b1, weightB, a2, b2) => {
    if (weightA !== weightB) return weightA < weightB;
    const firstA = labels[a1] < labels[b1] ? labels[a1] : labels[b1];
    const secondA = labels[a1] < labels[b1] ? labels[b1] : labels[a1];
    const firstB = labels[a2] < labels[b2] ? labels[a2] : labels[b2];
    const secondB = labels[a2] < labels[b2] ? labels[b2] : labels[a2];
    return firstA < firstB || (firstA === firstB && secondA < secondB);
  };
  const push = (weight, a, b) => {
    if (heapSize >= heapCapacity) throw new Error('Complete-linkage priority queue capacity exceeded.');
    let index = heapSize++;
    while (index > 0) {
      const parentIndex = (index - 1) >> 1;
      if (!pairLess(weight, a, b, heapWeights[parentIndex], heapA[parentIndex], heapB[parentIndex])) break;
      heapWeights[index] = heapWeights[parentIndex]; heapA[index] = heapA[parentIndex]; heapB[index] = heapB[parentIndex];
      index = parentIndex;
    }
    heapWeights[index] = weight; heapA[index] = a; heapB[index] = b;
  };
  const pop = () => {
    const result = [heapWeights[0], heapA[0], heapB[0]];
    const last = --heapSize;
    if (last > 0) {
      const weight = heapWeights[last], a = heapA[last], b = heapB[last];
      let index = 0;
      while (true) {
        const left = index * 2 + 1;
        if (left >= last) break;
        const right = left + 1;
        const child = right < last && pairLess(heapWeights[right], heapA[right], heapB[right], heapWeights[left], heapA[left], heapB[left]) ? right : left;
        if (!pairLess(heapWeights[child], heapA[child], heapB[child], weight, a, b)) break;
        heapWeights[index] = heapWeights[child]; heapA[index] = heapA[child]; heapB[index] = heapB[child];
        index = child;
      }
      heapWeights[index] = weight; heapA[index] = a; heapB[index] = b;
    }
    return result;
  };

  for (let i = 0; i < n; i++) {
    labels[i] = ids[i]; active[i] = 1;
    for (let j = i + 1; j < n; j++) {
      const distance = distanceAtInput(i, j);
      setDistance(i, j, distance);
      if (distance <= cutoff + 1e-12) push(distance, i, j);
    }
  }

  let activeCount = n, next = n;
  while (heapSize && activeCount > 1) {
    const [distance, a, b] = pop();
    if (!active[a] || !active[b]) continue;
    if (distance > cutoff + 1e-12) break;
    const merged = next++;
    labels[merged] = labels[a] < labels[b] ? labels[a] : labels[b];
    active[a] = active[b] = 0; active[merged] = 1;
    merges.push({ id: merged, a, b, distance });
    activeCount--;
    for (let other = 0; other < merged; other++) {
      if (!active[other]) continue;
      const mergedDistance = Math.max(getDistance(a, other), getDistance(b, other));
      setDistance(merged, other, mergedDistance);
      if (mergedDistance <= cutoff + 1e-12) push(mergedDistance, other, merged);
    }
  }

  return { ids: [...ids], merges, completeThrough: maxDissimilarity };
}

export function cutCompleteLinkage(linkage, similarity = 0.95) {
  if (!Number.isFinite(similarity) || similarity < 0 || similarity > 1) throw new Error('Similarity threshold must be between 0 and 1.');
  if (!linkage || !Array.isArray(linkage.ids) || !Array.isArray(linkage.merges)
    || !Number.isFinite(linkage.completeThrough) || linkage.completeThrough < 0 || linkage.completeThrough > 1) {
    throw new Error('Invalid complete-linkage hierarchy.');
  }
  if (1 - similarity > linkage.completeThrough + 1e-12) throw new Error('Complete-linkage hierarchy does not cover this similarity threshold.');
  const ids = linkage.ids, n = ids.length, total = Math.max(1, 2 * n - 1);
  const parent = Int32Array.from({ length: total }, (_, index) => index);
  const find = id => {
    let root = id;
    while (parent[root] !== root) root = parent[root];
    while (id !== root) { const next = parent[id]; parent[id] = root; id = next; }
    return root;
  };
  const union = (a, b) => { const rootA = find(a), rootB = find(b); if (rootA !== rootB) parent[rootB] = rootA; };
  const cutoff = 1 - similarity;
  for (const merge of linkage.merges) {
    if (merge.distance > cutoff + 1e-12) break;
    union(merge.a, merge.b);
    union(merge.id, merge.a);
  }
  const roots = new Map();
  ids.forEach((id, index) => {
    const root = find(index);
    if (!roots.has(root)) roots.set(root, { minId: id, members: [] });
    const cluster = roots.get(root);
    if (id < cluster.minId) cluster.minId = id;
    cluster.members.push(id);
  });
  const finalClusters = [...roots.values()].sort((a, b) => a.minId.localeCompare(b.minId));
  const clusters = new Map();
  finalClusters.forEach((cluster, index) => cluster.members.forEach(id => clusters.set(id, `C${index + 1}`)));
  return clusters;
}

export function clusterByCompleteLinkage(ids, distanceMatrix, similarity = 0.95) {
  if (!Number.isFinite(similarity) || similarity < 0 || similarity > 1) throw new Error('Similarity threshold must be between 0 and 1.');
  return cutCompleteLinkage(buildCompleteLinkage(ids, distanceMatrix, 1 - similarity), similarity);
}

export function clusterByThreshold(mst, similarity = 0.95) {
  if (!Number.isFinite(similarity) || similarity < 0 || similarity > 1) throw new Error('Similarity threshold must be between 0 and 1.');
  // union-find to identify connected components in the minimum spanning tree
  const uf = unionFind(mst.nodes());
  // edges with weight <= 1 - similarity are considered connected
  mst.forEachEdge((key, attrs, source, target) => {
    if (attrs.weight <= 1 - similarity + 1e-12) {
      uf.union(source, target);
    }
  });
  const roots = new Map();
  const clusters = new Map();
  for (const id of mst.nodes().sort()) {
    const root = uf.find(id);
    if (!roots.has(root)) roots.set(root, `C${roots.size + 1}`);
    clusters.set(id, roots.get(root));
  }
  return clusters;
}

export function summarizeMetadata(records) {
  const keys = [...new Set(records.flatMap(row => Object.keys(row)))].filter(key => key !== 'id');
  // for each metadata column, determine if it is numeric or categorical and compute summary statistics
  return Object.fromEntries(keys.map(key => {
    const values = records.map(row => row[key]).filter(v => v !== undefined && v !== null && v !== '');
    if (values.length && values.every(isDateValue)) {
      const times = values.map(value => value instanceof Date ? value.getTime() : Date.parse(value));
      return [key, { type: 'date', count: values.length, missing: records.length - values.length,
        min: new Date(Math.min(...times)).toISOString(), max: new Date(Math.max(...times)).toISOString() }];
    }
    if (values.length && values.every(v => typeof v === 'number' && Number.isFinite(v))) {
      const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
      return [key, { type: 'numeric', count: values.length, missing: records.length - values.length, mean,
        variance: values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length }];
    }
    const counts = new Map();
    // count the occurrences of each unique value in the metadata column
    for (const value of values) counts.set(String(value), (counts.get(String(value)) ?? 0) + 1);
    return [key, { type: 'categorical', count: values.length, missing: records.length - values.length,
      proportions: Object.fromEntries([...counts].map(([value, count]) => [value, count / values.length])) }];
  }));
}

export function collapseToClusterGraph(mst, clusterMap) {
  const collapsed = new Graph({ type: 'undirected' });
  const groups = new Map();
  mst.forEachNode((id, attrs) => {
    const cluster = clusterMap instanceof Map ? clusterMap.get(id) : clusterMap[id];
    if (cluster === undefined) throw new Error(`Missing cluster assignment for ${id}.`);
    const key = String(cluster);
    if (!groups.has(key)) groups.set(key, { members: [], sampleIds: [], records: [], frequency: 0, missingSum: 0 });
    const group = groups.get(key);
    const frequency = attrs.frequency ?? 1;
    group.members.push(id);
    group.sampleIds.push(...(attrs.sampleIds ?? [id]));
    group.records.push(...(attrs.records ?? []));
    group.frequency += frequency;
    group.missingSum += (attrs.missingRate ?? 0) * frequency;
  });
  for (const [id, group] of groups) {
    const { missingSum, ...attrs } = group;
    collapsed.addNode(id, { ...attrs, id, size: group.members.length, missingRate: missingSum / group.frequency, summary: summarizeMetadata(group.records) });
  }
  mst.forEachEdge((key, attrs, source, target) => {
    const a = String(clusterMap instanceof Map ? clusterMap.get(source) : clusterMap[source]);
    const b = String(clusterMap instanceof Map ? clusterMap.get(target) : clusterMap[target]);
    if (a === b) return;
    const existing = collapsed.edge(a, b);
    if (existing === undefined) collapsed.addUndirectedEdge(a, b, { ...attrs, via: [source, target] });
    else if (attrs.weight < collapsed.getEdgeAttribute(existing, 'weight')) collapsed.replaceEdgeAttributes(existing, { ...attrs, via: [source, target] });
  });
  return collapsed;
}

export function graphologyToD3(graph) {
  return {
    nodes: graph.nodes().map(id => ({ ...graph.getNodeAttributes(id), id })),
    links: graph.edges().map(key => ({ ...graph.getEdgeAttributes(key), id: key, source: graph.source(key), target: graph.target(key) })),
  };
}

export function buildNetwork(dataset, { metric = 'bitwise', metadata = [], sampleIds, includeTies = false, maxSamples = Infinity, clusterMaxDissimilarity = 1 } = {}) {
  let { samples, kind } = dataset;
  validateSamples(samples);
  if (samples.length > maxSamples) throw new Error(`Dataset exceeds the ${maxSamples} sample limit.`);
  const allSampleIds = samples.map(sample => sample.id);
  kind ??= samples[0].sequence !== undefined ? 'alignment' : 'variants';
  if (!['alignment', 'variants', 'matrix'].includes(kind)) throw new Error('Unknown dataset kind.');
  if (kind !== 'matrix' && !['bitwise', 'proportion'].includes(metric)) throw new Error('Unknown distance metric.');
  const originalSamples = samples;
  const selectedIds = sampleIds ? new Set(sampleIds) : null;
  const matrixIndexes = selectedIds && kind === 'matrix' ? originalSamples.map((sample, index) => selectedIds.has(sample.id) ? index : -1).filter(index => index >= 0) : null;
  samples = selectedIds ? originalSamples.filter(sample => selectedIds.has(sample.id)) : originalSamples;
  if (selectedIds && !samples.length) throw new Error('The selected group contains no samples.');
  if (kind !== 'matrix') {
    samples = samples.map(sample => {
      if (kind === 'alignment') {
        if (typeof sample.sequence !== 'string' || !sample.sequence.length) throw new Error('Aligned samples require nonempty DNA sequences.');
        const sequence = sample.sequence.toUpperCase();
        if (/[^ACGTNRYWSKMBDHV?.-]/.test(sequence)) throw new Error(`Invalid DNA sequence in ${sample.id}.`);
        return { ...sample, sequence: sequence.replace(/[^ACGT]/g, 'N') };
      }
      if (!Array.isArray(sample.variants) || !sample.variants.length || sample.variants.some(v => v !== null && (typeof v !== 'string' || !v))) throw new Error('Variant samples require nonempty arrays of genotype strings or null calls.');
      return sample;
    });
    const lengths = samples.map(s => (s.sequence ?? s.variants).length);
    if (lengths.some(length => length !== lengths[0])) throw new Error('Sample profiles must have equal lengths.');
  }
  validateSamples(metadata.length ? metadata : [{ id: '_empty' }]);
  const metadataMap = new Map(metadata.map(row => [row.id, row]));
  const allSampleIdSet = new Set(allSampleIds);
  if (metadata.length && !metadata.some(row => allSampleIdSet.has(row.id))) {
    throw new Error('At least one metadata ID must match a sample ID in the dataset.');
  }
  const unmatched = metadata.filter(row => !allSampleIdSet.has(row.id)).map(row => row.id);
  const grouped = new Map();
  const representatives = [];
  for (const sample of samples) {
    const profile = sample.sequence ?? sample.variants;
    const signature = kind === 'matrix' ? sample.id : JSON.stringify(profile);
    if (!grouped.has(signature)) {
      const missing = profile ? [...profile].filter(v => v == null || v === 'N').length / profile.length : 0;
      const node = { id: sample.id, sampleIds: [], records: [], frequency: 0, missingRate: missing };
      grouped.set(signature, node);
      representatives.push(sample);
    }
    const node = grouped.get(signature);
    node.sampleIds.push(sample.id);
    node.records.push(metadataMap.get(sample.id) ?? { id: sample.id });
    node.frequency++;
  }
  // Identical called profiles are genotype nodes; missing sites are never imputed as A.
  const nodes = [...grouped.values()];
  let matrix;
  if (kind === 'matrix') {
    const sourceMatrix = dataset.matrix;
    matrix = new Float64Array(matrixIndexes ? matrixIndexes.length ** 2 : sourceMatrix.length);
    const indexes = matrixIndexes ?? originalSamples.map((_, index) => index);
    for (let i = 0; i < indexes.length; i++) {
      for (let j = 0; j < indexes.length; j++) {
        const value = sourceMatrix[indexes[i] * originalSamples.length + indexes[j]];
        matrix[i * indexes.length + j] = value;
      }
    }
  } else matrix = buildDistanceMatrix(representatives, metric);
  const { mst } = computeMSNFromDistanceMatrix(nodes, matrix, { includeTies });
  const linkage = buildCompleteLinkage(mst.nodes(), matrix, clusterMaxDissimilarity);
  return { graph: mst, distanceMatrix: matrix, linkage, stats: { samples: samples.length, genotypes: nodes.length, edges: mst.size, unmatchedMetadata: unmatched, allSampleIds, kind, metric: kind === 'matrix' ? null : metric, includeTies } };
}
