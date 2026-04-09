import { getDb } from './index.js';

/**
 * Create a notification. user_id=null means broadcast to all users.
 * Returns the created notification row.
 */
export function createNotification(userId, message, type = 'info') {
  const db = getDb();
  const result = db.prepare(
    'INSERT INTO notifications (user_id, message, type) VALUES (?, ?, ?)'
  ).run(userId, message, type);
  return db.prepare('SELECT * FROM notifications WHERE id = ?').get(result.lastInsertRowid);
}

/**
 * Get undismissed notifications for a user.
 * Includes both targeted (user_id = userId) and broadcasts (user_id IS NULL).
 */
export function getUndismissedNotifications(userId) {
  const db = getDb();
  return db.prepare(`
    SELECT n.* FROM notifications n
    WHERE (n.user_id = ? OR n.user_id IS NULL)
      AND n.id NOT IN (
        SELECT notification_id FROM notification_dismissals WHERE user_id = ?
      )
    ORDER BY n.created_at DESC
  `).all(userId, userId);
}

/**
 * Dismiss a notification for a specific user.
 */
export function dismissNotification(notificationId, userId) {
  const db = getDb();
  return db.prepare(
    'INSERT OR IGNORE INTO notification_dismissals (notification_id, user_id) VALUES (?, ?)'
  ).run(notificationId, userId);
}
