import { requireAuth } from '../auth/middleware.js';
import { getPreferences, savePreferences } from '../db/preferences.js';

/**
 * Set up user preferences routes.
 */
export function setupPreferencesRoutes(app) {

  // GET /api/preferences — load user's preferences
  app.get('/api/preferences', requireAuth, (req, res) => {
    const prefs = getPreferences(req.user.id);
    res.json({
      nightMode: !!prefs.night_mode,
      terminalTheme: prefs.terminal_theme,
      notificationSound: !!prefs.notification_sound,
      autoRemoveDone: !!prefs.auto_remove_done,
      canvasBg: prefs.canvas_bg || 'default',
      snoozeDuration: prefs.snooze_duration ?? 90,
      terminalFont: prefs.terminal_font || 'JetBrains Mono',
      hudState: prefs.hud_state ? JSON.parse(prefs.hud_state) : {},
      tutorialsCompleted: prefs.tutorials_completed ? JSON.parse(prefs.tutorials_completed) : {},
    });
  });

  // PUT /api/preferences — save user's preferences
  app.put('/api/preferences', requireAuth, (req, res) => {
    const { nightMode, terminalTheme, notificationSound, autoRemoveDone, canvasBg, snoozeDuration, terminalFont, hudState, tutorialsCompleted } = req.body;
    savePreferences(req.user.id, { nightMode, terminalTheme, notificationSound, autoRemoveDone, canvasBg, snoozeDuration, terminalFont, hudState, tutorialsCompleted });
    res.json({ ok: true });
  });
}
