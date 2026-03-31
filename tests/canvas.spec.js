import { test, expect } from '@playwright/test';
import { loadApp, getState, resetCanvas } from './helpers.js';

test.describe('Canvas — zoom, pan, and transform', () => {
  test.beforeEach(async ({ page }) => {
    await loadApp(page);
    await resetCanvas(page);
  });

  test('canvas loads with default state', async ({ page }) => {
    const state = await getState(page);
    expect(state.zoom).toBe(1);
    expect(state.panX).toBe(0);
    expect(state.panY).toBe(0);
  });

  test('Ctrl+scroll zooms the canvas', async ({ page }) => {
    const container = page.locator('#canvas-container');
    await container.dispatchEvent('wheel', {
      deltaY: -100,
      ctrlKey: true,
      clientX: 700,
      clientY: 450,
    });
    const state = await getState(page);
    expect(state.zoom).toBeGreaterThan(1);
  });

  test('scroll on empty canvas pans', async ({ page }) => {
    const container = page.locator('#canvas-container');
    // Scroll down — should decrease panY
    await container.dispatchEvent('wheel', {
      deltaY: 100,
      deltaX: 0,
      clientX: 700,
      clientY: 450,
    });
    const state = await getState(page);
    expect(state.panY).toBeLessThan(0);
  });

  test('scroll on empty canvas pans horizontally', async ({ page }) => {
    const container = page.locator('#canvas-container');
    await container.dispatchEvent('wheel', {
      deltaY: 0,
      deltaX: 100,
      clientX: 700,
      clientY: 450,
    });
    const state = await getState(page);
    expect(state.panX).toBeLessThan(0);
  });

  test('setZoom via debug API works', async ({ page }) => {
    await page.evaluate(() => window.TC2_DEBUG.setZoom(0.5, 700, 450));
    const state = await getState(page);
    expect(state.zoom).toBeCloseTo(0.5, 1);
  });

  test('zoom is clamped to min/max', async ({ page }) => {
    await page.evaluate(() => window.TC2_DEBUG.setZoom(0.01, 0, 0));
    let state = await getState(page);
    expect(state.zoom).toBeGreaterThanOrEqual(0.05);

    await page.evaluate(() => window.TC2_DEBUG.setZoom(10, 0, 0));
    state = await getState(page);
    expect(state.zoom).toBeLessThanOrEqual(4);
  });

  test('canvas transform CSS matches state', async ({ page }) => {
    await page.evaluate(() => {
      const s = window.TC2_DEBUG.state;
      s.panX = 150;
      s.panY = -200;
      s.zoom = 0.75;
      window.TC2_DEBUG.updateCanvasTransform();
    });
    const transform = await page.locator('#canvas').evaluate(el => el.style.transform);
    expect(transform).toContain('translate(150px, -200px)');
    expect(transform).toContain('scale(0.75)');
  });
});
