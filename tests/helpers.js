/**
 * Shared helpers for 49Agents E2E tests.
 *
 * The cloud server runs in dev mode (no OAuth) so all requests
 * auto-authenticate as the dev user — no login flow needed.
 */

/**
 * Navigate to the app and wait for the canvas to be ready.
 * Returns the debug handle (TC2_DEBUG) for programmatic control.
 */
export async function loadApp(page) {
  // Skip tutorial redirect — fresh localStorage triggers redirect to /tutorial
  await page.addInitScript(() => {
    localStorage.setItem('tc_tutorial', 'completed');
  });
  await page.goto('/');
  // Wait for the canvas element to exist
  await page.waitForSelector('#canvas', { timeout: 10_000 });
  // Wait for the app to finish initializing (TC2_DEBUG is set at the end of the IIFE)
  await page.waitForFunction(() => window.TC2_DEBUG?.state, { timeout: 10_000 });
}

/**
 * Get the current canvas state from the browser.
 */
export async function getState(page) {
  return page.evaluate(() => {
    const s = window.TC2_DEBUG.state;
    return {
      zoom: s.zoom,
      panX: s.panX,
      panY: s.panY,
      paneCount: s.panes.length,
      panes: s.panes.map(p => ({
        id: p.id,
        type: p.type,
        x: p.x,
        y: p.y,
        width: p.width,
        height: p.height,
        zIndex: p.zIndex,
        url: p.url || null,
      })),
    };
  });
}

/**
 * Create an iframe pane programmatically via TC2_DEBUG.
 * Returns the pane data.
 */
export async function createIframePane(page, url, { x = 100, y = 100, width = 600, height = 400 } = {}) {
  return page.evaluate(({ url, x, y, width, height }) => {
    const dbg = window.TC2_DEBUG;
    const id = 'test-iframe-' + Date.now();
    const paneData = {
      id,
      type: 'iframe',
      x, y, width, height,
      zIndex: dbg.state.nextZIndex++,
      url,
      shortcutNumber: dbg.getNextShortcutNumber(),
    };
    dbg.state.panes.push(paneData);
    dbg.renderIframePane(paneData);
    return { ...paneData };
  }, { url, x, y, width, height });
}

/**
 * Create a note pane programmatically via TC2_DEBUG.
 * Returns the pane data.
 */
export async function createNotePane(page, { x = 100, y = 100, width = 400, height = 300, content = '' } = {}) {
  return page.evaluate(({ x, y, width, height, content }) => {
    const dbg = window.TC2_DEBUG;
    const id = 'test-note-' + Date.now();
    const paneData = {
      id,
      type: 'note',
      x, y, width, height,
      zIndex: dbg.state.nextZIndex++,
      shortcutNumber: dbg.getNextShortcutNumber(),
      content: content || '',
    };
    dbg.state.panes.push(paneData);
    dbg.renderNotePane(paneData);
    return { ...paneData };
  }, { x, y, width, height, content });
}

/**
 * Get a pane's current position from both the data model and the DOM.
 */
export async function getPanePosition(page, paneId) {
  return page.evaluate((id) => {
    const pane = window.TC2_DEBUG.state.panes.find(p => p.id === id);
    const el = document.getElementById(`pane-${id}`);
    if (!pane || !el) return null;
    const rect = el.getBoundingClientRect();
    return {
      dataX: pane.x,
      dataY: pane.y,
      domLeft: parseFloat(el.style.left),
      domTop: parseFloat(el.style.top),
      screenX: rect.left,
      screenY: rect.top,
      screenWidth: rect.width,
      screenHeight: rect.height,
    };
  }, paneId);
}

/**
 * Delete a pane by ID.
 */
export async function deletePane(page, paneId) {
  return page.evaluate((id) => {
    window.TC2_DEBUG.deletePane(id);
  }, paneId);
}

/**
 * Reset canvas to default zoom/pan.
 */
export async function resetCanvas(page) {
  return page.evaluate(() => {
    const s = window.TC2_DEBUG.state;
    s.panX = 0;
    s.panY = 0;
    s.zoom = 1;
    window.TC2_DEBUG.updateCanvasTransform();
  });
}
