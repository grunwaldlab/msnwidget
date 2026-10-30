import * as d3 from 'd3';
import Graph from 'graphology';
import { buildNetwork, cutCompleteLinkage, collapseToClusterGraph, graphologyToD3, parseDataset, parseMetadata, summarizeMetadata } from './network.js';
import './widget.css';

const MISSING_COLOR = '#808080';
const MAX_CATEGORIES = 10;
const MIN_WIDGET_THRESHOLD = 0.9;

function isDateValue(value) {
  if (value instanceof Date) return Number.isFinite(value.getTime());
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}(?:[Tt ][0-9:.+-]+Z?)?$/.test(value) && Number.isFinite(Date.parse(value));
}

/** Create an independent widget. Construction prefers a cancellable module worker, with a synchronous fallback. */
export function msnWidget(container, datasets = [], options = {}) {
  const host = typeof container === 'string' ? document.querySelector(container) : container;
  if (!host) throw new Error('Widget container was not found.');
  const root = document.createElement('section');
  root.className = 'msnw';
  root.innerHTML = `
      <div class="msnw-toolbar">
        <div class="msnw-toggle-container">
          <button type="button" class="msnw-menu-toggle" data-action="toggle-toolbar" title="Toggle control panel" aria-label="Toggle control panel" aria-expanded="true">
            <svg width="16" height="16" viewBox="0 0 16 16" class="msnw-toggle-arrow" aria-hidden="true">
              <path d="M8 4 L12 8 L8 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" transform="rotate(-90 8 8)"/>
            </svg>
            <svg width="16" height="16" viewBox="0 0 16 16" class="msnw-hamburger-icon" aria-hidden="true">
              <line x1="2" y1="4" x2="14" y2="4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              <line x1="2" y1="8" x2="14" y2="8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              <line x1="2" y1="12" x2="14" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
        <div class="msnw-collapsible-panel">
          <nav class="msnw-tabs" aria-label="Network settings">
            <button type="button" data-tab="data" aria-expanded="true">Data</button><button type="button" data-tab="controls" aria-expanded="false">Controls</button>
            <button type="button" data-tab="labels" aria-expanded="false">Node Controls</button><button type="button" data-tab="export" aria-expanded="false">Export</button>
          </nav>
          <div class="msnw-settings">
            <div data-panel="data" class="msnw-panel">
              <label>Dataset:<select data-control="dataset"><option value="">Choose a dataset</option></select></label>
              <label class="msnw-file-button" title="Load alignment, VCF, or distance matrix"><span aria-hidden="true">+</span><span class="msnw-sr-only">Load alignment, VCF, or distance matrix</span><input data-control="input" type="file" accept=".fa,.fas,.fasta,.fna,.vcf,.json"></label>
              <label>Metadata table:<select data-control="metadata-table"><option value="">No metadata</option></select></label>
              <label class="msnw-file-button" title="Load metadata"><span aria-hidden="true">+</span><span class="msnw-sr-only">Load metadata</span><input data-control="metadata" type="file" accept=".csv,.tsv,.txt"></label>
            </div>
            <div data-panel="controls" class="msnw-panel" hidden>
              <button type="button" data-action="fit">Fit to view</button>
              <label>Zoom<input data-control="zoom" type="range" min="0.05" max="1" step="0.05" value="12"><output data-value="zoom">1×</output></label>
              <label class="msnw-check"><input type="checkbox" data-control="pan" checked>Manual zoom / pan</label>
              <label class="msnw-check"><input type="checkbox" data-control="auto" checked>Auto fit on view changes</label>
              <label class="msnw-check"><input type="checkbox" data-control="lasso">Lasso mode (or hold Shift)</label>
            </div>
            <div data-panel="labels" class="msnw-panel" hidden>
              <label>Label:<select data-control="label"><option value="id">Sample / cluster ID</option><option value="none">No labels</option></select></label>
              <label>Color:<select data-control="color"><option value="">No metadata</option></select></label>
              <label>Font:<select data-control="font"><option value="sans-serif">Sans serif</option><option value="serif">Serif</option><option value="monospace">Monospace</option></select></label>
              <label>Subset by:<select data-control="group-by"><option value="">All samples</option></select></label>
              <label>Subset:<select data-control="group-value" disabled><option value="">All groups</option></select></label>
            </div>
            <div data-panel="export" class="msnw-panel" hidden>
              <button type="button" data-action="export">Export</button>
              <label>Format<select data-control="export-format"><option value="svg">SVG</option><option value="png">PNG</option><option value="pdf">PDF</option></select></label>
              <label>Width<input data-control="export-width" type="number" min="200" max="4096" step="100" value="1200"></label>
              <label>Height<input data-control="export-height" type="number" min="200" max="4096" step="100" value="900"></label>
            </div>
          </div>
        </div>
      </div>
      <div class="msnw-notice" role="status" aria-live="polite"></div>
      <div class="msnw-plot">
      <svg class="msnw-canvas" role="img" aria-label="Interactive genotype network"></svg>
      <div class="msnw-floating">
        <label>Cluster similarity <output data-value="threshold"></output><input data-control="threshold" type="range" min="0.9" max="1" step="0.001"></label>
        <div class="msnw-view"><button type="button" data-view="collapsed" aria-pressed="false">Collapsed</button><button type="button" data-view="full" aria-pressed="true">Full network</button></div>
        <button type="button" data-action="unhide" disabled>Unhide all</button>
      </div>
      <div class="msnw-legends"></div>
      <div class="msnw-empty">Load an aligned FASTA, VCF, or similarity/dissimilarity matrix to begin.</div>
      <button type="button" class="msnw-hide" data-action="hide" hidden>Hide selection</button>
      <aside class="msnw-popup" hidden aria-label="Sample information"><button type="button" data-action="close" aria-label="Close sample information">&times;</button><div class="msnw-popup-content"></div></aside>
      </div>`;
  host.append(root);
  const find = selector => root.querySelector(selector);
  const control = name => find(`[data-control="${name}"]`);
  const collapsiblePanel = find('.msnw-collapsible-panel');
  const settings = find('.msnw-settings');
  const svg = d3.select(find('.msnw-canvas'));
  const layer = svg.append('g');
  const boundaryLayer = layer.append('g');
  const linkLayer = layer.append('g');
  const nodeLayer = layer.append('g');
  const lassoPath = svg.append('path').attr('fill', '#287b7820').attr('stroke', '#287b78').attr('stroke-width', 1.5).attr('pointer-events', 'none');
  let graph = null, stats = null, clusters = new Map(), simulation, worker, pendingReject;
  let destroyed = false, busy = false, dragging = false, request = 0, fileOperation = 0;
  let width = 1000, height = 600;
  let threshold = options.threshold ?? 0.95;
  if (!Number.isFinite(threshold) || threshold < MIN_WIDGET_THRESHOLD || threshold > 1) throw new Error('Widget cluster similarity must be between 90% and 100%.');
  let view = options.view ?? 'full';
  let activeTab = 'data', settingsOpen = true, toolbarOpen = true;
  let metadata = [], metadataTables = [], currentSource = null, allSampleIds = [], groupChoices = [];
  let linkage = null;
  let hidden = new Set(), selected = new Set(), lastSelected = null;
  let rendered = { nodes: [], links: [] }, boundaries = [], nodeSelection, boundarySelection;
  const positions = new Map();
  let colorScale = null, colorField = '';
  const datasetList = Array.isArray(datasets) ? [...datasets] : [datasets];
  const metadataByDataset = new WeakMap();
  const metadataSelectionByDataset = new WeakMap();
  const reportedErrors = new WeakSet();

  control('threshold').value = threshold;
  threshold = Number(control('threshold').value);
  const zoom = d3.zoom().scaleExtent([0.05, 12]).filter(event => {
    if (!control('pan').checked || control('lasso').checked || event.shiftKey || event.type === 'dblclick') return false;
    return !event.button && (event.type === 'wheel' || event.target === svg.node());
  }).on('zoom', event => {
    layer.attr('transform', event.transform);
    control('zoom').value = event.transform.k;
    find('[data-value="zoom"]').textContent = `${event.transform.k.toFixed(2)}×`;
    updateHideButton();
  });
  svg.call(zoom).on('dblclick.zoom', null);

  function notice(message) {
    const element = find('.msnw-notice');
    element.textContent = message;
  }

  function reportError(error) {
    if (destroyed || error?.name === 'AbortError') return;
    const reported = error instanceof Error ? error : new Error(String(error));
    if (reportedErrors.has(reported)) return;
    reportedErrors.add(reported);
    notice('');
    console.error('[MSN widget]', reported);
  }

  function setSettingsOpen(open) {
    settingsOpen = open;
    settings.hidden = !open;
    root.querySelectorAll('[data-tab]').forEach(tab => tab.setAttribute('aria-expanded', String(open && tab.dataset.tab === activeTab)));
  }

  function setToolbarOpen(open) {
    toolbarOpen = open;
    collapsiblePanel.classList.toggle('msnw-panel-collapsed', !open);
    const toggle = find('.msnw-menu-toggle');
    toggle.setAttribute('aria-expanded', String(open));
    toggle.classList.toggle('collapsed', !open);
  }

  function workerUnavailable(error) {
    const failure = new Error(error?.message || 'Worker is unavailable.');
    failure.name = 'WorkerUnavailableError';
    return failure;
  }

  async function buildOnMainThread(payload, token) {
    await new Promise(resolve => setTimeout(resolve, 0));
    if (destroyed || token !== request) throw new DOMException('Network construction cancelled.', 'AbortError');
    const dataset = payload.text !== undefined ? parseDataset(payload.text, payload.format) : payload.dataset;
    const result = buildNetwork(dataset, payload.options);
    return { graph: result.graph.export(), stats: result.stats, linkage: result.linkage };
  }

  function buildInWorker(payload) {
    return new Promise((resolve, reject) => {
      pendingReject = reject;
      try {
        worker = new Worker(new URL('./network.worker.js', import.meta.url), { type: 'module' });
        worker.onmessage = ({ data }) => data.error ? reject(new Error(data.error)) : resolve(data);
        worker.onerror = event => {
          event.preventDefault();
          reject(workerUnavailable(new Error(event.message || 'Worker could not be started.')));
        };
        worker.postMessage(payload);
      } catch (error) {
        reject(workerUnavailable(error));
      }
    });
  }

  async function buildNetworkResult(payload, token) {
    if (options.useWorker === false || typeof Worker === 'undefined') return buildOnMainThread(payload, token);
    try {
      return await buildInWorker(payload);
    } catch (error) {
      if (error.name !== 'WorkerUnavailableError') throw error;
      worker?.terminate();
      worker = null;
      pendingReject = null;
      return buildOnMainThread(payload, token);
    }
  }

  function cancelBuild() {
    worker?.terminate();
    worker = null;
    if (pendingReject) pendingReject(new DOMException('Network construction cancelled.', 'AbortError'));
    pendingReject = null;
  }

  function getGroupSampleIds() {
    const choice = groupChoices[Number(control('group-value').value)];
    if (!control('group-by').value || !control('group-value').value || !choice) return undefined;
    const records = new Map(metadata.map(row => [row.id, row]));
    return allSampleIds.filter(id => {
      const value = records.get(id)?.[control('group-by').value];
      return choice.missing ? value === undefined || value === null || value === '' : String(value) === choice.value;
    });
  }

  async function load(source, { preserveMetadata = false, sampleIds } = {}) {
    if (destroyed) throw new Error('Widget has been destroyed.');
    cancelBuild();
    fileOperation++;
    const token = ++request;
    busy = true;
    root.setAttribute('aria-busy', 'true');
    notice('Constructing genotype distances and minimum spanning network...');
    try {
      let tables = preserveMetadata ? metadataTables : metadataByDataset.get(source) ?? [];
      const activeTable = preserveMetadata ? control('metadata-table').value : metadataSelectionByDataset.get(source) ?? '0';
      if (!preserveMetadata && !metadataByDataset.has(source) && source.metadata?.length) {
        tables = source.metadata[0]?.data !== undefined ? source.metadata.map(table => ({ name: table.name ?? 'Metadata', rows: typeof table.data === 'string' ? parseMetadata(table.data) : table.data }))
          : [{ name: 'Sample metadata', rows: typeof source.metadata === 'string' ? parseMetadata(source.metadata) : source.metadata }];
      }
      const rows = preserveMetadata ? metadata : activeTable === '' ? [] : tables[Number(activeTable)]?.rows ?? [];
      const payload = { options: {
        metric: options.metric ?? 'bitwise',
        metadata: rows,
        includeTies: Boolean(options.includeTies),
        sampleIds,
        maxSamples: options.maxSamples ?? 1500,
        clusterMaxDissimilarity: 1 - MIN_WIDGET_THRESHOLD,
      } };
      if (source.fasta !== undefined) Object.assign(payload, { text: source.fasta, format: 'fasta' });
      else if (source.vcf !== undefined) Object.assign(payload, { text: source.vcf, format: 'vcf' });
      else if (source.distanceMatrix !== undefined) Object.assign(payload, { text: typeof source.distanceMatrix === 'string' ? source.distanceMatrix : JSON.stringify(source.distanceMatrix), format: 'matrix' });
      else if (source.samples) payload.dataset = source;
      else throw new Error('Dataset requires fasta, vcf, or distanceMatrix.');
      const result = await buildNetworkResult(payload, token);
      if (destroyed || token !== request) return;
      graph = Graph.from(result.graph);
      linkage = result.linkage;
      stats = result.stats;
      allSampleIds = result.stats.allSampleIds;
      currentSource = source;
      metadataTables = tables;
      metadata = rows;
      metadataByDataset.set(source, tables);
      metadataSelectionByDataset.set(source, metadata.length ? activeTable : '');
      if (!preserveMetadata) {
        control('group-by').value = '';
        control('group-value').value = '';
      }
      hidden.clear(); selected.clear(); positions.clear(); lastSelected = null;
      updateMetadataControls();
      control('metadata-table').value = activeTable;
      updateFields();
      render();
      notice(stats.unmatchedMetadata.length ? `${stats.unmatchedMetadata.length} metadata IDs did not match samples.` : '');
    } catch (error) {
      if (!destroyed && token === request && error.name !== 'AbortError') {
          reportError(error);
      }
      throw error;
    } finally {
      if (token === request) {
        worker?.terminate(); worker = null; pendingReject = null; busy = false;
        root.removeAttribute('aria-busy');
      }
    }
  }

  function updateMetadataControls() {
    control('metadata-table').replaceChildren();
    control('metadata-table').add(new Option('No metadata', ''));
    metadataTables.forEach((table, i) => control('metadata-table').add(new Option(table.name, String(i))));
    control('metadata-table').value = metadata.length ? '0' : '';
  }

  function updateFields() {
    const fields = [...new Set(metadata.flatMap(row => Object.keys(row)))].filter(key => key !== 'id');
    const colorBy = metadata.some(row => Object.hasOwn(row, 'color_by'))
      ? new Set(metadata.flatMap(row => String(row.color_by ?? '').split(/[;,]/).map(value => value.trim()).filter(Boolean)))
      : null;
    const colorFields = fields.filter(field => field !== 'color_by' && (!colorBy || colorBy.has(field)));
    const oldColor = control('color').value, oldLabel = control('label').value;
    const oldGroup = control('group-by').value, oldGroupValue = control('group-value').value;
    control('color').replaceChildren(new Option('Single color', ''));
    control('label').replaceChildren(new Option('Sample / cluster ID', 'id'), new Option('No labels', 'none'));
    control('group-by').replaceChildren(new Option('All samples', ''));
    for (const field of fields) {
      control('label').add(new Option(field, field));
      control('group-by').add(new Option(field, field));
    }
    colorFields.forEach(field => control('color').add(new Option(field, field)));
    control('color').value = colorFields.includes(oldColor) ? oldColor : colorFields.includes(options.colorBy ?? 'population') ? (options.colorBy ?? 'population') : colorFields[0] ?? '';
    control('label').value = fields.includes(oldLabel) || ['id', 'none'].includes(oldLabel) ? oldLabel : 'id';
    control('group-by').value = fields.includes(oldGroup) ? oldGroup : '';
    updateGroupValues(oldGroupValue);
    updateColorScale();
  }

  function updateGroupValues(previous = '') {
    const field = control('group-by').value;
    const select = control('group-value');
    select.replaceChildren(new Option('All groups', ''));
    groupChoices = [];
    if (field) {
      const records = new Map(metadata.map(row => [row.id, row]));
      for (const id of allSampleIds) {
        const value = records.get(id)?.[field];
        const missing = value === undefined || value === null || value === '';
        const key = missing ? null : String(value);
        const group = groupChoices.find(choice => choice.missing === missing && choice.value === key);
        if (group) group.count++;
        else groupChoices.push({ value: key, missing, count: 1 });
      }
      groupChoices.sort((a, b) => b.count - a.count || String(a.value ?? '').localeCompare(String(b.value ?? '')));
      groupChoices.forEach((choice, index) => select.add(new Option(choice.missing ? 'Missing' : choice.value, String(index))));
    }
    select.disabled = !field;
    select.value = groupChoices[Number(previous)] ? previous : '';
  }

  function updateColorScale() {
    colorField = control('color').value;
    if (!colorField) { colorScale = null; return; }
    const metadataMap = new Map(metadata.map(row => [row.id, row]));
    const values = allSampleIds.map(id => metadataMap.get(id)?.[colorField]);
    const observed = values.filter(value => value !== undefined && value !== null && value !== '');
    const dateValues = observed.length > 0 && observed.every(isDateValue);
    const continuousValues = observed.map(value => dateValues ? (value instanceof Date ? value.getTime() : Date.parse(value)) : typeof value === 'number' ? value : Number(value));
    const continuous = observed.length > 0 && (dateValues || continuousValues.every(Number.isFinite));
    if (continuous) {
      const [min, max] = d3.extent(continuousValues);
      colorScale = { type: 'continuous', valueType: dateValues ? 'date' : 'numeric', min, max, get: value => {
        if (value === undefined || value === null || value === '') return MISSING_COLOR;
        const numeric = dateValues ? (value instanceof Date ? value.getTime() : Date.parse(value)) : Number(value);
        return d3.interpolateViridis(min === max ? 0.5 : (numeric - min) / (max - min));
      } };
      return;
    }
    const frequencies = new Map();
    for (const value of observed) frequencies.set(String(value), (frequencies.get(String(value)) ?? 0) + 1);
    const categories = [...frequencies].sort((a, b) => b[1] - a[1]).map(([value]) => value);
    const colors = new Map(categories.map((category, index) => [category,
      d3.interpolateViridis(categories.length <= 1 ? 0 : Math.min(index, MAX_CATEGORIES - 1) / (Math.min(categories.length, MAX_CATEGORIES) - 1))]));
    colorScale = { type: 'categorical', categories, get: value => value === undefined || value === null || value === '' ? MISSING_COLOR : (colors.get(String(value)) ?? MISSING_COLOR), colors };
  }

  function setMetadata(rows, { replaceTable = true } = {}) {
    if (!graph || busy) throw new Error('Load a dataset before assigning metadata.');
    const parsed = typeof rows === 'string' ? parseMetadata(rows) : rows;
    if (!Array.isArray(parsed) || parsed.some(row => typeof row.id !== 'string' || !row.id) || new Set(parsed.map(row => row.id)).size !== parsed.length) throw new Error('Metadata needs unique string IDs.');
    if (parsed.length && !parsed.some(row => allSampleIds.includes(row.id))) throw new Error('At least one metadata ID must match a sample ID in the dataset.');
    if (replaceTable) {
      const activeIndex = Number(control('metadata-table').value);
      if (metadataTables[activeIndex]) metadataTables[activeIndex] = { ...metadataTables[activeIndex], rows: parsed };
      else metadataTables = parsed.length ? [{ name: 'Sample metadata', rows: parsed }] : [];
      updateMetadataControls();
      control('metadata-table').value = metadataTables.length ? String(Math.min(activeIndex, metadataTables.length - 1)) : '';
    }
    metadata = parsed;
    const map = new Map(parsed.map(row => [row.id, row]));
    graph.forEachNode((id, attrs) => {
      graph.setNodeAttribute(id, 'records', attrs.sampleIds.map(sample => map.get(sample) ?? { id: sample }));
    });
    stats.unmatchedMetadata = parsed.filter(row => !allSampleIds.includes(row.id)).map(row => row.id);
    currentSource.metadata = parsed;
      metadataByDataset.set(currentSource, metadataTables);
      metadataSelectionByDataset.set(currentSource, control('metadata-table').value);
    updateFields();
    if (control('group-by').value && control('group-value').value !== '') return load(currentSource, { preserveMetadata: true });
    render();
    notice(stats.unmatchedMetadata.length ? `${stats.unmatchedMetadata.length} metadata IDs did not match samples.` : '');
  }

  function counts(node) {
    const values = new Map();
    for (const record of node.records ?? []) {
      const raw = record[colorField];
      const category = colorField ? (raw === undefined || raw === null || raw === '' ? null : raw) : 'Samples';
      values.set(category, (values.get(category) ?? 0) + 1);
    } 
    return [...values].map(([category, count]) => ({ category, count }));
  }

  const radius = node => 7 + Math.sqrt(node.frequency ?? 1) * 4;
  const members = node => node.members ?? [node.id];
  const isSelected = node => members(node).some(id => selected.has(id));

  function closePopup() { find('.msnw-popup').hidden = true; updateHideButton(); }

  function showPopup(node, cluster = false) {
    find('.msnw-hide').hidden = true;
    const content = find('.msnw-popup-content');
    content.replaceChildren();
    const title = document.createElement('h3');
    title.textContent = `${cluster ? 'Cluster' : 'Genotype'} ${node.id}`;
    content.append(title);
    const details = document.createElement('p');
    details.textContent = `${node.frequency ?? node.sampleIds.length} samples / ${((node.missingRate ?? 0) * 100).toFixed(1)}% missing sites`;
    content.append(details);
    const ids = document.createElement('p');
    ids.className = 'msnw-ids';
    ids.textContent = node.sampleIds.join(', ');
    content.append(ids);
    const heading = document.createElement('h4');
    heading.textContent = control('color').value ? `Composition: ${control('color').value}` : 'Metadata summary';
    content.append(heading);
    const table = document.createElement('table');
    for (const [field, summary] of Object.entries(summarizeMetadata(node.records ?? []))) {
      const row = table.insertRow();
      row.insertCell().textContent = field;
      row.insertCell().textContent = summary.type === 'numeric' ? `Mean ${summary.mean.toFixed(3)} / variance ${summary.variance.toFixed(3)} (n=${summary.count})`
        : summary.type === 'date' ? `From ${summary.min} to ${summary.max} (n=${summary.count})`
          : Object.entries(summary.proportions).map(([value, proportion]) => `${value}: ${(proportion * 100).toFixed(1)}%`).join(', ') || 'No values';
    }
    content.append(table);
    if (!cluster) {
      const heading = document.createElement('h4'); heading.textContent = 'Sample records'; content.append(heading);
      for (const record of node.records ?? []) {
        const line = document.createElement('p');
        line.textContent = Object.entries(record).map(([key, value]) => `${key}: ${value}`).join(' / ');
        content.append(line);
      }
    }
    find('.msnw-popup').hidden = false;
  }

  function select(node, ids) {
    closePopup();
    const remove = ids.every(id => selected.has(id));
    ids.forEach(id => remove ? selected.delete(id) : selected.add(id));
    lastSelected = node;
    updateSelection();
  }

  function updateSelection() {
    nodeSelection?.select('circle').attr('stroke', d => isSelected(d) ? '#172e35' : '#fff').attr('stroke-width', d => isSelected(d) ? 3 : 1.5);
    boundarySelection?.attr('stroke', d => d.members.every(id => selected.has(id)) ? '#172e35' : '#287b78').attr('stroke-width', d => d.members.every(id => selected.has(id)) ? 2.5 : 1);
    updateHideButton();
  }

  function updateHideButton() {
    const button = find('.msnw-hide');
    button.hidden = dragging || !selected.size || !lastSelected || !find('.msnw-popup').hidden;
    if (button.hidden) return;
    const point = d3.zoomTransform(svg.node()).apply([lastSelected.x ?? width / 2, lastSelected.y ?? height / 2]);
    button.style.left = `${Math.max(8, Math.min(width - 140, point[0] + 15))}px`;
    button.style.top = `${Math.max(8, Math.min(height - 40, point[1] - 30))}px`;
  }

  function render() {
    if (!graph || destroyed) return;
    closePopup(); simulation?.stop(); dragging = false;
    clusters = cutCompleteLinkage(linkage, threshold);
    const visible = graph.copy();
    hidden.forEach(id => { if (visible.hasNode(id)) visible.dropNode(id); });
    const collapsed = collapseToClusterGraph(visible, clusters);
    const display = view === 'collapsed' ? collapsed : visible;
    rendered = graphologyToD3(display);
    boundaries = graphologyToD3(collapsed).nodes.filter(node => node.members.length > 1);
    for (const node of rendered.nodes) {
      const cached = view === 'full' ? positions.get(node.id) : null;
      const cachedMembers = (node.members ?? []).map(id => positions.get(id)).filter(Boolean);
      if (cached) Object.assign(node, cached);
      else if (cachedMembers.length) Object.assign(node, { x: d3.mean(cachedMembers, p => p.x), y: d3.mean(cachedMembers, p => p.y) });
    }
    boundarySelection = boundaryLayer.selectAll('circle').data(view === 'full' ? boundaries : [], d => d.id).join('circle')
      .attr('fill', '#287b780b').attr('stroke', '#287b78').attr('stroke-dasharray', '4 5')
      .attr('tabindex', 0).attr('role', 'button').attr('aria-label', d => `Select cluster ${d.id}`)
      .on('click', (event, d) => { event.stopPropagation(); select(d, d.members); })
      .on('dblclick', (event, d) => { event.stopPropagation(); showPopup(d, true); })
      .on('keydown', (event, d) => { if (event.key === 'Enter') showPopup(d, true); if (event.key === ' ') { event.preventDefault(); select(d, d.members); } });
    const links = linkLayer.selectAll('line').data(rendered.links, d => d.id).join('line')
      .attr('stroke', d => d3.interpolateRgb('#c9d8d7', '#35595c')(d.weight))
      .attr('stroke-width', d => 1 + d.weight * 3);
    links.selectAll('title').data(d => [d]).join('title').text(d => `Dissimilarity: ${d.weight.toFixed(4)}`);
    nodeSelection = nodeLayer.selectAll('.msnw-node').data(rendered.nodes, d => d.id).join(enter => {
      const node = enter.append('g').attr('class', 'msnw-node');
      node.append('circle'); node.append('g').attr('class', 'msnw-pie'); node.append('text'); node.append('title');
      return node;
    }).attr('tabindex', 0).attr('role', 'button').attr('aria-label', d => `${view === 'collapsed' ? 'Cluster' : 'Genotype'} ${d.id}, ${d.frequency} samples`)
      .on('click', (event, d) => { if (event.defaultPrevented) return; event.stopPropagation(); select(d, members(d)); })
      .on('dblclick', (event, d) => { event.stopPropagation(); showPopup(d, view === 'collapsed'); })
      .on('keydown', (event, d) => { if (event.key === 'Enter') showPopup(d, view === 'collapsed'); if (event.key === ' ') { event.preventDefault(); select(d, members(d)); } });
    nodeSelection.select('circle').attr('r', radius).attr('fill', '#287b78');
    nodeSelection.each(function(node) {
      const slices = d3.pie().sort(null).value(d => d.count)(counts(node));
      d3.select(this).select('.msnw-pie').selectAll('path').data(slices).join('path')
        .attr('d', d3.arc().innerRadius(0).outerRadius(radius(node) - 1.5))
         .attr('fill', d => colorScale ? colorScale.get(d.data.category) : '#287b78').attr('pointer-events', 'none');
    });
    nodeSelection.select('text').text(node => {
      const field = control('label').value;
      if (field === 'none') return '';
      if (field === 'id') return node.id;
      return [...new Set(node.records.map(record => record[field]).filter(v => v !== undefined && v !== ''))].join(', ');
    }).attr('x', d => radius(d) + 7).attr('y', 4).attr('font-family', control('font').value).attr('font-size', 11).attr('fill', '#334b51').attr('pointer-events', 'none');
    nodeSelection.select('title').text(d => `${d.id} / ${d.frequency} samples`);
    simulation = d3.forceSimulation(rendered.nodes)
      .force('link', d3.forceLink(rendered.links).id(d => d.id).distance(d => 65 + d.weight * 230).strength(0.65))
      .force('charge', d3.forceManyBody().strength(-180))
      .force('collision', d3.forceCollide(d => radius(d) + 14))
      .force('center', d3.forceCenter(width / 2, height / 2));
    function tick() {
      links.attr('x1', d => d.source.x).attr('y1', d => d.source.y).attr('x2', d => d.target.x).attr('y2', d => d.target.y);
      nodeSelection.attr('transform', d => `translate(${d.x},${d.y})`);
      if (view === 'full') rendered.nodes.forEach(d => positions.set(d.id, { x: d.x, y: d.y }));
      else rendered.nodes.forEach(node => {
        const cached = node.members.map(id => positions.get(id)).filter(Boolean);
        const dx = node.x - (d3.mean(cached, p => p.x) ?? node.x);
        const dy = node.y - (d3.mean(cached, p => p.y) ?? node.y);
        node.members.forEach(id => {
          const previous = positions.get(id) ?? { x: node.x, y: node.y };
          positions.set(id, { x: previous.x + dx, y: previous.y + dy });
        });
      });
      const byId = new Map(rendered.nodes.map(node => [node.id, node]));
      boundarySelection.each(function(cluster) {
        const nodes = cluster.members.map(id => byId.get(id));
        cluster.x = d3.mean(nodes, d => d.x); cluster.y = d3.mean(nodes, d => d.y);
        cluster.r = d3.max(nodes, d => Math.hypot(d.x - cluster.x, d.y - cluster.y) + radius(d)) + 18;
        d3.select(this).attr('cx', cluster.x).attr('cy', cluster.y).attr('r', cluster.r);
      });
      updateHideButton();
    }
    simulation.on('tick', tick);
    // Settle a small number of iterations before fitting; long runs remain asynchronous.
    simulation.tick(50); tick();
    simulation.on('end', () => { if (control('auto').checked) fit(); });
    const drag = d3.drag().filter(event => !event.button && !event.shiftKey && !control('lasso').checked).container(layer.node()).on('start', function(event, node) {
      dragging = true;
      closePopup(); find('.msnw-hide').hidden = true;
      const ids = node.members ?? [node.id];
      if (!ids.some(id => selected.has(id))) { selected.clear(); ids.forEach(id => selected.add(id)); }
      lastSelected = node;
      this._moving = rendered.nodes.filter(d => isSelected(d));
      this._last = [event.x, event.y];
      this._moving.forEach(d => { d.fx = d.x; d.fy = d.y; });
      if (!event.active) simulation.alphaTarget(0.2).restart();
      updateSelection(); find('.msnw-hide').hidden = true;
    }).on('drag', function(event) {
      const dx = event.x - this._last[0], dy = event.y - this._last[1];
      this._moving.forEach(d => { d.fx += dx; d.fy += dy; });
      this._last = [event.x, event.y];
      find('.msnw-hide').hidden = true;
    }).on('end', function(event) {
      dragging = false;
      this._moving.forEach(d => { d.fx = null; d.fy = null; });
      if (!event.active) simulation.alphaTarget(0);
      updateHideButton();
    });
    nodeSelection.call(drag);
    boundarySelection.call(drag);
    find('.msnw-empty').hidden = rendered.nodes.length > 0;
    find('.msnw-empty').textContent = 'All nodes are hidden. Use Unhide all to restore the network.';
    find('[data-action="unhide"]').disabled = !hidden.size;
    find('[data-value="threshold"]').textContent = `${(threshold * 100).toFixed(1)}%`;
    updateSelection(); updateLegends();
    if (control('auto').checked) fit();
  }

  function updateLegends() {
    const element = find('.msnw-legends'); element.replaceChildren();
    const add = (text, color) => {
      const item = document.createElement('span');
      if (color) { const swatch = document.createElement('i'); swatch.style.background = color; item.append(swatch); }
      item.append(document.createTextNode(text)); element.append(item);
    };
    if (colorScale?.type === 'categorical') {
      add(`${colorField}`);
      colorScale.categories.slice(0, MAX_CATEGORIES).forEach(category => add(category, colorScale.get(category)));
      if (colorScale.categories.length > MAX_CATEGORIES) add('Other', colorScale.get(colorScale.categories[MAX_CATEGORIES]));
      if (metadata.some(row => row[colorField] === undefined || row[colorField] === null || row[colorField] === '')) add('Missing', MISSING_COLOR);
    } else if (colorScale?.type === 'continuous') {
      const legend = d3.create('svg').attr('width', 200).attr('height', 52).attr('role', 'img').attr('aria-label', `${colorField} continuous viridis scale`);
      const id = `msnw-gradient-${Math.random().toString(36).slice(2)}`;
      const gradient = legend.append('defs').append('linearGradient').attr('id', id).attr('x1', '0%').attr('x2', '100%');
      d3.range(0, 1.001, 0.1).forEach(t => gradient.append('stop').attr('offset', `${t * 100}%`).attr('stop-color', d3.interpolateViridis(t)));
      legend.append('text').attr('x', 0).attr('y', 11).attr('font-size', 11).text(colorField);
      legend.append('rect').attr('x', 0).attr('y', 17).attr('width', 190).attr('height', 12).attr('fill', `url(#${id})`);
      const formatLimit = value => colorScale.valueType === 'date' ? new Date(value).toISOString().slice(0, 10) : value;
      legend.append('text').attr('x', 0).attr('y', 43).attr('font-size', 10).text(formatLimit(colorScale.min));
      legend.append('text').attr('x', 190).attr('y', 43).attr('font-size', 10).attr('text-anchor', 'end').text(formatLimit(colorScale.max));
      element.append(legend.node());
      if (metadata.some(row => row[colorField] === undefined || row[colorField] === null || row[colorField] === '')) add('Missing', MISSING_COLOR);
    } else add('Samples', '#287b78');
    const sizeLegend = d3.create('svg').attr('width', 190).attr('height', 86).attr('role', 'img').attr('aria-label', 'Node size: 1, 5, and 20 samples');
    sizeLegend.append('text').attr('x', 0).attr('y', 12).attr('font-size', 11).attr('font-family', 'sans-serif').attr('fill', '#6b8085').text('samples per node');
    const frequencies = [1, 5, 20];
    const gap = 25;
    let currentX = 25;
    frequencies.forEach((frequency, i) => {
      const r = radius({ frequency });
      if (i > 0) {
        const prevR = radius({ frequency: frequencies[i - 1] });
        currentX += prevR + r + gap;
      }
      sizeLegend.append('circle').attr('cx', currentX).attr('cy', 43).attr('r', radius({ frequency })).attr('fill', '#dcece7').attr('stroke', '#287b78');
      sizeLegend.append('text').attr('x', currentX).attr('y', 81).attr('text-anchor', 'middle').attr('font-size', 10).attr('font-family', 'sans-serif').attr('fill', '#6b8085').text(frequency);
    });
    const similarityLegend = d3.create('svg').attr('width', 180).attr('height', 80).attr('transform', `translate(16, 0)`).attr('role', 'img').attr('aria-label', 'Edge similarity from 1, light and thin, to 0, dark and thick');
    similarityLegend.append('text').attr('x', 0).attr('y', 12).attr('transform', `translate(-16, 0)`).attr('font-size', 11).attr('font-family', 'sans-serif').attr('fill', '#6b8085').text('edge similarity');
    [1, 0.75, 0.5, 0.25, 0].forEach((similarity, i) => {
      const dissimilarity = 1 - similarity;
      similarityLegend.append('line').attr('x1', i * 32).attr('x2', i * 32 + 28).attr('y1', 43).attr('y2', 43)
        .attr('stroke', d3.interpolateRgb('#c9d8d7', '#35595c')(dissimilarity)).attr('stroke-width', 1 + dissimilarity * 3);
    });
    similarityLegend.append('text').attr('x', 0).attr('y', 70).attr('font-size', 10).attr('font-family', 'sans-serif').attr('fill', '#6b8085').text('1');
    similarityLegend.append('text').attr('x', 156).attr('y', 70).attr('font-size', 10).attr('font-family', 'sans-serif').attr('fill', '#6b8085').text('0');
    element.append(sizeLegend.node(), similarityLegend.node());
  }

  function fit() {
    if (!rendered.nodes.length) return;
    const x0 = d3.min(rendered.nodes, d => d.x - radius(d) - 20);
    const y0 = d3.min(rendered.nodes, d => d.y - radius(d) - 20);
    const x1 = d3.max(rendered.nodes, d => d.x + radius(d) + 100);
    const y1 = d3.max(rendered.nodes, d => d.y + radius(d) + 20);
    const scale = Math.min(2, Math.max(0.05, Math.min((width - 100) / Math.max(1, x1 - x0), (height - 60) / Math.max(1, y1 - y0))));
    svg.call(zoom.transform, d3.zoomIdentity.translate(width / 2 - (x0 + x1) / 2 * scale, height / 2 - (y0 + y1) / 2 * scale).scale(scale));
  }

  let lassoPoints = [];
  svg.call(d3.drag().filter(event => !event.button && (event.shiftKey || control('lasso').checked))
    .on('start', event => { closePopup(); dragging = true; updateHideButton(); lassoPoints = [[event.x, event.y]]; })
    .on('drag', event => { lassoPoints.push([event.x, event.y]); lassoPath.attr('d', `${d3.line()(lassoPoints)}Z`); })
    .on('end', () => {
      const transform = d3.zoomTransform(svg.node());
      if (lassoPoints.length > 2) {
        rendered.nodes.forEach(node => { if (d3.polygonContains(lassoPoints, transform.apply([node.x, node.y]))) { members(node).forEach(id => selected.add(id)); lastSelected = node; } });
        if (view === 'full') boundaries.forEach(node => { if (d3.polygonContains(lassoPoints, transform.apply([node.x, node.y]))) { node.members.forEach(id => selected.add(id)); lastSelected = node; } });
      }
      dragging = false; lassoPath.attr('d', null); updateSelection();
    }));
  svg.on('click.clear', event => {
    if (event.target === svg.node() && !event.defaultPrevented) { selected.clear(); lastSelected = null; closePopup(); updateSelection(); }
  });

  function setThreshold(value) {
    if (!Number.isFinite(Number(value)) || Number(value) < MIN_WIDGET_THRESHOLD || Number(value) > 1) {
      throw new Error('Widget cluster similarity must be between 90% and 100%.');
    }
    control('threshold').value = value;
    threshold = Number(control('threshold').value);
    find('[data-value="threshold"]').textContent = `${(threshold * 100).toFixed(1)}%`;
    render();
  }

  function setView(value) {
    if (!['full', 'collapsed'].includes(value)) throw new Error('View must be full or collapsed.');
    view = value;
    root.querySelectorAll('[data-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.view === view)));
    render();
  }

  function setGroup(field = '', value) {
    if (!currentSource || !graph) throw new Error('Load a dataset before selecting a group.');
    control('group-by').value = field;
    updateGroupValues('');
    if (field && value !== undefined && value !== null) {
      const choice = groupChoices.findIndex(item => value === null ? item.missing : !item.missing && item.value === String(value));
      if (choice >= 0) control('group-value').value = String(choice);
    }
    return load(currentSource, { preserveMetadata: true, sampleIds: getGroupSampleIds() });
  }

  function download(blob, extension) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = `minimum-spanning-network.${extension}`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function snapshot() {
    const copy = svg.node().cloneNode(true);
    copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    copy.setAttribute('viewBox', `0 0 ${width} ${height + 100}`);
    copy.querySelectorAll('[tabindex]').forEach(el => el.removeAttribute('tabindex'));
    const background = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    background.setAttribute('width', '100%'); background.setAttribute('height', '100%'); background.setAttribute('fill', '#fff'); copy.prepend(background);
    const addText = (text, x, y) => {
      const element = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      element.setAttribute('x', x); element.setAttribute('y', y); element.setAttribute('font-family', 'sans-serif'); element.setAttribute('font-size', '12'); element.setAttribute('fill', '#334b51'); element.textContent = text; copy.append(element);
    };
    // Legend items are copied to the SVG, independent of page styles.
    let x = 20, y = height + 66;
    for (const item of find('.msnw-legends').children) {
      if (item.tagName.toLowerCase() === 'svg') continue;
      const text = item.textContent;
      const itemWidth = text.length * 7 + 30;
      if (x + itemWidth > width - 20) { x = 20; y += 20; }
      const swatch = item.querySelector('i');
      if (swatch) {
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', x + 4); circle.setAttribute('cy', y - 4); circle.setAttribute('r', 4); circle.setAttribute('fill', swatch.style.background); copy.append(circle);
      }
      addText(text, x + 14, y); x += itemWidth;
    }
    x = 20; y += 20;
    for (const item of find('.msnw-legends').querySelectorAll('svg')) {
      const itemWidth = Number(item.getAttribute('width'));
      if (x + itemWidth > width - 20) { x = 20; y += 90; }
      const legend = item.cloneNode(true); legend.setAttribute('x', x); legend.setAttribute('y', y); copy.append(legend);
      x += itemWidth + 10;
    }
    const totalHeight = Math.max(height + 100, y + 100);
    const outputWidth = Number(control('export-width').value), outputHeight = Number(control('export-height').value);
    if (!Number.isFinite(outputWidth) || !Number.isFinite(outputHeight) || outputWidth < 200 || outputWidth > 4096 || outputHeight < 200 || outputHeight > 4096) {
      throw new Error('Export dimensions must be between 200 and 4096 pixels.');
    }
    copy.setAttribute('width', outputWidth); copy.setAttribute('height', outputHeight);
    copy.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    copy.setAttribute('viewBox', `0 0 ${width} ${totalHeight}`);
    return copy;
  }

  async function exportPlot(format) {
    if (!graph) throw new Error('No network to export.');
    const copy = snapshot();
    const blob = new Blob([new XMLSerializer().serializeToString(copy)], { type: 'image/svg+xml;charset=utf-8' });
    if (format === 'svg') { download(blob, 'svg'); return; }
    if (format === 'pdf') {
      const [{ jsPDF }] = await Promise.all([import('jspdf'), import('svg2pdf.js')]);
      const outputWidth = Number(copy.getAttribute('width')), outputHeight = Number(copy.getAttribute('height'));
      const pdf = new jsPDF({ orientation: outputWidth > outputHeight ? 'landscape' : 'portrait', unit: 'pt', format: [outputWidth, outputHeight] });
      await pdf.svg(copy, { x: 0, y: 0, width: outputWidth, height: outputHeight });
      pdf.save('minimum-spanning-network.pdf'); return;
    }
    if (format !== 'png') throw new Error('Export format must be svg, png, or pdf.');
    const url = URL.createObjectURL(blob);
    try {
      const image = new Image(); image.src = url;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = Number(copy.getAttribute('width')) * 2; canvas.height = Number(copy.getAttribute('height')) * 2;
      const context = canvas.getContext('2d'); context.scale(2, 2); context.drawImage(image, 0, 0);
      const png = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!png) throw new Error('PNG encoding failed.');
      download(png, 'png');
    } finally { URL.revokeObjectURL(url); }
  }

  const run = promise => promise.catch(reportError);
  root.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button || !root.contains(button)) return;
    if (button.dataset.tab) {
      if (settingsOpen && activeTab === button.dataset.tab) {
        setSettingsOpen(false);
      } else {
        activeTab = button.dataset.tab;
        root.querySelectorAll('[data-panel]').forEach(panel => { panel.hidden = panel.dataset.panel !== activeTab; });
        setSettingsOpen(true);
      }
    }
    if (button.dataset.view) setView(button.dataset.view);
    switch (button.dataset.action) {
      case 'fit': fit(); break;
      case 'export': run(exportPlot(control('export-format').value)); break;
      case 'toggle-toolbar': {
        setToolbarOpen(!toolbarOpen);
        break;
      }
      case 'close': closePopup(); break;
      case 'hide': selected.forEach(id => hidden.add(id)); selected.clear(); lastSelected = null; render(); break;
      case 'unhide': hidden.clear(); render(); break;
    }
  });
  root.addEventListener('change', event => {
    const name = event.target.dataset.control;
    if (name === 'dataset' && event.target.value !== '') run(load(datasetList[Number(event.target.value)]));
    if (name === 'group-by') {
      updateGroupValues('');
      if (currentSource) run(load(currentSource, { preserveMetadata: true }));
    }
    if (name === 'group-value' && currentSource) run(load(currentSource, { preserveMetadata: true, sampleIds: getGroupSampleIds() }));
    if (['label', 'font', 'color'].includes(name)) { if (name === 'color') updateColorScale(); render(); }
    if (name === 'metadata-table') {
      try { run(Promise.resolve(setMetadata(event.target.value === '' ? [] : metadataTables[Number(event.target.value)].rows, { replaceTable: false }))); } catch (error) { reportError(error); }
    }
    if (name === 'input' || name === 'metadata') {
      const file = event.target.files[0];
      if (!file) return;
      const fileToken = ++fileOperation, datasetToken = request;
      run((async () => {
        const text = await file.text();
        if (destroyed || fileToken !== fileOperation || datasetToken !== request) return;
        if (name === 'metadata') {
          const rows = parseMetadata(text);
          if (rows.length && !rows.some(row => allSampleIds.includes(row.id))) throw new Error('At least one metadata ID must match a sample ID in the dataset.');
          metadataTables.push({ name: file.name, rows });
          updateMetadataControls(); control('metadata-table').value = String(metadataTables.length - 1);
          await setMetadata(rows, { replaceTable: false });
        } else {
          const extension = file.name.split('.').pop().toLowerCase();
          const source = { name: file.name };
          if (extension === 'vcf') source.vcf = text;
          else if (extension === 'json') source.distanceMatrix = text;
          else if (['fa', 'fas', 'fasta', 'fna'].includes(extension)) source.fasta = text;
          else throw new Error('Supported files are FASTA, uncompressed VCF, and distance JSON.');
          await load(source); datasetList.push(source); updateDatasets(); control('dataset').value = String(datasetList.length - 1);
        }
      })());
      event.target.value = '';
    }
  });
  control('threshold').addEventListener('input', event => setThreshold(Number(event.target.value)));
  control('zoom').addEventListener('input', event => svg.call(zoom.scaleTo, Number(event.target.value)));
  function updateDatasets() {
    control('dataset').replaceChildren(new Option('Choose a dataset', ''));
    datasetList.forEach((dataset, i) => control('dataset').add(new Option(dataset.name ?? `Dataset ${i + 1}`, String(i))));
  }
  updateDatasets();
  const resize = new ResizeObserver(entries => {
    width = Math.max(1, entries[0].contentRect.width);
    height = Math.max(1, entries[0].contentRect.height);
    svg.attr('width', width).attr('height', height).attr('viewBox', `0 0 ${width} ${height}`);
    zoom.extent([[0, 0], [width, height]]);
    if (simulation) simulation.force('center', d3.forceCenter(width / 2, height / 2)).alpha(0.3).restart();
    if (control('auto').checked) fit();
  });
  resize.observe(find('.msnw-plot'));
  setView(view);
  find('[data-value="threshold"]').textContent = `${(threshold * 100).toFixed(1)}%`;
  const ready = datasetList.length ? load(datasetList[0]) : Promise.resolve();
  if (datasetList.length) control('dataset').value = '0';
  // Report startup failures in the UI even if the consumer does not await ready.
  ready.catch(() => {});
  return {
    ready, load, setMetadata, setThreshold, setView, setGroup, fit, exportPlot,
    getGraph: () => graph ? Graph.from(structuredClone(graph.export())) : null,
    getState: () => {
      const group = groupChoices[Number(control('group-value').value)];
      return { threshold, view, clusters: new Set(clusters.values()).size, groupBy: control('group-by').value, group: group ? (group.missing ? null : group.value) : undefined,
        hidden: [...hidden], selected: [...selected], stats: stats ? structuredClone(stats) : null };
    },
    destroy() {
      destroyed = true; request++; cancelBuild(); simulation?.stop(); resize.disconnect(); svg.on('.zoom', null).on('.drag', null); root.remove();
    },
  };
}
