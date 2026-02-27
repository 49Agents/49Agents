import { requireAuth } from '../auth/middleware.js';
import { getLayoutsByUser, saveFullLayout, updatePaneLayout, deletePaneLayout, upsertPaneLayout } from '../db/layouts.js';
import { getNotesByUser, getNoteById, upsertNote, deleteNote } from '../db/noteSync.js';
import { getViewState, saveViewState } from '../db/viewState.js';
import { checkImageLimit } from '../billing/enforcement.js';

/**
 * Set up layout persistence routes.
 * These are cloud-direct endpoints (NOT relayed through agents).
 */
export function setupLayoutRoutes(app) {

  // =====================
  // LAYOUTS
  // =====================

  // GET /api/layouts — load user's full canvas layout
  app.get('/api/layouts', requireAuth, (req, res) => {
    const layouts = getLayoutsByUser(req.user.id);
    // Parse metadata JSON for each layout
    const parsed = layouts.map(l => ({
      ...l,
      metadata: l.metadata ? JSON.parse(l.metadata) : null,
    }));
    res.json({ layouts: parsed });
  });

  // PUT /api/layouts — save full canvas state (replace all)
  app.put('/api/layouts', requireAuth, (req, res) => {
    const { panes } = req.body;
    if (!Array.isArray(panes)) {
      return res.status(400).json({ error: 'panes array is required' });
    }
    saveFullLayout(req.user.id, panes);
    res.json({ ok: true, count: panes.length });
  });

  // PATCH /api/layouts/:paneId — update single pane position/size
  app.patch('/api/layouts/:paneId', requireAuth, (req, res) => {
    updatePaneLayout(req.user.id, req.params.paneId, req.body);
    res.json({ ok: true });
  });

  // PUT /api/layouts/:paneId — upsert a single pane layout
  app.put('/api/layouts/:paneId', requireAuth, (req, res) => {
    upsertPaneLayout(req.user.id, { id: req.params.paneId, ...req.body });
    res.json({ ok: true });
  });

  // DELETE /api/layouts/:paneId — remove a pane from cloud layout
  app.delete('/api/layouts/:paneId', requireAuth, (req, res) => {
    deletePaneLayout(req.user.id, req.params.paneId);
    res.json({ ok: true });
  });

  // =====================
  // CLOUD-SYNCED NOTES
  // =====================

  // GET /api/cloud-notes — get all cloud-synced notes
  app.get('/api/cloud-notes', requireAuth, (req, res) => {
    const notes = getNotesByUser(req.user.id);
    res.json({ notes });
  });

  // GET /api/cloud-notes/:id — get a single note
  app.get('/api/cloud-notes/:id', requireAuth, (req, res) => {
    const note = getNoteById(req.user.id, req.params.id);
    if (!note) return res.status(404).json({ error: 'Note not found' });
    res.json(note);
  });

  // PUT /api/cloud-notes/:id — create or update note content
  app.put('/api/cloud-notes/:id', requireAuth, (req, res) => {
    const { content, fontSize, images } = req.body;
    // Enforce image limit if images are being saved
    if (images && images.length > 0) {
      // Count how many new images are being added vs what this note already has
      const existing = getNoteById(req.user.id, req.params.id);
      const existingCount = existing?.images?.length || 0;
      const newCount = images.length - existingCount;
      if (newCount > 0) {
        const blocked = checkImageLimit(req.user.id, newCount);
        if (blocked) return res.status(403).json(blocked);
      }
    }
    upsertNote(req.user.id, req.params.id, content, fontSize, images);
    res.json({ ok: true });
  });

  // DELETE /api/cloud-notes/:id — delete a note from cloud
  app.delete('/api/cloud-notes/:id', requireAuth, (req, res) => {
    deleteNote(req.user.id, req.params.id);
    res.json({ ok: true });
  });

  // =====================
  // VIEW STATE
  // =====================

  // GET /api/view-state — get saved zoom/pan
  app.get('/api/view-state', requireAuth, (req, res) => {
    const viewState = getViewState(req.user.id);
    res.json(viewState || { zoom: 1.0, pan_x: 0, pan_y: 0 });
  });

  // PUT /api/view-state — save zoom/pan
  app.put('/api/view-state', requireAuth, (req, res) => {
    const { zoom, panX, panY } = req.body;
    saveViewState(req.user.id, zoom, panX, panY);
    res.json({ ok: true });
  });
}
