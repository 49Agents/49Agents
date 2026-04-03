import { getDb } from './index.js';

const MAX_RECENTS = 3;

/**
 * Upsert a recent pane context. If the same (user, agent, paneType, context)
 * exists, bumps used_at. Trims to MAX_RECENTS per (user, agent, paneType).
 */
export function upsertRecentContext(userId, agentId, paneType, context, label) {
  const db = getDb();

  db.prepare(`
    INSERT INTO recent_pane_contexts (user_id, agent_id, pane_type, context, label, used_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(user_id, agent_id, pane_type, context) DO UPDATE SET
      label = excluded.label,
      used_at = datetime('now')
  `).run(userId, agentId, paneType, context, label || null);

  // Trim to MAX_RECENTS — delete oldest beyond the limit
  const excess = db.prepare(`
    SELECT id FROM recent_pane_contexts
    WHERE user_id = ? AND agent_id = ? AND pane_type = ?
    ORDER BY used_at DESC
    LIMIT -1 OFFSET ?
  `).all(userId, agentId, paneType, MAX_RECENTS);

  if (excess.length > 0) {
    const ids = excess.map(r => r.id);
    db.prepare(`DELETE FROM recent_pane_contexts WHERE id IN (${ids.map(() => '?').join(',')})`).run(...ids);
  }
}

/**
 * Get recent contexts for a user + agent + pane type.
 * Returns up to MAX_RECENTS, most recent first.
 */
export function getRecentContexts(userId, agentId, paneType) {
  const db = getDb();
  return db.prepare(`
    SELECT context, label, used_at FROM recent_pane_contexts
    WHERE user_id = ? AND agent_id = ? AND pane_type = ?
    ORDER BY used_at DESC
    LIMIT ?
  `).all(userId, agentId, paneType, MAX_RECENTS);
}

/**
 * Get recent contexts across multiple pane types, deduplicated by context path.
 * Returns up to MAX_RECENTS, most recent first. When the same path appears
 * under multiple pane types, keeps the one with the latest used_at.
 */
export function getRecentContextsMultiType(userId, agentId, paneTypes) {
  const db = getDb();
  const placeholders = paneTypes.map(() => '?').join(',');
  return db.prepare(`
    SELECT context, label, MAX(used_at) AS used_at
    FROM recent_pane_contexts
    WHERE user_id = ? AND agent_id = ? AND pane_type IN (${placeholders})
    GROUP BY context
    ORDER BY used_at DESC
    LIMIT ?
  `).all(userId, agentId, ...paneTypes, MAX_RECENTS);
}
