import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { config } from '../src/config.js';

const DATA_DIR = config.dataDir;
const STATE_FILE = join(DATA_DIR, 'terminals.json');

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

/**
 * Load terminal state from disk
 */
export function loadTerminalState() {
  try {
    ensureDataDir();
    if (!existsSync(STATE_FILE)) {
      return [];
    }
    const data = readFileSync(STATE_FILE, 'utf-8');
    const state = JSON.parse(data);
    return state.terminals;
  } catch (error) {
    console.error('[Storage] Error loading terminal state:', error);
    return [];
  }
}

/**
 * Save terminal state to disk
 */
export function saveTerminalState(terminals) {
  try {
    ensureDataDir();
    const state = {
      terminals,
      version: 1,
    };
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (error) {
    console.error('[Storage] Error saving terminal state:', error);
  }
}

/**
 * Remove a terminal from storage
 */
export function removeTerminalFromStorage(terminalId) {
  const terminals = loadTerminalState();
  const filtered = terminals.filter(t => t.id !== terminalId);
  saveTerminalState(filtered);
}

/**
 * Find stored terminal by tmux session name
 */
export function findStoredTerminalBySession(tmuxSession) {
  const terminals = loadTerminalState();
  return terminals.find(t => t.tmuxSession === tmuxSession);
}
