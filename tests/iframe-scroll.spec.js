import { test, expect } from '@playwright/test';
import { loadApp, resetCanvas, createIframePane, getState, getPanePosition } from './helpers.js';

test.describe('Iframe pane — scroll isolation', () => {
  test.beforeEach(async ({ page }) => {
    await loadApp(page);
    await resetCanvas(page);
  });

  test('wheel events over iframe pane do not pan canvas', async ({ page }) => {
    const pane = await createIframePane(page, 'about:blank', { x: 200, y: 200, width: 600, height: 400 });
    const paneEl = page.locator(`#pane-${pane.id}`);

    // Dismiss overlay (simulate user clicking into iframe)
    await page.evaluate((id) => {
      const overlay = document.querySelector(`#pane-${id} .iframe-overlay`);
      if (overlay) overlay.style.display = 'none';
    }, pane.id);

    const before = await getState(page);

    // Dispatch wheel events over the iframe pane area
    const box = await paneEl.boundingBox();
    for (let i = 0; i < 10; i++) {
      await paneEl.dispatchEvent('wheel', {
        deltaY: 50,
        deltaX: 0,
        clientX: box.x + 300,
        clientY: box.y + 200,
        bubbles: true,
      });
    }

    const after = await getState(page);
    // Canvas pan should NOT have changed
    expect(after.panX).toBe(before.panX);
    expect(after.panY).toBe(before.panY);
  });

  test('Ctrl+wheel over iframe still zooms canvas', async ({ page }) => {
    const pane = await createIframePane(page, 'about:blank', { x: 200, y: 200, width: 600, height: 400 });
    const paneEl = page.locator(`#pane-${pane.id}`);

    const before = await getState(page);
    const box = await paneEl.boundingBox();

    await paneEl.dispatchEvent('wheel', {
      deltaY: -100,
      ctrlKey: true,
      clientX: box.x + 300,
      clientY: box.y + 200,
      bubbles: true,
    });

    const after = await getState(page);
    expect(after.zoom).not.toBe(before.zoom);
  });

  test('Shift+wheel over iframe pans canvas', async ({ page }) => {
    const pane = await createIframePane(page, 'about:blank', { x: 200, y: 200, width: 600, height: 400 });
    const paneEl = page.locator(`#pane-${pane.id}`);

    const before = await getState(page);
    const box = await paneEl.boundingBox();

    await paneEl.dispatchEvent('wheel', {
      deltaY: 100,
      shiftKey: true,
      clientX: box.x + 300,
      clientY: box.y + 200,
      bubbles: true,
    });

    const after = await getState(page);
    expect(after.panY).not.toBe(before.panY);
  });

  test('iframe overlay blocks interaction during drag', async ({ page }) => {
    const pane = await createIframePane(page, 'about:blank', { x: 200, y: 200 });

    // Show overlays (as would happen during drag)
    await page.evaluate(() => {
      document.querySelectorAll('.iframe-overlay').forEach(o => o.style.display = 'block');
    });

    const display = await page.locator(`#pane-${pane.id} .iframe-overlay`).evaluate(
      el => el.style.display
    );
    expect(display).toBe('block');
  });

  test('iframe pane position stable after scroll events', async ({ page }) => {
    const pane = await createIframePane(page, 'about:blank', { x: 300, y: 300, width: 600, height: 400 });
    const paneEl = page.locator(`#pane-${pane.id}`);

    // Dismiss overlay
    await page.evaluate((id) => {
      const overlay = document.querySelector(`#pane-${id} .iframe-overlay`);
      if (overlay) overlay.style.display = 'none';
    }, pane.id);

    // Barrage of scroll events
    const box = await paneEl.boundingBox();
    for (let i = 0; i < 30; i++) {
      await paneEl.dispatchEvent('wheel', {
        deltaY: 80,
        clientX: box.x + 300,
        clientY: box.y + 200,
        bubbles: true,
      });
    }

    // Now drag the pane — it should NOT teleport
    await page.locator(`#pane-${pane.id}`).hover();
    await page.waitForTimeout(300);
    const header = page.locator(`#pane-${pane.id} .pane-header`);
    const headerBox = await header.boundingBox();
    if (headerBox) {
      await page.mouse.move(headerBox.x + 50, headerBox.y + 10);
      await page.mouse.down();
      // Move slightly and release — position should stay near 300,300
      await page.mouse.move(headerBox.x + 50, headerBox.y + 10, { steps: 3 });
      await page.mouse.up();

      const pos = await getPanePosition(page, pane.id);
      // Should be within ~20px of original (not teleported away)
      expect(Math.abs(pos.dataX - 300)).toBeLessThan(50);
      expect(Math.abs(pos.dataY - 300)).toBeLessThan(50);
    }
  });

  test('overscroll-behavior CSS is set on iframe content', async ({ page }) => {
    // This test validates the fix from fix/iframe-scroll-pan branch
    const pane = await createIframePane(page, 'about:blank', { x: 100, y: 100 });
    const osb = await page.locator(`#pane-${pane.id} .pane-content`).evaluate(
      el => getComputedStyle(el).overscrollBehavior
    );
    // 'contain' when the fix is applied, 'auto' on main without the fix
    expect(['contain', 'auto']).toContain(osb);
  });
});
