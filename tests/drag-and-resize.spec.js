import { test, expect } from '@playwright/test';
import { loadApp, resetCanvas, createNotePane, createIframePane, getPanePosition } from './helpers.js';

test.describe('Pane drag and resize', () => {
  test.beforeEach(async ({ page }) => {
    await loadApp(page);
    await resetCanvas(page);
  });

  test('drag pane by header moves it', async ({ page }) => {
    const pane = await createNotePane(page, { x: 200, y: 200, width: 400, height: 300 });
    const header = page.locator(`#pane-${pane.id} .pane-header`);

    // Drag header 150px right, 100px down
    const box = await header.boundingBox();
    await page.mouse.move(box.x + 50, box.y + 10);
    await page.mouse.down();
    await page.mouse.move(box.x + 200, box.y + 110, { steps: 10 });
    await page.mouse.up();

    const pos = await getPanePosition(page, pane.id);
    // Should have moved approximately 150 right, 100 down
    expect(pos.dataX).toBeGreaterThan(300);
    expect(pos.dataY).toBeGreaterThan(250);
  });

  test('drag does not move pane when clicking body (not header)', async ({ page }) => {
    const pane = await createNotePane(page, { x: 200, y: 200, width: 400, height: 300 });
    const paneEl = page.locator(`#pane-${pane.id}`);
    const box = await paneEl.boundingBox();

    // Click in the body area (below header, which is 32px)
    await page.mouse.move(box.x + 50, box.y + 100);
    await page.mouse.down();
    await page.mouse.move(box.x + 200, box.y + 200, { steps: 10 });
    await page.mouse.up();

    const pos = await getPanePosition(page, pane.id);
    // Position should be unchanged
    expect(pos.dataX).toBeCloseTo(200, -1);
    expect(pos.dataY).toBeCloseTo(200, -1);
  });

  test('drag position is consistent after multiple drags', async ({ page }) => {
    const pane = await createNotePane(page, { x: 200, y: 200, width: 400, height: 300 });

    // Perform 3 sequential drags — position should accumulate cleanly
    for (let i = 0; i < 3; i++) {
      const header = page.locator(`#pane-${pane.id} .pane-header`);
      const box = await header.boundingBox();
      await page.mouse.move(box.x + 50, box.y + 10);
      await page.mouse.down();
      await page.mouse.move(box.x + 100, box.y + 10, { steps: 5 });
      await page.mouse.up();
      // Small wait for state to settle
      await page.waitForTimeout(50);
    }

    const pos = await getPanePosition(page, pane.id);
    // Should have moved ~150px right total (3 * 50px, accounting for snap)
    expect(pos.dataX).toBeGreaterThan(300);
    // DOM and data should be consistent
    expect(pos.domLeft).toBeCloseTo(pos.dataX, 0);
    expect(pos.domTop).toBeCloseTo(pos.dataY, 0);
  });

  test('dragging iframe pane shows overlays', async ({ page }) => {
    const pane = await createIframePane(page, 'about:blank', { x: 200, y: 200 });
    const header = page.locator(`#pane-${pane.id} .pane-header`);

    // Hover to make header visible (it's opacity:0 normally)
    await page.locator(`#pane-${pane.id}`).hover();
    await page.waitForTimeout(300); // wait for opacity transition

    const box = await header.boundingBox();
    if (!box) {
      test.skip(true, 'iframe header not visible for drag test');
      return;
    }

    await page.mouse.move(box.x + 50, box.y + 10);
    await page.mouse.down();

    // During drag, iframe overlay should be visible
    const overlayDisplay = await page.locator(`#pane-${pane.id} .iframe-overlay`).evaluate(
      el => getComputedStyle(el).display
    );
    expect(overlayDisplay).toBe('block');

    await page.mouse.up();
  });

  test('resize handle changes pane size', async ({ page }) => {
    const pane = await createNotePane(page, { x: 200, y: 200, width: 400, height: 300 });
    const handle = page.locator(`#pane-${pane.id} .pane-resize-handle`);
    const box = await handle.boundingBox();

    // Long-press to trigger resize (the resize uses a hold timer)
    await page.mouse.move(box.x + 5, box.y + 5);
    await page.mouse.down();
    // Hold for resize activation time
    await page.waitForTimeout(200);
    await page.mouse.move(box.x + 105, box.y + 55, { steps: 10 });
    await page.mouse.up();

    const pos = await getPanePosition(page, pane.id);
    // Width should have increased by ~100px
    expect(pos).not.toBeNull();
    const state = await page.evaluate((id) => {
      const p = window.TC2_DEBUG.state.panes.find(p => p.id === id);
      return { width: p.width, height: p.height };
    }, pane.id);
    expect(state.width).toBeGreaterThan(420);
  });
});
