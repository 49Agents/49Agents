import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { config } from './config.js';

const TOKEN_FILE = join(config.configDir, 'agent.json');

/**
 * Returns the config directory path (~/.49agents/)
 */
export function getConfigDir() {
  return config.configDir;
}

/**
 * Ensure the config directory exists
 */
function ensureConfigDir() {
  if (!existsSync(config.configDir)) {
    mkdirSync(config.configDir, { recursive: true });
  }
}

/**
 * Load the authentication token from disk
 * @returns {string|null} The stored token, or null if not found
 */
export function loadToken() {
  try {
    if (!existsSync(TOKEN_FILE)) {
      return null;
    }
    const data = JSON.parse(readFileSync(TOKEN_FILE, 'utf-8'));
    return data.token || null;
  } catch {
    return null;
  }
}

/**
 * Save the authentication token to disk
 * @param {string} token - The token to store
 */
export function saveToken(token) {
  ensureConfigDir();
  const data = { token, savedAt: new Date().toISOString() };
  writeFileSync(TOKEN_FILE, JSON.stringify(data, null, 2), { mode: 0o600 });
}

/**
 * Clear the stored authentication token
 */
export function clearToken() {
  try {
    if (existsSync(TOKEN_FILE)) {
      unlinkSync(TOKEN_FILE);
    }
  } catch {
    // Ignore errors during cleanup
  }
}
