import { test } from 'node:test';
import assert from 'node:assert/strict';
import Graph from 'graphology';
import {
  parseFasta, parseVcf, parseDistanceMatrix, parseMetadata, packDNA, distancePacked,
  buildDistanceMatrix, graphFromDistanceMatrix, computeMSN, computeMSNFromDistanceMatrix, clusterByThreshold,
  buildCompleteLinkage, cutCompleteLinkage, clusterByCompleteLinkage,
  collapseToClusterGraph, summarizeMetadata, buildNetwork, graphologyToD3,
} from '../src/network.js';

test('FASTA normalizes lowercase and ambiguity; validates alignment and IDs', () => {
  const data = parseFasta('>a description\nacgt\nNR\n>b\nACGT--');
  assert.deepEqual(data.samples, [{ id: 'a', sequence: 'ACGTNN' }, { id: 'b', sequence: 'ACGTNN' }]);
  for (const input of ['ACGT', '>a\nAC\n>b\nA', '>a\nX', '>a\nA\n>a\nT', '>a']) {
    assert.throws(() => parseFasta(input));
  }
});

test('packed comparison counts nucleotide changes once and excludes missing sites', () => {
  assert.equal(distancePacked(packDNA('ACGTN'), packDNA('TCGTA')), 0.25);
  assert.equal(distancePacked(packDNA('A'.repeat(16) + 'A'), packDNA('A'.repeat(16) + 'T')), 1 / 17);
  assert.equal(distancePacked(packDNA('ACGT'), packDNA('TGCA')), 1);
  assert.throws(() => distancePacked(packDNA('NN'), packDNA('AC')), /jointly called/);
  assert.throws(() => distancePacked(packDNA('A'), packDNA('AA')), /equal lengths/);
  assert.throws(() => packDNA('X'));
});

test('packed distances match reference dissimilarities across block boundaries', () => {
  let seed = 37;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed; };
  for (const length of [1, 15, 16, 17, 31, 32, 65, 1001]) {
    const samples = Array.from({ length: 6 }, (_, i) => ({ id: String(i), sequence: Array.from({ length }, (_, j) => j === 0 ? 'A' : 'ACGTN'[random() % 5]).join('') }));
    assert.deepEqual(buildDistanceMatrix(samples, 'bitwise'), buildDistanceMatrix(samples, 'proportion'));
  }
});

test('VCF compares unordered GT calls and treats partial calls as missing', () => {
  const input = '##fileformat=VCFv4.2\n##FORMAT=<ID=GT,Number=1,Type=String,Description="Genotype">\n#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\tFORMAT\ta\tb\n1\t1\t.\tA\tC,G\t.\tPASS\t.\tGT\t0|1\t1/0\n1\t2\t.\tA\tT\t.\tPASS\t.\tGT\t0/.\t1/1';
  const data = parseVcf(input);
  assert.deepEqual(data.samples[0].variants, ['0/1', null]);
  assert.deepEqual(data.samples[1].variants, ['0/1', '1/1']);
  assert.equal(buildDistanceMatrix(data.samples)[1], 0);
  assert.throws(() => parseVcf(input.replace('1/1', '2/2')), /Invalid GT/);
  assert.throws(() => parseVcf(input.replace('0/.', '99/.')), /Invalid GT/);
  assert.throws(() => parseVcf(input.replace('0|1\t1/0', '0|1')), /column count/);
});

test('distance matrices infer similarity or dissimilarity from their diagonal', () => {
  assert.deepEqual([...parseDistanceMatrix({ ids: ['a', 'b'], matrix: [[0, 0.3], [0.3, 0]] }).matrix], [0, 0.3, 0.3, 0]);
  for (const matrix of [[[0, -1], [-1, 0]], [[0, 0.2], [0.3, 0]], [[0, 2], [2, 0]], [[0, '0.3'], ['0.3', 0]], [[0, null], [null, 0]], [[0], [0]]]) {
    assert.throws(() => parseDistanceMatrix({ ids: ['a', 'b'], matrix }));
  }
  assert.deepEqual([...parseDistanceMatrix({ ids: ['a', 'b'], matrix: [[1, 0.7], [0.7, 1]] }).matrix], [0, 0.30000000000000004, 0.30000000000000004, 0]);
  assert.throws(() => parseDistanceMatrix({ ids: ['a', 'b'], matrix: [[0, 0.7], [0.7, 1]] }), /diagonal/);
});

test('Prim minimizes dissimilarity and single-linkage thresholding uses the inverse cutoff', () => {
  const data = parseDistanceMatrix({ ids: ['a', 'b', 'c'], matrix: [[0, 0.1, 0.9], [0.1, 0, 0.2], [0.9, 0.2, 0]] });
  const complete = graphFromDistanceMatrix(data.samples, data.matrix);
  const { mst } = computeMSN(complete);
  assert.equal(mst.type, 'undirected');
  assert.equal(mst.size, 2);
  assert.ok(mst.hasEdge('a', 'b')); assert.ok(mst.hasEdge('b', 'c')); assert.ok(!mst.hasEdge('a', 'c'));
  const clusters = clusterByThreshold(mst, 0.9);
  assert.equal(clusters.get('a'), clusters.get('b'));
  assert.notEqual(clusters.get('a'), clusters.get('c'));
  assert.equal(new Set(clusterByThreshold(mst, 1).values()).size, 3);
  assert.equal(new Set(clusterByThreshold(mst, 0).values()).size, 1);
  assert.throws(() => clusterByThreshold(mst, NaN));
});

test('ties yield stable endpoint choices; disconnected graphs are rejected', () => {
  const make = ids => {
    const matrix = new Float64Array(ids.length ** 2).fill(0.5);
    ids.forEach((_, i) => { matrix[i * ids.length + i] = 0; });
    const { mst } = computeMSN(graphFromDistanceMatrix(ids.map(id => ({ id })), matrix));
    return mst.edges().map(key => mst.extremities(key).sort().join('-')).sort();
  };
  assert.deepEqual(make(['a', 'b', 'c']), make(['c', 'b', 'a']));
  const tied = graphFromDistanceMatrix(['a', 'b', 'c'].map(id => ({ id })), Float64Array.from([0, 0.5, 0.5, 0.5, 0, 0.5, 0.5, 0.5, 0]));
  assert.equal(computeMSN(tied).mst.size, 2);
  assert.equal(computeMSN(tied, { includeTies: true }).mst.size, 3);
  const disconnected = new Graph({ type: 'undirected' }); disconnected.addNode('a'); disconnected.addNode('b');
  assert.throws(() => computeMSN(disconnected), /disconnected/);
});

test('dense-matrix Prim constructs an MSN with the expected minimum total weight', () => {
  const ids = ['a', 'b', 'c', 'd'];
  const matrix = Float64Array.from([
    0, 0.1, 0.8, 0.9,
    0.1, 0, 0.2, 0.7,
    0.8, 0.2, 0, 0.3,
    0.9, 0.7, 0.3, 0,
  ]);
  const { mst } = computeMSNFromDistanceMatrix(ids.map(id => ({ id })), matrix);
  assert.equal(mst.size, 3);
  assert.deepEqual(mst.edges().map(key => mst.extremities(key).sort().join('-')).sort(), ['a-b', 'b-c', 'c-d']);
  assert.ok(Math.abs(mst.edges().reduce((sum, key) => sum + mst.getEdgeAttribute(key, 'weight'), 0) - 0.6) < 1e-12);
});

test('complete-linkage clustering uses the farthest cross-cluster distance', () => {
  const ids = ['a', 'b', 'c'];
  const matrix = Float64Array.from([0, 0.1, 0.1, 0.1, 0, 0.2, 0.1, 0.2, 0]);
  const clusters = clusterByCompleteLinkage(ids, matrix, 0.85);
  assert.equal(clusters.get('a'), clusters.get('b'));
  assert.notEqual(clusters.get('a'), clusters.get('c'));
  assert.equal(new Set(clusterByCompleteLinkage(ids, matrix, 0.8).values()).size, 1);
  const hierarchy = buildCompleteLinkage(ids, matrix, 0.15);
  assert.deepEqual(cutCompleteLinkage(hierarchy, 0.85), clusters);
  assert.equal(new Set(cutCompleteLinkage(hierarchy, 0.9).values()).size, 2);
  assert.throws(() => cutCompleteLinkage(hierarchy, 0.8), /does not cover/);
  assert.throws(() => clusterByCompleteLinkage(ids, matrix, NaN), /threshold/);
});

test('genotype nodes preserve member IDs and metadata; matrix nodes stay distinct', () => {
  const dataset = parseFasta('>a\nACGT\n>b\nACGT\n>c\nTCGT');
  const result = buildNetwork(dataset, { metadata: [{ id: 'a', population: 'North' }, { id: 'b', population: 'South' }, { id: 'unknown' }] });
  assert.equal(result.graph.order, 2);
  assert.deepEqual(result.graph.getNodeAttribute('a', 'sampleIds'), ['a', 'b']);
  assert.equal(result.graph.getNodeAttribute('a', 'frequency'), 2);
  assert.deepEqual(result.stats.unmatchedMetadata, ['unknown']);
  const matrix = parseDistanceMatrix({ ids: ['a', 'b'], matrix: [[0, 0], [0, 0]] });
  assert.equal(buildNetwork(matrix).graph.order, 2);
  assert.throws(() => buildNetwork(dataset, { maxSamples: 2 }), /limit/);
});

test('group selection rebuilds the genotype network from only the selected samples', () => {
  const dataset = parseFasta('>a1\nAAAA\n>b1\nAAAA\n>a2\nAAAT\n>b2\nTTTT');
  const metadata = [
    { id: 'a1', group: 'A' }, { id: 'b1', group: 'B' },
    { id: 'a2', group: 'A' }, { id: 'b2', group: 'B' },
  ];
  const result = buildNetwork(dataset, { metadata, sampleIds: ['a1', 'a2'] });
  assert.equal(result.stats.samples, 2);
  assert.equal(result.stats.genotypes, 2);
  assert.deepEqual(result.stats.allSampleIds, ['a1', 'b1', 'a2', 'b2']);
  assert.deepEqual(result.graph.nodes().sort(), ['a1', 'a2']);
  assert.deepEqual(result.graph.getNodeAttribute('a1', 'sampleIds'), ['a1']);
});

test('group selection extracts the matching rows and columns from a precomputed matrix', () => {
  const dataset = parseDistanceMatrix({
    ids: ['a', 'b', 'c'],
    matrix: [[0, 0.4, 0.2], [0.4, 0, 0.3], [0.2, 0.3, 0]],
  });
  const result = buildNetwork(dataset, { sampleIds: ['a', 'c'] });
  assert.deepEqual(result.graph.nodes().sort(), ['a', 'c']);
  assert.equal(result.graph.getEdgeAttribute(result.graph.edges()[0], 'weight'), 0.2);
  assert.deepEqual(result.stats.allSampleIds, ['a', 'b', 'c']);
});

test('cluster aggregation has sample-weighted missing rates and metadata summaries', () => {
  const graph = new Graph({ type: 'undirected' });
  graph.addNode('a', { frequency: 3, missingRate: 0.1, sampleIds: ['a1', 'a2', 'a3'], records: [{ id: 'a1', age: 2, pop: 'North' }, { id: 'a2', age: 4, pop: 'North' }, { id: 'a3', age: 6, pop: 'South' }] });
  graph.addNode('b', { frequency: 1, missingRate: 0.5, sampleIds: ['b1'], records: [{ id: 'b1', age: 8, pop: 'South' }] });
  graph.addUndirectedEdge('a', 'b', { weight: 0.1 });
  const collapsed = collapseToClusterGraph(graph, new Map([['a', 'C1'], ['b', 'C1']]));
  const node = collapsed.getNodeAttributes('C1');
  assert.equal(node.frequency, 4); assert.equal(node.sampleIds.length, 4);
  assert.ok(Math.abs(node.missingRate - 0.2) < 1e-12);
  assert.equal(node.summary.age.mean, 5); assert.equal(node.summary.age.variance, 5);
  assert.deepEqual(node.summary.pop.proportions, { North: 0.5, South: 0.5 });
  assert.throws(() => collapseToClusterGraph(graph, new Map()), /Missing cluster/);
  assert.equal(graphologyToD3(graph).links[0].source, 'a');
});

test('metadata CSV supports quoting, numeric conversion, and missing values; reserved graph IDs fail clearly', () => {
  const rows = parseMetadata('sample_id,population,age\n__proto__,"North, coastal",2\nb,South,');
  assert.equal(rows[0].population, 'North, coastal'); assert.equal(rows[0].age, 2);
  assert.equal(summarizeMetadata(rows).age.missing, 1);
  assert.throws(() => parseMetadata('sample,value\na,1'), /sample ID column/);
  assert.throws(() => parseMetadata('id,sample_id,value\na,a,1'), /ambiguous/);
  assert.throws(() => parseMetadata('id,x\na,1\na,2'), /unique/);
  assert.throws(() => buildNetwork(parseFasta('>a\nAC\n>b\nAT'), { metadata: [{ id: 'outside' }] }), /At least one metadata ID/);
  const dates = parseMetadata('id,collected\na,2024-01-03\nb,2024-02-10');
  assert.equal(typeof dates[0].collected, 'string');
  assert.deepEqual(summarizeMetadata(dates).collected, { type: 'date', count: 2, missing: 0, min: '2024-01-03T00:00:00.000Z', max: '2024-02-10T00:00:00.000Z' });
  const dataset = parseFasta('>__proto__\nAC\n>constructor\nAT');
  assert.throws(() => buildNetwork(dataset), /reserved/);
});

test('direct dataset inputs are validated even when identical profiles collapse to one node', () => {
  assert.throws(() => buildNetwork({ samples: [{ id: 'a', sequence: 'X' }] }), /Invalid DNA/);
  assert.throws(() => buildNetwork({ samples: [{ id: 'a', sequence: 'A' }, { id: 'b', sequence: 'AA' }] }), /equal lengths/);
  assert.equal(buildNetwork({ samples: [{ id: 'a', sequence: 'acgR' }, { id: 'b', sequence: 'ACGN' }] }).graph.order, 1);
});
