import { test, expect } from '@playwright/test';
import { loadApp, resetCanvas, createNotePane } from './helpers.js';

test.describe('Note pane', () => {
  test.beforeEach(async ({ page }) => {
    await loadApp(page);
    await resetCanvas(page);
  });

  test('note pane renders with editor', async ({ page }) => {
    const pane = await createNotePane(page, { x: 200, y: 200 });
    const paneEl = page.locator(`#pane-${pane.id}`);
    await expect(paneEl).toBeVisible();
    // Should have a contenteditable area or textarea
    const hasEditor = await paneEl.evaluate(el =>
      !!el.querySelector('[contenteditable]') || !!el.querySelector('textarea') || !!el.querySelector('.note-editor')
    );
    expect(hasEditor).toBe(true);
  });

  test('note pane has header with title', async ({ page }) => {
    const pane = await createNotePane(page, { x: 200, y: 200 });
    const header = page.locator(`#pane-${pane.id} .pane-header`);
    await expect(header).toBeVisible();
  });

  test('note pane has close button', async ({ page }) => {
    const pane = await createNotePane(page, { x: 200, y: 200 });
    const closeBtn = page.locator(`#pane-${pane.id} .pane-close`);
    await expect(closeBtn).toBeVisible();
  });

  test('note pane has resize handle', async ({ page }) => {
    const pane = await createNotePane(page, { x: 200, y: 200 });
    const handle = page.locator(`#pane-${pane.id} .pane-resize-handle`);
    await expect(handle).toBeAttached();
  });
});
