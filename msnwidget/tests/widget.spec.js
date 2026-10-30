import { test, expect } from '@playwright/test';

const readStats = page => page.evaluate(() => window.networkWidget.getState().stats);

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.networkWidget.ready);
  await expect(page.locator('h1, .msnw-header')).toHaveCount(0);
  await expect(page.locator('.msnw-stats')).toHaveCount(0);
});

test('worker startup, view controls, selection, popup, hide, and restore', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const initialStats = await readStats(page);
  expect(initialStats.samples).toBe(60);
  expect(initialStats.genotypes).toBe(24);
  await expect(page.locator('.msnw-canvas g[role="button"]')).toHaveCount(24);
  await page.locator('[data-view="collapsed"]').click();
  expect(await page.locator('.msnw-canvas g[role="button"]').count()).toBeLessThan(24);
  await page.locator('[data-view="full"]').click();
  const node = page.locator('.msnw-canvas g[role="button"]').first();
  await node.focus(); await node.press('Space');
  await expect(page.locator('[data-action="hide"]')).toBeVisible();
  await node.press('Enter');
  await expect(page.locator('.msnw-popup')).toBeVisible();
  await expect(page.locator('.msnw-popup')).toContainText('Sample records');
  await expect(page.locator('[data-action="hide"]')).toBeHidden();
  await page.locator('[data-action="close"]').click();
  await node.press('Space'); await node.press('Space');
  await page.locator('[data-action="hide"]').click();
  await expect(page.locator('.msnw-canvas g[role="button"]')).toHaveCount(23);
  const state = await page.evaluate(() => ({ order: window.networkWidget.getGraph().order, ...window.networkWidget.getState() }));
  expect(state.order).toBe(24); expect(state.hidden).toHaveLength(1);
  await page.locator('[data-action="unhide"]').click();
  await expect(page.locator('.msnw-canvas g[role="button"]')).toHaveCount(24);
  expect(errors).toEqual([]);
});

test('threshold recomputes clusters and metadata uploads are text-safe', async ({ page }) => {
  await page.evaluate(() => window.networkWidget.setThreshold(1));
  await expect.poll(async () => page.evaluate(() => window.networkWidget.getState().clusters)).toBe(24);
  await page.evaluate(() => window.networkWidget.setThreshold(0.9));
  await page.locator('[data-view="collapsed"]').click();
  await expect(page.locator('.msnw-canvas g[role="button"]')).not.toHaveCount(0);
  await page.locator('[data-control="metadata"]').setInputFiles({ name: 'metadata.csv', mimeType: 'text/csv', buffer: Buffer.from('id,population,value\nS001,<img src=x onerror=alert(1)>,3') });
  const node = page.locator('.msnw-canvas g[role="button"]').first();
  await node.focus(); await node.press('Enter');
  await expect(page.locator('.msnw-popup')).toContainText('<img src=x onerror=alert(1)>');
  await expect(page.locator('.msnw-popup img')).toHaveCount(0);
});

test('settings hamburger and zoom slider are accessible and synchronized', async ({ page }) => {
  const toolbar = page.locator('.msnw-tabs');
  const subbar = page.locator('.msnw-settings');
  const collapsible = page.locator('.msnw-collapsible-panel');
  const toggle = page.locator('.msnw-menu-toggle');
  const structure = await page.locator('.msnw-toolbar').evaluate(element => [...element.children].map(child => child.className));
  expect(structure).toEqual(['msnw-toggle-container', 'msnw-collapsible-panel']);
  expect(await collapsible.evaluate(element => [...element.children].map(child => child.className))).toEqual(['msnw-tabs', 'msnw-settings']);
  await expect(toggle.locator('.msnw-toggle-arrow')).toHaveCount(1);
  await expect(toggle.locator('.msnw-hamburger-icon')).toHaveCount(1);
  await expect(toggle).toHaveAttribute('aria-label', 'Toggle control panel');
  await expect(toolbar).toBeVisible();
  await expect(subbar).toBeVisible();
  await page.locator('[data-tab="data"]').click();
  await expect(subbar).toBeHidden();
  await expect(page.locator('[data-tab="data"]')).toHaveAttribute('aria-expanded', 'false');
  await page.locator('[data-tab="data"]').click();
  await expect(subbar).toBeVisible();
  await toggle.click();
  await expect(collapsible).toHaveClass(/msnw-panel-collapsed/);
  await expect(collapsible).toHaveCSS('max-height', '0px');
  await expect(toggle).toBeVisible();
  expect(await page.locator('.msnw-toolbar').evaluate(element => element.getBoundingClientRect().height)).toBe(0);
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle).toHaveClass(/collapsed/);
  await expect(page.locator('[data-tab="data"]')).toHaveAttribute('aria-expanded', 'true');
  await toggle.click();
  await expect(collapsible).not.toHaveClass(/msnw-panel-collapsed/);
  await expect(collapsible).toHaveCSS('max-height', '1000px');
  await expect(toolbar).toBeVisible();
  await expect(toggle).not.toHaveClass(/collapsed/);
  await expect(subbar).toBeVisible();
  await expect(page.locator('[data-tab="data"]')).toHaveAttribute('aria-expanded', 'true');
  await page.locator('[data-tab="controls"]').click();
  await expect(page.locator('[data-panel="controls"]')).toBeVisible();
  await page.locator('[data-tab="controls"]').click();
  await expect(subbar).toBeHidden();
  await page.locator('[data-tab="controls"]').click();
  await expect(subbar).toBeVisible();
  await page.locator('[data-control="auto"]').uncheck();
  await page.locator('[data-control="zoom"]').evaluate(element => { element.value = '0.5'; element.dispatchEvent(new Event('input', { bubbles: true })); });
  await expect(page.locator('[data-value="zoom"]')).toHaveText('0.50×');
  await expect(page.locator('[data-control="threshold"]')).toHaveAttribute('min', '0.9');
});

test('edge legend presents inverse similarity values with unchanged line styling', async ({ page }) => {
  const legend = page.locator('.msnw-legends svg[aria-label="Edge similarity from 1, light and thin, to 0, dark and thick"]');
  await expect(legend).toHaveCount(1);
  const values = await legend.evaluate(svg => [...svg.querySelectorAll('text')].slice(-2).map(item => item.textContent));
  expect(values).toEqual(['1', '0']);
  const lines = await legend.evaluate(svg => [...svg.querySelectorAll('line')].map(line => ({
    stroke: line.getAttribute('stroke'), width: Number(line.getAttribute('stroke-width')),
  })));
  expect(lines[0].width).toBe(1);
  expect(lines.at(-1).width).toBe(4);
  expect(lines[0].stroke).not.toBe(lines.at(-1).stroke);
});

test('FASTA and distance matrix uploads; validation failure preserves prior graph', async ({ page }) => {
  const loggedErrors = [];
  page.on('console', message => { if (message.type() === 'error') loggedErrors.push(message.text()); });
  await page.locator('[data-control="input"]').setInputFiles({ name: 'small.fasta', mimeType: 'text/plain', buffer: Buffer.from('>a\nACGT\n>b\nTCGT\n>c\nTCGT') });
  await expect.poll(async () => (await readStats(page)).samples).toBe(3);
  await page.locator('[data-control="input"]').setInputFiles({ name: 'bad.fasta', mimeType: 'text/plain', buffer: Buffer.from('>a\nACGT\n>b\nT') });
  await expect(page.locator('.msnw-notice')).toBeEmpty();
  expect(loggedErrors.some(message => message.includes('equally sized'))).toBe(true);
  expect((await readStats(page)).samples).toBe(3);
  await page.locator('[data-control="input"]').setInputFiles({ name: 'distance.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ ids: ['x', 'y'], matrix: [[0, 0.1], [0.1, 0]] })) });
  await expect.poll(async () => (await readStats(page)).samples).toBe(2);
  await expect(page.locator('[data-control="metric"]')).toHaveCount(0);
});

test('SVG, PNG, and PDF exports download successfully', async ({ page }) => {
  test.setTimeout(60000);
  await page.locator('[data-tab="export"]').click();
  for (const format of ['svg', 'png', 'pdf']) {
    const download = page.waitForEvent('download');
    await page.locator('[data-control="export-format"]').selectOption(format);
    await page.locator('[data-action="export"]').click();
    const file = await download;
    expect(file.suggestedFilename()).toBe(`minimum-spanning-network.${format}`);
    expect(await file.failure()).toBeNull();
  }
  await expect(page.locator('.msnw-notice')).toBeEmpty();
});

test('group selection recomputes an MSN from group members and color scales use Viridis', async ({ page }) => {
  await page.evaluate(async () => {
    await window.networkWidget.load({
      fasta: '>A1\nAAAA\n>B1\nAAAA\n>A2\nAAAT\n>B2\nTTTT',
      metadata: [
        { id: 'A1', group: 'A', year: 2020, elevation: 10, color_by: 'year; group' }, { id: 'B1', group: 'B', year: 2021, elevation: 20, color_by: 'year; group' },
        { id: 'A2', group: 'A', year: 2022, elevation: 30, color_by: 'year; group' }, { id: 'B2', group: 'B', year: 2023, elevation: 40, color_by: 'year; group' },
      ],
    });
  });
  await page.locator('[data-tab="labels"]').click();
  await page.locator('[data-control="group-by"]').selectOption('group');
  await page.locator('[data-control="group-value"]').selectOption({ label: 'A' });
  await expect.poll(async () => (await readStats(page)).samples).toBe(2);
  const groupedIds = await page.evaluate(() => window.networkWidget.getGraph().nodes().sort());
  expect(groupedIds).toEqual(['A1', 'A2']);
  const colorOptions = await page.locator('[data-control="color"] option').allTextContents();
  expect(colorOptions).toContain('year');
  expect(colorOptions).toContain('group');
  expect(colorOptions).not.toContain('elevation');
  expect(colorOptions).not.toContain('color_by');
  await page.locator('[data-control="color"]').selectOption('year');
  await expect(page.locator('.msnw-legends svg[aria-label="year continuous viridis scale"]')).toHaveCount(1);
  const initialColors = await page.locator('.msnw-pie path').evaluateAll(paths => paths.map(path => path.getAttribute('fill')));
  expect(initialColors.length).toBeGreaterThan(0);
  expect(initialColors.some(color => color !== '#287b78')).toBe(true);
  await page.locator('[data-control="font"]').selectOption('serif');
  await page.evaluate(() => window.networkWidget.setThreshold(0.9));
  const recolored = await page.locator('.msnw-pie path').evaluateAll(paths => paths.map(path => path.getAttribute('fill')));
  expect(recolored).toEqual(initialColors);
  await page.locator('[data-control="group-value"]').selectOption('');
  await expect.poll(async () => (await readStats(page)).samples).toBe(4);
});

test('similarity matrix uploads infer their type from the diagonal', async ({ page }) => {
  await page.locator('[data-control="input"]').setInputFiles({
    name: 'similarity.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ ids: ['x', 'y'], matrix: [[1, 0.8], [0.8, 1]] })),
  });
  await expect.poll(async () => (await readStats(page)).samples).toBe(2);
  const weight = await page.evaluate(() => window.networkWidget.getGraph().getEdgeAttribute(window.networkWidget.getGraph().edges()[0], 'weight'));
  expect(weight).toBeCloseTo(0.2);
});

test('tied-edge inclusion is optional and deterministic by default', async ({ page }) => {
  const edges = await page.evaluate(async () => {
    const { msnWidget } = await import('/src/index.js');
    const container = document.createElement('div'); document.body.append(container);
    const widget = msnWidget(container, { fasta: '>a\nAAA\n>b\nCCC\n>c\nGGG' }, { includeTies: true });
    await widget.ready;
    const count = widget.getGraph().size; widget.destroy(); container.remove();
    return count;
  });
  expect(edges).toBe(3);
});

test('worker-unavailable and explicitly workerless viewers use the synchronous fallback', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const OriginalWorker = window.Worker;
    const { msnWidget } = await import('/src/index.js');
    const firstContainer = document.createElement('div'); document.body.append(firstContainer);
    window.Worker = undefined;
    const automatic = msnWidget(firstContainer, { fasta: '>a\nAA\n>b\nAT' });
    await automatic.ready;
    const automaticCount = automatic.getGraph().order;
    automatic.destroy(); firstContainer.remove();

    const blockedContainer = document.createElement('div'); document.body.append(blockedContainer);
    window.Worker = class { constructor() { throw new Error('Workers are blocked in this viewer.'); } };
    const blocked = msnWidget(blockedContainer, { fasta: '>c\nGG\n>d\nGT' });
    await blocked.ready;
    const blockedCount = blocked.getGraph().order;
    blocked.destroy(); blockedContainer.remove();

    window.Worker = OriginalWorker;
    const secondContainer = document.createElement('div'); document.body.append(secondContainer);
    const forced = msnWidget(secondContainer, { fasta: '>x\nCC\n>y\nCT' }, { useWorker: false });
    await forced.ready;
    const forcedCount = forced.getGraph().order;
    forced.destroy(); secondContainer.remove();
    return { automaticCount, blockedCount, forcedCount };
  });
  expect(result).toEqual({ automaticCount: 2, blockedCount: 2, forcedCount: 2 });
});

test('mobile viewport and independent widget lifecycle', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await expect(page.locator('.msnw')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  const initialBounds = await page.locator('.msnw').evaluate(element => {
    const { right, bottom } = element.getBoundingClientRect();
    return { right, bottom, viewportWidth: innerWidth, viewportHeight: innerHeight };
  });
  expect(initialBounds.right).toBeLessThanOrEqual(initialBounds.viewportWidth);
  expect(initialBounds.bottom).toBeLessThanOrEqual(initialBounds.viewportHeight);
  await page.setViewportSize({ width: 375, height: 480 });
  await expect.poll(() => page.locator('.msnw-canvas').getAttribute('height')).not.toBeNull();
  const shortViewport = await page.locator('.msnw').evaluate(element => ({
    widgetBottom: element.getBoundingClientRect().bottom,
    plotHeight: element.querySelector('.msnw-plot').getBoundingClientRect().height,
    canvasHeight: Number(element.querySelector('.msnw-canvas').getAttribute('height')),
    viewportHeight: innerHeight,
  }));
  expect(shortViewport.widgetBottom).toBeLessThanOrEqual(shortViewport.viewportHeight);
  expect(shortViewport.plotHeight).toBeLessThan(440);
  expect(shortViewport.canvasHeight).toBeCloseTo(shortViewport.plotHeight, 0);
  const result = await page.evaluate(async () => {
    const { msnWidget } = await import('/src/index.js');
    const container = document.createElement('div'); document.body.append(container);
    const second = msnWidget(container, { fasta: '>x\nAA\n>y\nAT' });
    await second.ready;
    const count = second.getGraph().order;
    second.destroy();
    return { count, empty: container.children.length === 0, original: window.networkWidget.getGraph().order };
  });
  expect(result).toEqual({ count: 2, empty: true, original: 24 });
});

test('metadata stays with its dataset and superseded worker loads reject cleanly', async ({ page }) => {
  await page.evaluate(async () => {
    window.datasetWithMetadata = { fasta: '>a\nAAAA\n>b\nAAAT', metadata: [
      { name: 'Population', data: 'id,population\na,North\nb,South' },
      { name: 'Dates', data: 'id,year\na,2024\nb,2025' },
    ] };
    await window.networkWidget.load(window.datasetWithMetadata);
  });
  await page.locator('[data-control="metadata-table"]').selectOption('1');
  await page.evaluate(() => window.networkWidget.load({ fasta: '>x\nGGGG\n>y\nGGGT' }));
  await expect(page.locator('[data-control="metadata-table"] option')).toHaveCount(1);
  await expect(page.locator('[data-control="group-by"] option')).toHaveCount(1);
  await page.evaluate(() => window.networkWidget.load(window.datasetWithMetadata));
  await expect(page.locator('[data-control="metadata-table"] option')).toHaveCount(3);
  await expect(page.locator('[data-control="metadata-table"]')).toHaveValue('1');
  await page.locator('[data-tab="labels"]').click();
  await expect(page.locator('[data-control="group-by"]')).toContainText('year');
  await expect(page.locator('[data-control="group-by"]')).not.toContainText('population');
  const cancelled = await page.evaluate(async () => {
    const first = window.networkWidget.load({ fasta: '>old\nAA' }).catch(error => error.name);
    await window.networkWidget.load({ fasta: '>new\nAT' });
    return { name: await first, ids: window.networkWidget.getGraph().nodes() };
  });
  expect(cancelled).toEqual({ name: 'AbortError', ids: ['new'] });
});

test('cluster boundaries drag all members and allow Shift-lasso from their interiors', async ({ page }) => {
  await page.evaluate(async () => {
    await window.networkWidget.load({ fasta: `>a\n${'A'.repeat(20)}\n>b\n${'A'.repeat(19)}T\n>c\n${'T'.repeat(20)}` });
    window.networkWidget.setThreshold(0.9);
  });
  await page.locator('[data-tab="controls"]').click();
  await page.locator('[data-control="auto"]').uncheck();
  await page.waitForTimeout(1500);
  const cluster = page.locator('.msnw-canvas circle[role="button"]').first();
  await cluster.scrollIntoViewIfNeeded();
  const center = await cluster.evaluate(element => {
    const cx = Number(element.getAttribute('cx')), cy = Number(element.getAttribute('cy')), r = Number(element.getAttribute('r'));
    const matrix = element.getScreenCTM();
    const center = new DOMPoint(cx, cy).matrixTransform(matrix);
    for (const [dx, dy] of [[0, 0.5], [0, -0.5], [0.5, 0], [-0.5, 0]]) {
      const point = new DOMPoint(cx + dx * r, cy + dy * r).matrixTransform(matrix);
      if (document.elementFromPoint(point.x, point.y) === element) return { x: point.x, y: point.y, cx: center.x };
    }
    throw new Error('No unobstructed cluster interior point found.');
  });
  await page.mouse.move(center.x, center.y); await page.mouse.down();
  await page.mouse.move(center.x + 50, center.y + 35, { steps: 10 });
  await expect(page.locator('[data-action="hide"]')).toBeHidden();
  await page.mouse.up();
  const selected = await page.evaluate(() => window.networkWidget.getState().selected.sort());
  expect(selected).toEqual(['a', 'b']);
  const movedCenter = await cluster.evaluate(element => {
    const point = new DOMPoint(Number(element.getAttribute('cx')), Number(element.getAttribute('cy'))).matrixTransform(element.getScreenCTM());
    return { x: point.x, y: point.y };
  });
  expect(movedCenter.x).toBeGreaterThan(center.cx + 20);
  await page.keyboard.down('Shift');
  await page.mouse.move(movedCenter.x, movedCenter.y); await page.mouse.down();
  await page.mouse.move(movedCenter.x + 30, movedCenter.y + 30, { steps: 5 });
  await expect(page.locator('.msnw-canvas > path')).toHaveAttribute('d', /M/);
  await page.mouse.up(); await page.keyboard.up('Shift');
});

test('built library resolves its worker relative to its nested deployment path', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { msnWidget } = await import('/dist-lib/msnwidget.js');
    const container = document.createElement('div'); document.body.append(container);
    const widget = msnWidget(container, { fasta: '>a\nAC\n>b\nAT' });
    await widget.ready;
    const count = widget.getGraph().order; widget.destroy(); container.remove();
    return count;
  });
  expect(result).toBe(2);
});

test('slow earlier uploads cannot replace newer files', async ({ page }) => {
  await page.evaluate(() => {
    const original = File.prototype.text;
    File.prototype.text = async function() {
      if (this.name === 'slow.fasta') await new Promise(resolve => { window.releaseSlowFile = resolve; });
      return original.call(this);
    };
  });
  await page.locator('[data-control="input"]').setInputFiles({ name: 'slow.fasta', mimeType: 'text/plain', buffer: Buffer.from('>slow\nAA') });
  await page.locator('[data-control="input"]').setInputFiles({ name: 'new.fasta', mimeType: 'text/plain', buffer: Buffer.from('>new\nAT') });
  await expect.poll(async () => (await readStats(page)).samples).toBe(1);
  await page.evaluate(() => window.releaseSlowFile());
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => window.networkWidget.getGraph().nodes())).toEqual(['new']);
});

test('lasso selects enclosed nodes and graph snapshots do not mutate widget metadata', async ({ page }) => {
  await page.evaluate(() => window.networkWidget.setThreshold(1));
  const node = page.locator('.msnw-canvas g[role="button"]').first();
  await node.scrollIntoViewIfNeeded();
  const point = await node.evaluate(element => {
    const center = new DOMPoint(0, 0).matrixTransform(element.getScreenCTM());
    return { x: center.x, y: center.y };
  });
  await page.keyboard.down('Shift');
  await page.mouse.move(point.x - 30, point.y - 30); await page.mouse.down();
  await page.mouse.move(point.x + 30, point.y - 30, { steps: 4 });
  await page.mouse.move(point.x + 30, point.y + 30, { steps: 4 });
  await page.mouse.move(point.x - 30, point.y + 30, { steps: 4 });
  await page.mouse.move(point.x - 30, point.y - 30, { steps: 4 });
  await page.mouse.up(); await page.keyboard.up('Shift');
  expect(await page.evaluate(() => window.networkWidget.getState().selected)).toContain('S001');
  const population = await page.evaluate(() => {
    const copy = window.networkWidget.getGraph();
    copy.getNodeAttribute('S001', 'records')[0].population = 'Changed';
    return window.networkWidget.getGraph().getNodeAttribute('S001', 'records')[0].population;
  });
  expect(population).toBe('Coastal');
});
