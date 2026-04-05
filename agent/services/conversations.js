import { homedir } from 'os';
import { join, basename } from 'path';
import { readdir, stat, open as fsOpen } from 'fs/promises';
import { randomUUID } from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { config } from '../src/config.js';

const CLAUDE_PROJECTS_DIR = join(homedir(), '.claude', 'projects');
const DATA_DIR = config.dataDir;
const CONVOS_PANES_FILE = join(DATA_DIR, 'conversations-panes.json');

// How much of each JSONL file to read for metadata extraction
const HEAD_SIZE = 65536;  // 64KB for first user message, cwd, branch
const TAIL_SIZE = 65536;  // 64KB for custom title, last activity

/**
 * Convert an absolute directory path to the Claude projects key format.
 * e.g. /Users/Murad/Projects/49Agents -> -Users-Murad-Projects-49Agents
 */
function pathToProjectKey(dirPath) {
  return dirPath.replace(/\//g, '-');
}

/**
 * Scan for conversation JSONL files in ~/.claude/projects/ that match
 * the given directory path. Supports depth parameter for subdir scanning.
 *
 * @param {string} dirPath - The directory to find conversations for
 * @param {number} depth - 0 = exact match only, 1-3 = include subdirs
 * @returns {Array} conversations with metadata
 */
async function scanConversations(dirPath, depth = 0) {
  const conversations = [];

  try {
    const allDirs = await readdir(CLAUDE_PROJECTS_DIR);

    // Build the key for the target directory
    const targetKey = pathToProjectKey(dirPath);

    // Find matching project directories
    const matchingDirs = [];
    for (const dir of allDirs) {
      const dirStat = await stat(join(CLAUDE_PROJECTS_DIR, dir)).catch(() => null);
      if (!dirStat || !dirStat.isDirectory()) continue;

      if (depth === 0) {
        // Exact match only
        if (dir === targetKey) {
          matchingDirs.push(dir);
        }
      } else {
        // Include subdirs: the project key should start with our target key
        if (dir === targetKey || dir.startsWith(targetKey + '-')) {
          // Check depth: count additional path segments beyond target
          const suffix = dir.slice(targetKey.length);
          // Each '-' followed by non-empty segment is a level
          // But we need to be smarter since '-' is used as path separator
          // Just include all matching dirs within depth levels
          // The suffix segments represent sub-paths, approximated by
          // counting how many original '/' separators there would be
          const extraSegments = suffix ? suffix.split('-').filter(Boolean).length : 0;
          // This is an approximation — subdirectory depth check
          // For more accuracy we'd need to reverse the key back to a path
          // but for practical purposes, limiting by the key prefix is sufficient
          if (extraSegments <= depth * 3) { // allow some tolerance for multi-word dir names
            matchingDirs.push(dir);
          }
        }
      }
    }

    // Scan each matching directory for JSONL files
    for (const projectDir of matchingDirs) {
      const projectPath = join(CLAUDE_PROJECTS_DIR, projectDir);
      const entries = await readdir(projectPath).catch(() => []);

      const jsonlFiles = entries.filter(f => f.endsWith('.jsonl'));

      // Process files in parallel (bounded)
      const batch = jsonlFiles.map(async (file) => {
        const sessionId = basename(file, '.jsonl');
        const filePath = join(projectPath, file);

        try {
          const fileStat = await stat(filePath);
          const metadata = await extractMetadata(filePath, fileStat);

          return {
            sessionId,
            projectDir,
            filePath,
            fileSize: fileStat.size,
            createdAt: fileStat.birthtime?.toISOString() || fileStat.ctime.toISOString(),
            lastModified: fileStat.mtime.toISOString(),
            ...metadata,
          };
        } catch {
          return null;
        }
      });

      const results = await Promise.all(batch);
      for (const r of results) {
        if (r) conversations.push(r);
      }
    }
  } catch (err) {
    console.error('[Conversations] Error scanning:', err.message);
  }

  // Sort by last modified, newest first
  conversations.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));

  return conversations;
}

/**
 * Extract metadata from a conversation JSONL file by reading head + tail.
 */
async function extractMetadata(filePath, fileStat) {
  const metadata = {
    customTitle: null,
    firstPrompt: null,
    cwd: null,
    gitBranch: null,
    beadsIssueId: null,
    messageCount: 0,
    userMessageCount: 0,
  };

  const fileSize = fileStat.size;
  if (fileSize === 0) return metadata;

  const fd = await fsOpen(filePath, 'r');
  try {
    // Read head for cwd, branch, first user message
    const headSize = Math.min(fileSize, HEAD_SIZE);
    const headBuf = Buffer.alloc(headSize);
    const { bytesRead: headRead } = await fd.read(headBuf, 0, headSize, 0);
    const head = headBuf.slice(0, headRead).toString('utf8');
    const headLines = head.split('\n');

    let foundFirstPrompt = false;
    for (const line of headLines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        // Quick string checks before parsing JSON (performance)
        if (!metadata.cwd && trimmed.includes('"cwd"')) {
          const obj = JSON.parse(trimmed);
          if (obj.cwd) {
            metadata.cwd = obj.cwd;
          }
        }

        if (!metadata.gitBranch && trimmed.includes('"gitBranch"')) {
          const obj = JSON.parse(trimmed);
          if (obj.gitBranch) {
            metadata.gitBranch = obj.gitBranch;
          }
        }

        if (!foundFirstPrompt && trimmed.includes('"type":"user"')) {
          const obj = JSON.parse(trimmed);
          if (obj.type === 'user' && obj.message && !obj.isMeta) {
            const content = obj.message.content;
            let text = null;
            if (typeof content === 'string') {
              text = content.trim();
            } else if (Array.isArray(content)) {
              for (const block of content) {
                if (block.type === 'text' && block.text) {
                  const t = block.text.trim();
                  if (t && !t.startsWith('<') && !t.startsWith('[')) {
                    text = t;
                    break;
                  }
                }
              }
            }
            if (text) {
              metadata.firstPrompt = text.slice(0, 200);
              foundFirstPrompt = true;
            }
          }
        }
      } catch {
        // Skip unparseable lines
      }

      if (metadata.cwd && metadata.gitBranch && foundFirstPrompt) break;
    }

    // Read tail for custom title and rough message count
    if (fileSize > 0) {
      const tailSize = Math.min(fileSize, TAIL_SIZE);
      const tailPos = Math.max(0, fileSize - TAIL_SIZE);
      const tailBuf = Buffer.alloc(tailSize);
      const { bytesRead: tailRead } = await fd.read(tailBuf, 0, tailSize, tailPos);
      const tail = tailBuf.slice(0, tailRead).toString('utf8');
      const tailLines = tail.split('\n');

      for (let i = tailLines.length - 1; i >= 0; i--) {
        const tl = tailLines[i].trim();
        if (!tl) continue;
        try {
          if (tl.includes('"custom-title"')) {
            const obj = JSON.parse(tl);
            if (obj.type === 'custom-title' && obj.customTitle) {
              metadata.customTitle = obj.customTitle;
              break;
            }
          }
        } catch {}
      }

      // Also check tail for latest gitBranch (may have changed during convo)
      if (metadata.gitBranch) {
        for (let i = tailLines.length - 1; i >= 0; i--) {
          const tl = tailLines[i].trim();
          if (!tl) continue;
          try {
            if (tl.includes('"gitBranch"')) {
              const obj = JSON.parse(tl);
              if (obj.gitBranch && obj.gitBranch !== 'HEAD') {
                metadata.gitBranch = obj.gitBranch;
                break;
              }
            }
          } catch {}
        }
      }
    }

    // Estimate message counts from full file (count newlines as proxy)
    // For large files, count lines in head + tail and extrapolate
    const allLines = head.split('\n');
    let userMsgCount = 0;
    let totalMsgCount = 0;
    for (const line of allLines) {
      if (line.includes('"type"')) totalMsgCount++;
      if (line.includes('"type":"user"')) userMsgCount++;
    }

    if (fileSize > HEAD_SIZE) {
      // Extrapolate based on density in head
      const ratio = fileSize / HEAD_SIZE;
      totalMsgCount = Math.round(totalMsgCount * ratio);
      userMsgCount = Math.round(userMsgCount * ratio);
    }

    metadata.messageCount = totalMsgCount;
    metadata.userMessageCount = userMsgCount;

    // Extract beads issue ID from branch name
    if (metadata.gitBranch) {
      const beadsMatch = metadata.gitBranch.match(/bd[_-][\w]+-[\w.]+/i);
      if (beadsMatch) {
        metadata.beadsIssueId = beadsMatch[0].replace(/-/g, '_').replace(/^bd_/i, 'bd_');
      }
    }

    // Also check cwd for worktree indicators
    if (metadata.cwd) {
      const worktreeMatch = metadata.cwd.match(/\.claude-worktrees\/([^/]+)/);
      if (worktreeMatch) {
        metadata.worktree = worktreeMatch[1];
        // Try to extract beads ID from worktree name too
        if (!metadata.beadsIssueId) {
          const wtBeadsMatch = worktreeMatch[1].match(/bd[_-][\w]+-[\w.]+/i);
          if (wtBeadsMatch) {
            metadata.beadsIssueId = wtBeadsMatch[0].replace(/-/g, '_').replace(/^bd_/i, 'bd_');
          }
        }
      }
    }

  } finally {
    await fd.close();
  }

  return metadata;
}

// --- Pane state persistence (same pattern as beads.js) ---

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadConvosPanes() {
  try {
    ensureDataDir();
    if (!existsSync(CONVOS_PANES_FILE)) return [];
    const data = readFileSync(CONVOS_PANES_FILE, 'utf-8');
    const state = JSON.parse(data);
    return state.conversationsPanes || [];
  } catch (error) {
    console.error('[Conversations] Error loading panes:', error);
    return [];
  }
}

function saveConvosPanes(panes) {
  try {
    ensureDataDir();
    writeFileSync(CONVOS_PANES_FILE, JSON.stringify({ conversationsPanes: panes, version: 1 }, null, 2));
  } catch (error) {
    console.error('[Conversations] Error saving panes:', error);
  }
}

let convosPanesCache = loadConvosPanes();

export const conversationsService = {
  listConversationsPanes() {
    return convosPanesCache;
  },

  getConversationsPane(id) {
    return convosPanesCache.find(p => p.id === id);
  },

  createConversationsPane({ dirPath, position, size, device }) {
    const id = randomUUID();
    const pane = {
      id,
      dirPath: dirPath || homedir(),
      position: position || { x: 100, y: 100 },
      size: size || { width: 520, height: 500 },
      device: device || null,
      createdAt: new Date().toISOString(),
    };
    convosPanesCache.push(pane);
    saveConvosPanes(convosPanesCache);
    return pane;
  },

  updateConversationsPane(id, updates) {
    const index = convosPanesCache.findIndex(p => p.id === id);
    if (index === -1) throw new Error(`Conversations pane not found: ${id}`);
    const pane = convosPanesCache[index];
    if (updates.dirPath) pane.dirPath = updates.dirPath;
    convosPanesCache[index] = pane;
    saveConvosPanes(convosPanesCache);
    return pane;
  },

  deleteConversationsPane(id) {
    const index = convosPanesCache.findIndex(p => p.id === id);
    if (index !== -1) {
      convosPanesCache.splice(index, 1);
      saveConvosPanes(convosPanesCache);
    }
  },

  scanConversations,
};
