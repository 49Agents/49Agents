import { recordPageView } from '../db/analytics.js';
import { isLocalMode, getLocalAuth } from '../auth/localAuth.js';
import { queueTelemetryEvent } from '../telemetry/localCollector.js';

// Simple in-memory rate limit: track last request time per IP
const lastRequestByIp = new Map();
const RATE_LIMIT_MS = 1000;
const clientEventRateByIp = new Map();

// Clean up stale entries every 5 minutes
setInterval(() => {
  const cutoff = Date.now() - 60000;
  for (const [ip, time] of lastRequestByIp) {
    if (time < cutoff) lastRequestByIp.delete(ip);
  }
}, 300000);

/**
 * Set up public analytics routes (tracking only).
 * Admin routes are served on the separate Tailscale-bound admin server.
 */
export function setupAnalyticsRoutes(app) {

  // POST /api/analytics/track — public, no auth required
  app.post('/api/analytics/track', (req, res) => {
    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';

    // Rate limit: 1 request per second per IP
    const now = Date.now();
    const lastTime = lastRequestByIp.get(ip);
    if (lastTime && (now - lastTime) < RATE_LIMIT_MS) {
      return res.status(429).json({ error: 'Too many requests' });
    }
    if (lastRequestByIp.size > 50000) lastRequestByIp.clear();
    lastRequestByIp.set(ip, now);

    const { path, referrer, screenWidth, screenHeight, sessionId, hostname, utmSource, utmMedium, utmCampaign } = req.body;

    // Basic validation
    if (!path || typeof path !== 'string') {
      return res.status(400).json({ error: 'path is required' });
    }

    recordPageView({
      path: path.slice(0, 500),
      referrer: referrer ? String(referrer).slice(0, 2000) : null,
      userAgent: req.headers['user-agent'] || null,
      screenWidth: Number(screenWidth) || null,
      screenHeight: Number(screenHeight) || null,
      ip,
      hostname: hostname ? String(hostname).slice(0, 200) : null,
      sessionId: sessionId ? String(sessionId).slice(0, 100) : null,
      userId: null,
      utmSource: utmSource ? String(utmSource).slice(0, 100) : null,
      utmMedium: utmMedium ? String(utmMedium).slice(0, 100) : null,
      utmCampaign: utmCampaign ? String(utmCampaign).slice(0, 200) : null,
    });

    res.json({ ok: true });
  });

  // POST /api/telemetry/client-events — receive client-side telemetry from local mode
  app.post('/api/telemetry/client-events', (req, res) => {
    if (!isLocalMode()) return res.status(404).json({ error: 'Not available' });

    const localAuth = getLocalAuth();
    if (!localAuth || localAuth.telemetryConsent !== 1) {
      return res.json({ ok: false });
    }

    const ip = req.ip || 'unknown';
    const now = Date.now();
    const lastTime = clientEventRateByIp.get(ip);
    if (lastTime && (now - lastTime) < RATE_LIMIT_MS) {
      return res.status(429).json({ error: 'Too many requests' });
    }
    if (clientEventRateByIp.size > 50000) clientEventRateByIp.clear();
    clientEventRateByIp.set(ip, now);

    const { events } = req.body;
    if (!Array.isArray(events)) {
      return res.status(400).json({ error: 'events array is required' });
    }

    for (const evt of events.slice(0, 50)) {
      if (!evt.event_type || typeof evt.event_type !== 'string') continue;
      queueTelemetryEvent(evt.event_type, localAuth.cloudUserId, evt.data || null);
    }

    res.json({ ok: true });
  });
}
