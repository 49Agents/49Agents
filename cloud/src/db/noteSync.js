import { getDb } from './index.js';

/**
 * Parse images JSON from SQLite row.
 */
function parseNoteRow(row) {
  if (!row) return row;
  try {
    row.images = row.images ? JSON.parse(row.images) : [];
  } catch {
    row.images = [];
  }
  return row;
}

/**
 * Get all cloud-synced notes for a user.
 */
export function getNotesByUser(userId) {
  const db = getDb();
  return db.prepare('SELECT * FROM notes WHERE user_id = ? ORDER BY created_at ASC').all(userId).map(parseNoteRow);
}

/**
 * Get a single note by ID (with ownership check).
 */
export function getNoteById(userId, noteId) {
  const db = getDb();
  return parseNoteRow(db.prepare('SELECT * FROM notes WHERE id = ? AND user_id = ?').get(noteId, userId)) || null;
}

/**
 * Create or update a cloud-synced note.
 */
export function upsertNote(userId, noteId, content, fontSize, images) {
  const db = getDb();
  const imagesJson = images !== undefined ? JSON.stringify(images) : '[]';
  db.prepare(`
    INSERT INTO notes (id, user_id, content, font_size, images, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      content = excluded.content,
      font_size = excluded.font_size,
      images = excluded.images,
      updated_at = datetime('now')
  `).run(noteId, userId, content || '', fontSize ?? 14, imagesJson);
}

/**
 * Delete a cloud-synced note.
 */
export function deleteNote(userId, noteId) {
  const db = getDb();
  db.prepare('DELETE FROM notes WHERE id = ? AND user_id = ?').run(noteId, userId);
}
