/**
 * Tier Enforcement Module
 *
 * Checks tier limits before the relay forwards browser→agent messages.
 * All limits are enforced server-side at the relay layer.
 * The agent has zero awareness of tiers.
 */

import { getDb } from '../db/index.js';
import { getUserById } from '../db/users.js';
import { getTierLimits } from './tiers.js';
import { recordEvent } from '../db/events.js';

// Map pane type names to API creation paths
const CREATE_PATH_MAP = {
  '/api/terminals': 'terminalPanes',
  '/api/file-panes': 'filePanes',
  '/api/notes': 'notes',
  '/api/git-graphs': 'gitGraphs',
  '/api/iframes': 'filePanes',
};

// Map pane type names to DB pane_type values
const DB_TYPE_MAP = {
  terminalPanes: 'terminal',
  filePanes: 'file',
  notes: 'note',
  gitGraphs: 'git-graph',
};

/**
 * Count active panes of a specific type for a user.
 * Uses the cloud pane_layouts table (synced from frontend).
 */
function countPanes(userId, paneType) {
  const db = getDb();
  return db.prepare(
    'SELECT COUNT(*) as count FROM pane_layouts WHERE user_id = ? AND pane_type = ?'
  ).get(userId, paneType)?.count || 0;
}

/**
 * Count connected agents for a user.
 * @param {string} userId
 * @param {Map} userAgents - The relay's userAgents map
 */
function countAgents(userId, userAgents) {
  return userAgents.get(userId)?.size || 0;
}

/**
 * Check if a message should be blocked due to tier limits.
 *
 * @param {string} userId - The authenticated user ID
 * @param {object} message - The parsed WebSocket message from browser
 * @param {Map} userAgents - The relay's userAgents map (for agent count)
 * @returns {object|null} - null if allowed, or { feature, message, upgradeUrl } if blocked
 */
export function check(userId, message, userAgents) {
  const user = getUserById(userId);
  if (!user) return null;

  const tier = user.tier || 'free';
  const limits = getTierLimits(tier);

  // Only check POST requests (pane creation)
  if (message.type !== 'request' || message.payload?.method !== 'POST') {
    return null;
  }

  const path = message.payload.path;
  if (!path) return null;

  // Strip query string for matching
  const cleanPath = path.split('?')[0];
  const limitKey = CREATE_PATH_MAP[cleanPath];
  if (!limitKey) return null;

  const limit = limits[limitKey];
  if (limit === Infinity) return null;

  const dbType = DB_TYPE_MAP[limitKey];
  if (!dbType) return null;

  const count = countPanes(userId, dbType);

  if (count >= limit) {
    const featureNames = {
      terminalPanes: 'terminal panes',
      filePanes: 'file panes',
      notes: 'notes',
      gitGraphs: 'git graph panes',
    };
    recordEvent('tier.limit_hit', userId, { feature: limitKey, tier, limit });
    return {
      feature: limitKey,
      message: `Your plan allows ${limit} ${featureNames[limitKey] || limitKey}. Upgrade to Pro for more.`,
      upgradeUrl: '/api/billing/checkout',
    };
  }

  return null;
}

/**
 * Check if a new agent connection should be allowed.
 *
 * @param {string} userId
 * @param {Map} userAgents
 * @returns {object|null}
 */
export function checkAgentLimit(userId, userAgents) {
  const user = getUserById(userId);
  if (!user) return null;

  const tier = user.tier || 'free';
  const limits = getTierLimits(tier);

  const count = countAgents(userId, userAgents);

  if (count >= limits.agents) {
    recordEvent('tier.limit_hit', userId, { feature: 'agents', tier, limit: limits.agents });
    return {
      feature: 'agents',
      message: `Your plan allows ${limits.agents} device${limits.agents > 1 ? 's' : ''}. Upgrade to Pro for more.`,
      upgradeUrl: '/api/billing/checkout',
    };
  }

  return null;
}

/**
 * Count total images across all notes for a user.
 */
export function countUserImages(userId) {
  const db = getDb();
  const rows = db.prepare('SELECT images FROM notes WHERE user_id = ?').all(userId);
  let total = 0;
  for (const row of rows) {
    try {
      const imgs = row.images ? JSON.parse(row.images) : [];
      total += imgs.length;
    } catch {
      // skip malformed
    }
  }
  return total;
}

/**
 * Check if adding images would exceed the user's tier limit.
 * @returns {object|null} - null if allowed, or { message, upgradeUrl } if blocked
 */
export function checkImageLimit(userId, newImageCount) {
  const user = getUserById(userId);
  if (!user) return null;

  const tier = user.tier || 'free';
  const limits = getTierLimits(tier);
  if (!limits.noteImages || limits.noteImages === Infinity) return null;

  const current = countUserImages(userId);
  if (current + newImageCount > limits.noteImages) {
    return {
      feature: 'noteImages',
      message: `Your plan allows ${limits.noteImages} images across all notes. You have ${current}. Upgrade for more.`,
      upgradeUrl: '/api/billing/checkout',
    };
  }
  return null;
}

/**
 * Get tier info for a user (sent to browser on connect).
 */
export function getTierInfo(userId) {
  const user = getUserById(userId);
  if (!user) return { tier: 'free', limits: getTierLimits('free') };

  const tier = user.tier || 'free';
  return {
    tier,
    limits: getTierLimits(tier),
  };
}
