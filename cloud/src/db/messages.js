import { getDb } from './index.js';

export function insertMessage(userId, sender, body) {
  const db = getDb();
  const stmt = db.prepare(
    'INSERT INTO messages (user_id, sender, body) VALUES (?, ?, ?)'
  );
  const result = stmt.run(userId, sender, body);
  return db.prepare('SELECT * FROM messages WHERE id = ?').get(result.lastInsertRowid);
}

export function getMessages(userId, { before, limit = 50 } = {}) {
  const db = getDb();
  if (before) {
    return db.prepare(
      'SELECT * FROM messages WHERE user_id = ? AND id < ? ORDER BY id DESC LIMIT ?'
    ).all(userId, before, limit).reverse();
  }
  return db.prepare(
    'SELECT * FROM messages WHERE user_id = ? ORDER BY id DESC LIMIT ?'
  ).all(userId, limit).reverse();
}

export function getUnreadCount(userId) {
  const db = getDb();
  const row = db.prepare(
    "SELECT COUNT(*) as count FROM messages WHERE user_id = ? AND sender = 'admin' AND read_at IS NULL"
  ).get(userId);
  return row.count;
}

export function markRead(userId) {
  const db = getDb();
  db.prepare(
    "UPDATE messages SET read_at = datetime('now') WHERE user_id = ? AND sender = 'admin' AND read_at IS NULL"
  ).run(userId);
}

export function getConversations() {
  const db = getDb();
  return db.prepare(`
    SELECT
      m.user_id,
      u.display_name,
      u.github_login,
      u.email,
      u.avatar_url,
      (SELECT body FROM messages WHERE user_id = m.user_id ORDER BY id DESC LIMIT 1) as last_message,
      (SELECT sender FROM messages WHERE user_id = m.user_id ORDER BY id DESC LIMIT 1) as last_sender,
      (SELECT created_at FROM messages WHERE user_id = m.user_id ORDER BY id DESC LIMIT 1) as last_message_at,
      COUNT(*) as total_messages,
      SUM(CASE WHEN m.sender = 'user' AND m.read_at IS NULL THEN 1 ELSE 0 END) as unread_from_user
    FROM messages m
    JOIN users u ON u.id = m.user_id
    GROUP BY m.user_id
    ORDER BY last_message_at DESC
  `).all();
}

export function getConversation(userId, { before, limit = 100 } = {}) {
  const db = getDb();
  if (before) {
    return db.prepare(
      'SELECT * FROM messages WHERE user_id = ? AND id < ? ORDER BY id DESC LIMIT ?'
    ).all(userId, before, limit).reverse();
  }
  return db.prepare(
    'SELECT * FROM messages WHERE user_id = ? ORDER BY id DESC LIMIT ?'
  ).all(userId, limit).reverse();
}

export function markReadByAdmin(userId) {
  const db = getDb();
  db.prepare(
    "UPDATE messages SET read_at = datetime('now') WHERE user_id = ? AND sender = 'user' AND read_at IS NULL"
  ).run(userId);
}

export function broadcastMessage(body) {
  const db = getDb();
  const userIds = db.prepare(
    'SELECT DISTINCT user_id FROM messages'
  ).all().map(r => r.user_id);
  const stmt = db.prepare(
    'INSERT INTO messages (user_id, sender, body) VALUES (?, ?, ?)'
  );
  const messages = [];
  const txn = db.transaction(() => {
    for (const uid of userIds) {
      const result = stmt.run(uid, 'admin', body);
      messages.push({ id: result.lastInsertRowid, user_id: uid });
    }
  });
  txn();
  return { count: messages.length, userIds };
}

export function getAllUserIds() {
  const db = getDb();
  return db.prepare('SELECT id FROM users').all().map(r => r.id);
}

export function broadcastToAll(body) {
  const db = getDb();
  const userIds = getAllUserIds();
  const stmt = db.prepare(
    'INSERT INTO messages (user_id, sender, body) VALUES (?, ?, ?)'
  );
  const txn = db.transaction(() => {
    for (const uid of userIds) {
      stmt.run(uid, 'admin', body);
    }
  });
  txn();
  return { count: userIds.length, userIds };
}
