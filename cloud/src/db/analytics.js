import { getDb } from './index.js';
import { config } from '../config.js';

/**
 * Parse a User-Agent string into browser and OS.
 * Simple regex-based — no external dependency.
 */
function parseUserAgent(ua) {
  if (!ua) return { browser: 'Unknown', os: 'Unknown' };

  let browser = 'Other';
  if (/Edg\//i.test(ua)) browser = 'Edge';
  else if (/OPR\//i.test(ua) || /Opera/i.test(ua)) browser = 'Opera';
  else if (/SamsungBrowser/i.test(ua)) browser = 'Samsung Internet';
  else if (/Chrome\//i.test(ua) && !/Chromium/i.test(ua)) browser = 'Chrome';
  else if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) browser = 'Safari';
  else if (/Firefox\//i.test(ua)) browser = 'Firefox';

  let os = 'Other';
  if (/Windows/i.test(ua)) os = 'Windows';
  else if (/Macintosh|Mac OS/i.test(ua)) os = 'macOS';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';
  else if (/Linux/i.test(ua)) os = 'Linux';

  return { browser, os };
}

/**
 * Record a page view.
 */
export function recordPageView({ path, referrer, userAgent, screenWidth, screenHeight, ip, hostname, sessionId, userId, utmSource, utmMedium, utmCampaign }) {
  const db = getDb();
  const { browser, os } = parseUserAgent(userAgent);

  db.prepare(`
    INSERT INTO page_views (path, referrer, user_agent, browser, os, screen_width, screen_height, ip, hostname, session_id, user_id, utm_source, utm_medium, utm_campaign)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    path || '/',
    referrer || null,
    userAgent || null,
    browser,
    os,
    screenWidth || null,
    screenHeight || null,
    ip || null,
    hostname || null,
    sessionId || null,
    userId || null,
    utmSource || null,
    utmMedium || null,
    utmCampaign || null
  );
}

/**
 * Query analytics data for the admin dashboard.
 * @param {number} days - Number of days to look back (default 30)
 * @param {string|null} hostnameFilter - Optional hostname filter
 */
export function getAnalyticsData(days = 30, hostnameFilter = null) {
  const db = getDb();
  const safeDays = parseInt(days) || 30;

  const whereClause = hostnameFilter
    ? `WHERE created_at >= datetime('now', '-' || ? || ' days') AND hostname = ?`
    : `WHERE created_at >= datetime('now', '-' || ? || ' days')`;
  const params = hostnameFilter ? [safeDays, hostnameFilter] : [safeDays];

  const viewsPerDay = db.prepare(`
    SELECT date(created_at) as date, COUNT(*) as count
    FROM page_views ${whereClause}
    GROUP BY date(created_at)
    ORDER BY date ASC
  `).all(...params);

  const uniqueVisitorsPerDay = db.prepare(`
    SELECT date(created_at) as date, COUNT(DISTINCT session_id) as count
    FROM page_views ${whereClause}
    GROUP BY date(created_at)
    ORDER BY date ASC
  `).all(...params);

  const topPages = db.prepare(`
    SELECT path, COUNT(*) as count
    FROM page_views ${whereClause}
    GROUP BY path
    ORDER BY count DESC
    LIMIT 10
  `).all(...params);

  // For referrers, we need an extra AND condition
  const refWhereClause = hostnameFilter
    ? `WHERE created_at >= datetime('now', '-' || ? || ' days') AND hostname = ? AND referrer IS NOT NULL AND referrer != ''`
    : `WHERE created_at >= datetime('now', '-' || ? || ' days') AND referrer IS NOT NULL AND referrer != ''`;

  const topReferrers = db.prepare(`
    SELECT referrer, COUNT(*) as count
    FROM page_views ${refWhereClause}
    GROUP BY referrer
    ORDER BY count DESC
    LIMIT 10
  `).all(...params);

  const browsers = db.prepare(`
    SELECT browser, COUNT(*) as count
    FROM page_views ${whereClause}
    GROUP BY browser
    ORDER BY count DESC
  `).all(...params);

  const operatingSystems = db.prepare(`
    SELECT os, COUNT(*) as count
    FROM page_views ${whereClause}
    GROUP BY os
    ORDER BY count DESC
  `).all(...params);

  const totalViews = db.prepare(`
    SELECT COUNT(*) as count FROM page_views ${whereClause}
  `).get(...params);

  const totalUnique = db.prepare(`
    SELECT COUNT(DISTINCT session_id) as count FROM page_views ${whereClause}
  `).get(...params);

  // UTM source breakdown: landing views, app click-throughs, conversion %
  const utmWhereClause = hostnameFilter
    ? `WHERE created_at >= datetime('now', '-' || ? || ' days') AND hostname = ? AND utm_source IS NOT NULL`
    : `WHERE created_at >= datetime('now', '-' || ? || ' days') AND utm_source IS NOT NULL`;

  const utmSources = db.prepare(`
    SELECT utm_source, COUNT(*) as count
    FROM page_views ${utmWhereClause}
    GROUP BY utm_source
    ORDER BY count DESC
    LIMIT 20
  `).all(...params);

  // For conversion: count sessions that hit both landing and app with same utm_source
  const utmConversions = db.prepare(`
    SELECT
      landing.utm_source,
      COUNT(DISTINCT landing.session_id) as landing_sessions,
      COUNT(DISTINCT app.session_id) as app_sessions
    FROM page_views landing
    LEFT JOIN page_views app
      ON landing.session_id = app.session_id
      AND app.hostname = ?
      AND app.utm_source = landing.utm_source
    WHERE landing.created_at >= datetime('now', '-' || ? || ' days')
      AND landing.hostname = ?
      AND landing.utm_source IS NOT NULL
    GROUP BY landing.utm_source
    ORDER BY landing_sessions DESC
    LIMIT 20
  `).all(config.appHost || config.cloudHost, safeDays, config.cloudHost);

  return {
    viewsPerDay,
    uniqueVisitorsPerDay,
    topPages,
    topReferrers,
    browsers,
    operatingSystems,
    totalViews: totalViews.count,
    totalUnique: totalUnique.count,
    utmSources,
    utmConversions,
  };
}
