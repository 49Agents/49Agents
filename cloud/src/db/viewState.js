import { getDb } from './index.js';

/**
 * Get the saved view state (zoom, pan) for a user.
 */
export function getViewState(userId) {
  const db = getDb();
  return db.prepare('SELECT * FROM view_state WHERE user_id = ?').get(userId) || null;
}

/**
 * Save/update view state.
 */
export function saveViewState(userId, zoom, panX, panY) {
  const db = getDb();
  db.prepare(`
    INSERT INTO view_state (user_id, zoom, pan_x, pan_y, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET
      zoom = excluded.zoom,
      pan_x = excluded.pan_x,
      pan_y = excluded.pan_y,
      updated_at = datetime('now')
  `).run(userId, zoom ?? 1.0, panX ?? 0, panY ?? 0);
}
