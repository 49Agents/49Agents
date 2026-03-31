import { test, expect } from '@playwright/test';
import { loadApp, getState, resetCanvas, createNotePane, createIframePane, getPanePosition, deletePane } from './helpers.js';

test.describe('Pane lifecycle — create, position, close', () => {
  test.beforeEach(async ({ page }) => {
    await loadApp(page);
    await resetCanvas(page);
  });

  test('add-pane menu opens and shows pane types', async ({ page }) => {
    await page.click('#add-pane-btn');
    const menu = page.locator('#add-pane-menu');
    await expect(menu).toBeVisible();
    // Check all pane types are listed
    await expect(menu.locator('[data-type="terminal"]')).toBeVisible();
    await expect(menu.locator('[data-type="note"]')).toBeVisible();
    await expect(menu.locator('[data-type="iframe"]')).toBeVisible();
    await expect(menu.locator('[data-type="file"]')).toBeVisible();
  });

  test('create note pane programmatically', async ({ page }) => {
    const pane = await createNotePane(page, { x: 200, y: 150 });
    const state = await getState(page);
    expect(state.panes.some(p => p.id === pane.id)).toBe(true);

    const el = page.locator(`#pane-${pane.id}`);
    await expect(el).toBeVisible();
  });

  test('pane DOM position matches data model', async ({ page }) => {
    const pane = await createNotePane(page, { x: 300, y: 250 });
    const pos = await getPanePosition(page, pane.id);
    expect(pos).not.toBeNull();
    expect(pos.domLeft).toBeCloseTo(300, 0);
    expect(pos.domTop).toBeCloseTo(250, 0);
    expect(pos.dataX).toBeCloseTo(300, 0);
    expect(pos.dataY).toBeCloseTo(250, 0);
  });

  test('create iframe pane with URL', async ({ page }) => {
    const pane = await createIframePane(page, 'about:blank', { x: 100, y: 100 });
    const el = page.locator(`#pane-${pane.id}`);
    await expect(el).toBeVisible();
    await expect(el.locator('.iframe-embed')).toHaveAttribute('src', 'about:blank');
  });

  test('delete pane removes from state and DOM', async ({ page }) => {
    const pane = await createNotePane(page, { x: 100, y: 100 });
    await expect(page.locator(`#pane-${pane.id}`)).toBeVisible();

    await deletePane(page, pane.id);
    await expect(page.locator(`#pane-${pane.id}`)).not.toBeAttached();

    const state = await getState(page);
    expect(state.panes.some(p => p.id === pane.id)).toBe(false);
  });

  test('close button removes pane', async ({ page }) => {
    const pane = await createNotePane(page, { x: 200, y: 200, width: 400, height: 300 });
    const paneEl = page.locator(`#pane-${pane.id}`);
    await expect(paneEl).toBeVisible();

    // Click the close button in the header
    await paneEl.locator('.pane-close').click();
    await expect(paneEl).not.toBeAttached({ timeout: 3000 });
  });

  test('multiple panes have different z-index', async ({ page }) => {
    const p1 = await createNotePane(page, { x: 100, y: 100 });
    const p2 = await createNotePane(page, { x: 200, y: 200 });
    const state = await getState(page);
    const z1 = state.panes.find(p => p.id === p1.id).zIndex;
    const z2 = state.panes.find(p => p.id === p2.id).zIndex;
    expect(z2).toBeGreaterThan(z1);
  });
});
