import { test, expect } from '@playwright/test';
import { loadApp } from './helpers.js';

test.describe('App loading and initialization', () => {
  test('serves index.html at root', async ({ page }) => {
    await loadApp(page);
    await expect(page).toHaveTitle('49Agents');
  });

  test('canvas container exists', async ({ page }) => {
    await loadApp(page);
    await expect(page.locator('#canvas-container')).toBeVisible();
    await expect(page.locator('#canvas')).toBeAttached();
  });

  test('TC2_DEBUG is exposed', async ({ page }) => {
    await loadApp(page);
    const hasDebug = await page.evaluate(() => !!window.TC2_DEBUG?.state);
    expect(hasDebug).toBe(true);
  });

  test('add-pane button exists', async ({ page }) => {
    await loadApp(page);
    await expect(page.locator('#add-pane-btn')).toBeVisible();
  });

  test('styles.css loads', async ({ page }) => {
    const res = await page.goto('/styles.css');
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('css');
  });

  test('app.min.js loads', async ({ page }) => {
    const res = await page.goto('/app.min.js');
    expect(res.status()).toBe(200);
  });

  test('no console errors on load', async ({ page }) => {
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    await loadApp(page);
    // Filter out expected errors (WebSocket when no agent, CSP font warnings)
    const unexpected = errors.filter(e =>
      !e.includes('WebSocket') &&
      !e.includes('ERR_CONNECTION_REFUSED') &&
      !e.includes('Content Security Policy') &&
      !e.includes('fonts.googleapis.com')
    );
    expect(unexpected).toEqual([]);
  });

  test('login page is accessible', async ({ page }) => {
    const res = await page.goto('/login');
    expect(res.status()).toBe(200);
  });

  test('tutorial page is accessible', async ({ page }) => {
    const res = await page.goto('/tutorial');
    expect(res.status()).toBe(200);
  });
});
