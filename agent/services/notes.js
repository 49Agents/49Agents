import { randomUUID } from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { config } from '../src/config.js';

const DATA_DIR = config.dataDir;
const NOTES_FILE = join(DATA_DIR, 'notes.json');

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

/**
 * Load notes from disk
 */
function loadNotes() {
  try {
    ensureDataDir();
    if (!existsSync(NOTES_FILE)) {
      return [];
    }
    const data = readFileSync(NOTES_FILE, 'utf-8');
    const state = JSON.parse(data);
    return state.notes || [];
  } catch (error) {
    console.error('[Notes] Error loading notes:', error);
    return [];
  }
}

/**
 * Save notes to disk
 */
function saveNotes(notes) {
  try {
    ensureDataDir();
    const state = {
      notes,
      version: 1,
    };
    writeFileSync(NOTES_FILE, JSON.stringify(state, null, 2));
  } catch (error) {
    console.error('[Notes] Error saving notes:', error);
  }
}

// In-memory cache
let notesCache = loadNotes();

export const noteService = {
  /**
   * List all notes
   */
  listNotes() {
    return notesCache;
  },

  /**
   * Get a note by ID
   */
  getNote(id) {
    return notesCache.find(n => n.id === id);
  },

  /**
   * Create a new note
   */
  createNote({ position, size }) {
    const id = randomUUID();
    const note = {
      id,
      content: '',
      fontSize: 16,
      position: position || { x: 100, y: 100 },
      size: size || { width: 200, height: 100 },
      createdAt: new Date().toISOString()
    };

    notesCache.push(note);
    saveNotes(notesCache);

    return note;
  },

  /**
   * Update a note
   */
  updateNote(id, updates) {
    const index = notesCache.findIndex(n => n.id === id);
    if (index === -1) {
      throw new Error(`Note not found: ${id}`);
    }

    const note = notesCache[index];

    // Position/size now handled by cloud-only storage
    if (updates.content !== undefined) {
      note.content = updates.content;
    }
    if (updates.fontSize !== undefined) {
      note.fontSize = updates.fontSize;
    }
    if (updates.images !== undefined) {
      note.images = updates.images;
    }

    notesCache[index] = note;
    saveNotes(notesCache);

    return note;
  },

  /**
   * Delete a note
   */
  deleteNote(id) {
    const index = notesCache.findIndex(n => n.id === id);
    if (index !== -1) {
      notesCache.splice(index, 1);
      saveNotes(notesCache);
    }
  }
};
