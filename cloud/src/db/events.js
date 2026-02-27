import { getDb } from './index.js';

/**
 * Record an event to the events table.
 * @param {string} eventType - e.g. 'user.signup', 'agent.connect'
 * @param {string|null} userId - associated user ID (nullable)
 * @param {object|null} metadata - arbitrary JSON metadata
 */
export function recordEvent(eventType, userId = null, metadata = null) {
  const db = getDb();
  db.prepare(
    'INSERT INTO events (event_type, user_id, metadata) VALUES (?, ?, ?)'
  ).run(eventType, userId, metadata ? JSON.stringify(metadata) : null);
}

/**
 * Get event statistics for the admin dashboard.
 * @param {number} days - lookback period
 */
export function getEventStats(days = 30) {
  const db = getDb();
  const safeDays = parseInt(days) || 30;

  // Signups over time
  const signupsPerDay = db.prepare(`
    SELECT date(created_at) as date, COUNT(*) as count
    FROM events
    WHERE event_type = 'user.signup' AND created_at >= datetime('now', '-' || ? || ' days')
    GROUP BY date(created_at) ORDER BY date ASC
  `).all(safeDays);

  // Total signups in period
  const totalSignups = db.prepare(`
    SELECT COUNT(*) as count FROM events
    WHERE event_type = 'user.signup' AND created_at >= datetime('now', '-' || ? || ' days')
  `).get(safeDays).count;

  // Logins over time
  const loginsPerDay = db.prepare(`
    SELECT date(created_at) as date, COUNT(*) as count
    FROM events
    WHERE event_type = 'user.login' AND created_at >= datetime('now', '-' || ? || ' days')
    GROUP BY date(created_at) ORDER BY date ASC
  `).all(safeDays);

  // DAU (distinct users who logged in per day, last 30 days)
  const dauPerDay = db.prepare(`
    SELECT date(created_at) as date, COUNT(DISTINCT user_id) as count
    FROM events
    WHERE event_type = 'user.login' AND created_at >= datetime('now', '-' || ? || ' days')
    GROUP BY date(created_at) ORDER BY date ASC
  `).all(safeDays);

  // WAU (distinct users in last 7 days)
  const wau = db.prepare(`
    SELECT COUNT(DISTINCT user_id) as count FROM events
    WHERE event_type = 'user.login' AND created_at >= datetime('now', '-7 days')
  `).get().count;

  // MAU (distinct users in last 30 days)
  const mau = db.prepare(`
    SELECT COUNT(DISTINCT user_id) as count FROM events
    WHERE event_type = 'user.login' AND created_at >= datetime('now', '-30 days')
  `).get().count;

  // Agent connections over time
  const agentConnectionsPerDay = db.prepare(`
    SELECT date(created_at) as date, COUNT(*) as count
    FROM events
    WHERE event_type = 'agent.connect' AND created_at >= datetime('now', '-' || ? || ' days')
    GROUP BY date(created_at) ORDER BY date ASC
  `).all(safeDays);

  // Average session duration (browser)
  const avgBrowserSession = db.prepare(`
    SELECT AVG(CAST(json_extract(metadata, '$.duration_ms') AS REAL)) as avg_ms
    FROM events
    WHERE event_type = 'browser.disconnect' AND created_at >= datetime('now', '-' || ? || ' days')
      AND json_extract(metadata, '$.duration_ms') IS NOT NULL
  `).get(safeDays).avg_ms || 0;

  // Average session duration (agent)
  const avgAgentSession = db.prepare(`
    SELECT AVG(CAST(json_extract(metadata, '$.duration_ms') AS REAL)) as avg_ms
    FROM events
    WHERE event_type = 'agent.disconnect' AND created_at >= datetime('now', '-' || ? || ' days')
      AND json_extract(metadata, '$.duration_ms') IS NOT NULL
  `).get(safeDays).avg_ms || 0;

  // Tier limit hits
  const tierLimitHits = db.prepare(`
    SELECT json_extract(metadata, '$.feature') as feature, COUNT(*) as count
    FROM events
    WHERE event_type = 'tier.limit_hit' AND created_at >= datetime('now', '-' || ? || ' days')
    GROUP BY feature ORDER BY count DESC
  `).all(safeDays);

  // Agent OS distribution (from connect events)
  const agentOsDistribution = db.prepare(`
    SELECT json_extract(metadata, '$.os') as os, COUNT(*) as count
    FROM events
    WHERE event_type = 'agent.connect' AND created_at >= datetime('now', '-' || ? || ' days')
      AND json_extract(metadata, '$.os') IS NOT NULL
    GROUP BY os ORDER BY count DESC
  `).all(safeDays);

  // Agent version distribution
  const agentVersionDistribution = db.prepare(`
    SELECT json_extract(metadata, '$.version') as version, COUNT(*) as count
    FROM events
    WHERE event_type = 'agent.connect' AND created_at >= datetime('now', '-' || ? || ' days')
      AND json_extract(metadata, '$.version') IS NOT NULL
    GROUP BY version ORDER BY count DESC
  `).all(safeDays);

  // WS relay message count
  const totalRelayMessages = db.prepare(`
    SELECT COUNT(*) as count FROM events
    WHERE event_type = 'ws.relay' AND created_at >= datetime('now', '-' || ? || ' days')
  `).get(safeDays).count;

  return {
    signupsPerDay,
    totalSignups,
    loginsPerDay,
    dauPerDay,
    wau,
    mau,
    agentConnectionsPerDay,
    avgBrowserSession: Math.round(avgBrowserSession),
    avgAgentSession: Math.round(avgAgentSession),
    tierLimitHits,
    agentOsDistribution,
    agentVersionDistribution,
    totalRelayMessages,
  };
}

/**
 * Get connection snapshot time series for charting.
 * @param {number} days - lookback period
 */
export function getConnectionTimeSeries(days = 7) {
  const db = getDb();
  const safeDays = parseInt(days) || 7;

  const rows = db.prepare(`
    SELECT
      created_at as timestamp,
      json_extract(metadata, '$.totalBrowsers') as browsers,
      json_extract(metadata, '$.totalAgents') as agents,
      json_extract(metadata, '$.uniqueUsers') as users
    FROM events
    WHERE event_type = 'connections.snapshot'
      AND created_at >= datetime('now', '-' || ? || ' days')
    ORDER BY created_at ASC
  `).all(safeDays);

  return rows;
}
