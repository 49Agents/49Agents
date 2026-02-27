import { getDb } from './index.js';

/**
 * Get all pane layouts for a user.
 */
export function getLayoutsByUser(userId) {
  const db = getDb();
  return db.prepare(`
    SELECT pl.*, a.hostname AS agent_hostname
    FROM pane_layouts pl
    LEFT JOIN agents a ON pl.agent_id = a.id
    WHERE pl.user_id = ?
    ORDER BY pl.z_index ASC
  `).all(userId);
}

/**
 * Save full canvas state — replaces all layouts for a user.
 * @param {string} userId
 * @param {Array} panes - Array of { id, agentId, paneType, positionX, positionY, width, height, zIndex, metadata }
 */
export function saveFullLayout(userId, panes) {
  const db = getDb();
  const deleteAll = db.prepare('DELETE FROM pane_layouts WHERE user_id = ?');
  const insert = db.prepare(`
    INSERT INTO pane_layouts (id, user_id, agent_id, pane_type, position_x, position_y, width, height, z_index, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const saveAll = db.transaction((userId, panes) => {
    deleteAll.run(userId);
    for (const pane of panes) {
      insert.run(
        pane.id,
        userId,
        pane.agentId || null,
        pane.paneType,
        pane.positionX ?? 0,
        pane.positionY ?? 0,
        pane.width ?? 600,
        pane.height ?? 400,
        pane.zIndex ?? 0,
        pane.metadata ? JSON.stringify(pane.metadata) : null
      );
    }
  });

  saveAll(userId, panes);
}

/**
 * Update a single pane's position/size (used for debounced drag/resize updates).
 */
export function updatePaneLayout(userId, paneId, updates) {
  const db = getDb();
  const fields = [];
  const values = [];

  if (updates.positionX !== undefined) { fields.push('position_x = ?'); values.push(updates.positionX); }
  if (updates.positionY !== undefined) { fields.push('position_y = ?'); values.push(updates.positionY); }
  if (updates.width !== undefined) { fields.push('width = ?'); values.push(updates.width); }
  if (updates.height !== undefined) { fields.push('height = ?'); values.push(updates.height); }
  if (updates.zIndex !== undefined) { fields.push('z_index = ?'); values.push(updates.zIndex); }
  if (updates.metadata !== undefined) { fields.push('metadata = ?'); values.push(JSON.stringify(updates.metadata)); }

  if (fields.length === 0) return;

  fields.push("updated_at = datetime('now')");
  values.push(userId, paneId);

  db.prepare(`UPDATE pane_layouts SET ${fields.join(', ')} WHERE user_id = ? AND id = ?`)
    .run(...values);
}

/**
 * Delete a single pane layout.
 */
export function deletePaneLayout(userId, paneId) {
  const db = getDb();
  db.prepare('DELETE FROM pane_layouts WHERE user_id = ? AND id = ?').run(userId, paneId);
}

/**
 * Upsert a single pane layout (create or update).
 */
export function upsertPaneLayout(userId, pane) {
  const db = getDb();
  db.prepare(`
    INSERT INTO pane_layouts (id, user_id, agent_id, pane_type, position_x, position_y, width, height, z_index, metadata, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      position_x = excluded.position_x,
      position_y = excluded.position_y,
      width = excluded.width,
      height = excluded.height,
      z_index = excluded.z_index,
      metadata = excluded.metadata,
      updated_at = datetime('now')
  `).run(
    pane.id,
    userId,
    pane.agentId || null,
    pane.paneType,
    pane.positionX ?? 0,
    pane.positionY ?? 0,
    pane.width ?? 600,
    pane.height ?? 400,
    pane.zIndex ?? 0,
    pane.metadata ? JSON.stringify(pane.metadata) : null
  );
}
