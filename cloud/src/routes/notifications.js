import { requireAuth } from '../auth/middleware.js';
import { getUndismissedNotifications, dismissNotification } from '../db/notifications.js';

/**
 * Set up user-facing notification API routes.
 */
export function setupNotificationRoutes(app) {

  // User: get undismissed notifications
  app.get('/api/notifications', requireAuth, (req, res) => {
    const notifications = getUndismissedNotifications(req.user.id);
    res.json(notifications);
  });

  // User: dismiss a notification
  app.post('/api/notifications/:id/dismiss', requireAuth, (req, res) => {
    const notificationId = parseInt(req.params.id, 10);
    if (isNaN(notificationId)) {
      return res.status(400).json({ error: 'Invalid notification ID' });
    }
    dismissNotification(notificationId, req.user.id);
    res.json({ ok: true });
  });
}
