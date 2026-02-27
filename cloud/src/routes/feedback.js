import { requireAuth } from '../auth/middleware.js';
import { config } from '../config.js';
import { insertMessage, getMessages, getUnreadCount, markRead } from '../db/messages.js';

const RATE_LIMIT_MS = 10000;
const feedbackTimestamps = new Map();

// Clean up stale rate-limit entries every 10 minutes
setInterval(() => {
  const cutoff = Date.now() - RATE_LIMIT_MS * 2;
  for (const [uid, ts] of feedbackTimestamps) {
    if (ts < cutoff) feedbackTimestamps.delete(uid);
  }
}, 10 * 60 * 1000);

// Store reference to userBrowsers for WebSocket push (set by index.js after WS setup)
let _userBrowsers = null;
export function setChatBrowsers(userBrowsers) {
  _userBrowsers = userBrowsers;
}

export function setupFeedbackRoutes(app) {

  // GET /api/messages — fetch chat history
  app.get('/api/messages', requireAuth, (req, res) => {
    try {
      const userId = req.user.id;
      const beforeRaw = req.query.before ? parseInt(req.query.before) : undefined;
      const before = beforeRaw !== undefined && isNaN(beforeRaw) ? undefined : beforeRaw;
      const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 100);
      const messages = getMessages(userId, { before, limit });
      const unread = getUnreadCount(userId);
      res.json({ messages, unread });
    } catch (err) {
      console.error('[chat] Error fetching messages:', err);
      res.status(500).json({ error: 'Failed to fetch messages' });
    }
  });

  // POST /api/messages — send a message (user -> admin)
  app.post('/api/messages', requireAuth, async (req, res) => {
    try {
      const { message } = req.body || {};
      if (!message || !message.trim()) {
        return res.status(400).json({ error: 'message is required' });
      }
      if (message.length > 3000) {
        return res.status(400).json({ error: 'message too long (max 3000)' });
      }

      const userId = req.user.id;
      const now = Date.now();
      const lastSent = feedbackTimestamps.get(userId) || 0;
      if (now - lastSent < RATE_LIMIT_MS) {
        const waitSec = Math.ceil((RATE_LIMIT_MS - (now - lastSent)) / 1000);
        return res.status(429).json({ error: `Rate limited. Wait ${waitSec}s.` });
      }
      feedbackTimestamps.set(userId, now);

      const msg = insertMessage(userId, 'user', message.trim());

      // Discord webhook (fire-and-forget)
      const webhookUrl = config.feedbackWebhookUrl;
      if (webhookUrl) {
        const user = req.user;
        const embed = {
          title: 'New Chat Message',
          description: message.trim(),
          color: 0x6366f1,
          fields: [
            { name: 'User', value: user.display_name || user.github_login || user.email || 'unknown', inline: true },
            { name: 'User ID', value: userId, inline: true },
          ],
          timestamp: new Date().toISOString(),
        };
        fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ embeds: [embed] }),
        }).catch(err => console.error('[chat] Discord webhook failed:', err.message));
      }

      res.json({ ok: true, message: msg });
    } catch (err) {
      console.error('[chat] Error sending message:', err);
      res.status(500).json({ error: 'Failed to send message' });
    }
  });

  // GET /api/messages/unread-count
  app.get('/api/messages/unread-count', requireAuth, (req, res) => {
    try {
      const count = getUnreadCount(req.user.id);
      res.json({ count });
    } catch (err) {
      res.status(500).json({ error: 'Failed to get unread count' });
    }
  });

  // POST /api/messages/mark-read — mark admin messages as read
  app.post('/api/messages/mark-read', requireAuth, (req, res) => {
    try {
      markRead(req.user.id);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to mark read' });
    }
  });
}

// Utility: push a chat message to a user's browser connections
export function pushChatMessage(userId, message) {
  if (!_userBrowsers) return;
  const browsers = _userBrowsers.get(userId);
  if (!browsers) return;
  const payload = JSON.stringify({ type: 'chat:message', payload: message });
  for (const ws of browsers) {
    if (ws.readyState === 1) ws.send(payload);
  }
}
