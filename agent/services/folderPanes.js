import { randomUUID } from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { config } from '../src/config.js';

const DATA_DIR = config.dataDir;
const FOLDER_PANES_FILE = join(DATA_DIR, 'folder-panes.json');

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadFolderPanes() {
  try {
    ensureDataDir();
    if (!existsSync(FOLDER_PANES_FILE)) {
      return [];
    }
    const data = readFileSync(FOLDER_PANES_FILE, 'utf-8');
    const state = JSON.parse(data);
    return state.folderPanes || [];
  } catch (error) {
    console.error('[FolderPanes] Error loading folder panes:', error);
    return [];
  }
}

function saveFolderPanes(folderPanes) {
  try {
    ensureDataDir();
    const state = {
      folderPanes,
      version: 1,
    };
    writeFileSync(FOLDER_PANES_FILE, JSON.stringify(state, null, 2));
  } catch (error) {
    console.error('[FolderPanes] Error saving folder panes:', error);
  }
}

let folderPanesCache = loadFolderPanes();

export const folderPaneService = {
  listFolderPanes() {
    return folderPanesCache;
  },

  getFolderPane(id) {
    return folderPanesCache.find(f => f.id === id);
  },

  createFolderPane({ folderPath, position, size }) {
    const id = randomUUID();
    const folderPane = {
      id,
      folderPath: folderPath || '~',
      position: position || { x: 100, y: 100 },
      size: size || { width: 400, height: 500 },
      createdAt: new Date().toISOString()
    };

    folderPanesCache.push(folderPane);
    saveFolderPanes(folderPanesCache);

    return folderPane;
  },

  updateFolderPane(id, updates) {
    const index = folderPanesCache.findIndex(f => f.id === id);
    if (index === -1) {
      throw new Error(`Folder pane not found: ${id}`);
    }

    const folderPane = folderPanesCache[index];

    if (updates.folderPath !== undefined) {
      folderPane.folderPath = updates.folderPath;
    }

    folderPanesCache[index] = folderPane;
    saveFolderPanes(folderPanesCache);

    return folderPane;
  },

  deleteFolderPane(id) {
    const index = folderPanesCache.findIndex(f => f.id === id);
    if (index !== -1) {
      folderPanesCache.splice(index, 1);
      saveFolderPanes(folderPanesCache);
    }
  }
};
