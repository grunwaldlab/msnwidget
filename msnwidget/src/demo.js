import { msnWidget } from './index.js';
import './demo.css';

// Deterministic, modest example with repeated genotypes and geographically mixed clusters.
const reference = 'ACGT'.repeat(100);
const populations = ['Coastal', 'Valley', 'Highland'];
const samples = [], metadata = [];
for (let genotype = 0; genotype < 24; genotype++) {
  const sequence = [...reference];
  const lineage = Math.floor(genotype / 8);
  for (let i = 0; i < lineage * 32; i++) sequence[i] = 'TGCA'[i % 4];
  for (let i = 0; i < (genotype % 8) * 3; i++) sequence[180 + i] = 'TGCA'[i % 4];
  for (let member = 0; member < 1 + genotype % 4; member++) {
    const id = `S${String(samples.length + 1).padStart(3, '0')}`;
    samples.push({ id, sequence: sequence.join('') });
    metadata.push({ id, population: populations[(lineage + member) % 3], year: 2021 + genotype % 5, elevation: 40 + lineage * 250 + member * 20 });
  }
}

document.querySelector('#app').innerHTML = '<div id="widget"></div>';

const widget = msnWidget('#widget', { name: 'Three populations / demonstration', samples, kind: 'alignment', metadata }, { threshold: 0.99 });
// Handy for exploring the draft API from the browser console.
window.networkWidget = widget;
