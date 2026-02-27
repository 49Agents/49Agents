import { randomUUID } from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { config } from '../src/config.js';

const DATA_DIR = config.dataDir;
const IFRAMES_FILE = join(DATA_DIR, 'iframes.json');

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadIframes() {
  try {
    ensureDataDir();
    if (!existsSync(IFRAMES_FILE)) {
      return [];
    }
    const data = readFileSync(IFRAMES_FILE, 'utf-8');
    const state = JSON.parse(data);
    return state.iframes || [];
  } catch (error) {
    console.error('[Iframes] Error loading iframes:', error);
    return [];
  }
}

function saveIframes(iframes) {
  try {
    ensureDataDir();
    const state = {
      iframes,
      version: 1,
    };
    writeFileSync(IFRAMES_FILE, JSON.stringify(state, null, 2));
  } catch (error) {
    console.error('[Iframes] Error saving iframes:', error);
  }
}

let iframesCache = loadIframes();

export const iframeService = {
  listIframes() {
    return iframesCache;
  },

  getIframe(id) {
    return iframesCache.find(f => f.id === id);
  },

  createIframe({ url, position, size }) {
    const id = randomUUID();
    const iframe = {
      id,
      url: url || '',
      position: position || { x: 100, y: 100 },
      size: size || { width: 800, height: 600 },
      createdAt: new Date().toISOString()
    };

    iframesCache.push(iframe);
    saveIframes(iframesCache);

    return iframe;
  },

  updateIframe(id, updates) {
    const index = iframesCache.findIndex(f => f.id === id);
    if (index === -1) {
      throw new Error(`Iframe not found: ${id}`);
    }

    const iframe = iframesCache[index];

    // Position/size now handled by cloud-only storage
    if (updates.url !== undefined) {
      iframe.url = updates.url;
    }

    iframesCache[index] = iframe;
    saveIframes(iframesCache);

    return iframe;
  },

  deleteIframe(id) {
    const index = iframesCache.findIndex(f => f.id === id);
    if (index !== -1) {
      iframesCache.splice(index, 1);
      saveIframes(iframesCache);
    }
  }
};
