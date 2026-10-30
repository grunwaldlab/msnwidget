import { buildNetwork, parseDataset } from './network.js';

self.onmessage = ({ data }) => {
  try {
    const dataset = data.text !== undefined ? parseDataset(data.text, data.format) : data.dataset;
    const result = buildNetwork(dataset, data.options);
    self.postMessage({ graph: result.graph.export(), stats: result.stats, linkage: result.linkage });
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};
