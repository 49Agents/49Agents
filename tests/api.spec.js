import { test, expect } from '@playwright/test';

test.describe('API endpoints', () => {
  test('GET /api/me returns dev user', async ({ request }) => {
    const res = await request.get('/api/me');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.id).toBeTruthy();
    expect(body.login).toBe('dev-user');
    expect(body.tier).toBeTruthy();
    expect(body.features).toBeTruthy();
  });

  test('GET /api/agents returns array', async ({ request }) => {
    const res = await request.get('/api/agents');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.agents)).toBe(true);
  });

  test('GET /api/layouts returns layouts', async ({ request }) => {
    const res = await request.get('/api/layouts');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.layouts)).toBe(true);
  });

  test('GET /api/view-state returns zoom/pan', async ({ request }) => {
    const res = await request.get('/api/view-state');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(typeof body.zoom).toBe('number');
    expect(typeof body.pan_x).toBe('number');
    expect(typeof body.pan_y).toBe('number');
  });

  test('PUT /api/view-state saves and persists', async ({ request }) => {
    const payload = { zoom: 1.5, panX: 100, panY: -200 };
    const putRes = await request.put('/api/view-state', { data: payload });
    expect(putRes.status()).toBe(200);

    const getRes = await request.get('/api/view-state');
    const body = await getRes.json();
    expect(body.zoom).toBeCloseTo(1.5, 1);
    expect(body.pan_x).toBeCloseTo(100, 0);
    expect(body.pan_y).toBeCloseTo(-200, 0);

    // Restore
    await request.put('/api/view-state', { data: { zoom: 1, panX: 0, panY: 0 } });
  });

  test('GET /api/cloud-notes returns notes array', async ({ request }) => {
    const res = await request.get('/api/cloud-notes');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.notes)).toBe(true);
  });

  test('PUT + GET + DELETE cloud note lifecycle', async ({ request }) => {
    const noteId = 'test-note-' + Date.now();

    // Create
    const putRes = await request.put(`/api/cloud-notes/${noteId}`, {
      data: { content: 'Hello from E2E test', fontSize: 14 },
    });
    expect(putRes.status()).toBe(200);

    // Read
    const getRes = await request.get(`/api/cloud-notes/${noteId}`);
    expect(getRes.status()).toBe(200);
    const note = await getRes.json();
    expect(note.content).toBe('Hello from E2E test');

    // Delete
    const delRes = await request.delete(`/api/cloud-notes/${noteId}`);
    expect(delRes.status()).toBe(200);

    // Verify gone
    const gone = await request.get(`/api/cloud-notes/${noteId}`);
    expect(gone.status()).toBe(404);
  });

  test('PUT /api/layouts saves pane layout', async ({ request }) => {
    const panes = [
      { id: 'test-pane-1', paneType: 'note', positionX: 100, positionY: 100, width: 400, height: 300, zIndex: 1 },
      { id: 'test-pane-2', paneType: 'iframe', positionX: 600, positionY: 100, width: 600, height: 400, zIndex: 2, metadata: { url: 'https://example.com' } },
    ];
    const putRes = await request.put('/api/layouts', { data: { panes } });
    expect(putRes.status()).toBe(200);
    const putBody = await putRes.json();
    expect(putBody.count).toBe(2);

    // Verify
    const getRes = await request.get('/api/layouts');
    const layouts = await getRes.json();
    expect(layouts.layouts.length).toBeGreaterThanOrEqual(2);
  });

  test('PATCH /api/layouts/:id updates position', async ({ request }) => {
    // Seed a pane
    await request.put('/api/layouts', {
      data: { panes: [{ id: 'patch-test', paneType: 'note', positionX: 0, positionY: 0, width: 400, height: 300, zIndex: 1 }] },
    });

    const patchRes = await request.patch('/api/layouts/patch-test', {
      data: { positionX: 500, positionY: 250 },
    });
    expect(patchRes.status()).toBe(200);
  });

  test('DELETE /api/layouts/:id removes pane', async ({ request }) => {
    await request.put('/api/layouts', {
      data: { panes: [{ id: 'delete-test', paneType: 'note', positionX: 0, positionY: 0, width: 400, height: 300, zIndex: 1 }] },
    });

    const delRes = await request.delete('/api/layouts/delete-test');
    expect(delRes.status()).toBe(200);
  });
});
