import { test, expect } from '@playwright/test';
import { loadApp, resetCanvas, createNotePane, getState } from './helpers.js';

test.describe('Keyboard shortcuts', () => {
  test.beforeEach(async ({ page }) => {
    await loadApp(page);
    await resetCanvas(page);
  });

  test('clicking add-pane button opens menu', async ({ page }) => {
    await page.click('#add-pane-btn');
    const menu = page.locator('#add-pane-menu');
    await expect(menu).toBeVisible({ timeout: 2000 });
  });

  test('Escape closes add-pane menu', async ({ page }) => {
    await page.click('#add-pane-btn');
    await expect(page.locator('#add-pane-menu')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#add-pane-menu')).not.toBeVisible();
  });

  test('expand pane with keybinding', async ({ page }) => {
    const pane = await createNotePane(page, { x: 200, y: 200, width: 400, height: 300 });
    // Assign shortcut 1
    await page.evaluate((id) => {
      const p = window.TC2_DEBUG.state.panes.find(p => p.id === id);
      if (p) p.shortcutNumber = 1;
    }, pane.id);

    // Expand via debug API
    const expanded = await page.evaluate((id) => {
      window.TC2_DEBUG.expandPane(id);
      return window.TC2_DEBUG.expandedPaneId;
    }, pane.id);
    expect(expanded).toBe(pane.id);

    // Collapse
    await page.evaluate((id) => {
      window.TC2_DEBUG.collapsePane(id);
    }, pane.id);
    const collapsed = await page.evaluate(() => window.TC2_DEBUG.expandedPaneId);
    expect(collapsed).toBeFalsy();
  });
});
