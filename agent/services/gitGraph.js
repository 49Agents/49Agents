import { randomUUID } from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, realpathSync } from 'fs';
import { join, relative } from 'path';
import { homedir } from 'os';
import { exec, execSync } from 'child_process';
import { promisify } from 'util';
import { config } from '../src/config.js';

const execAsync = promisify(exec);

const DATA_DIR = config.dataDir;
const GIT_GRAPHS_FILE = join(DATA_DIR, 'git-graphs.json');

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadGitGraphs() {
  try {
    ensureDataDir();
    if (!existsSync(GIT_GRAPHS_FILE)) {
      return [];
    }
    const data = readFileSync(GIT_GRAPHS_FILE, 'utf-8');
    const state = JSON.parse(data);
    return state.gitGraphs || [];
  } catch (error) {
    console.error('[GitGraph] Error loading git graphs:', error);
    return [];
  }
}

function saveGitGraphs(gitGraphs) {
  try {
    ensureDataDir();
    const state = { gitGraphs, version: 1 };
    writeFileSync(GIT_GRAPHS_FILE, JSON.stringify(state, null, 2));
  } catch (error) {
    console.error('[GitGraph] Error saving git graphs:', error);
  }
}

let gitGraphsCache = loadGitGraphs();

/**
 * Convert ANSI escape codes to HTML spans
 */
function ansiToHtml(text) {
  const colorMap = {
    '0': '</span>',
    '1': '<span class="ansi-bold">',
    '2': '<span class="ansi-dim">',
    '30': '<span class="ansi-black">',
    '31': '<span class="ansi-red">',
    '32': '<span class="ansi-green">',
    '33': '<span class="ansi-yellow">',
    '34': '<span class="ansi-blue">',
    '35': '<span class="ansi-magenta">',
    '36': '<span class="ansi-cyan">',
    '37': '<span class="ansi-white">',
    '90': '<span class="ansi-bright-black">',
    '91': '<span class="ansi-bright-red">',
    '92': '<span class="ansi-bright-green">',
    '93': '<span class="ansi-bright-yellow">',
    '94': '<span class="ansi-bright-blue">',
    '95': '<span class="ansi-bright-magenta">',
    '96': '<span class="ansi-bright-cyan">',
    '97': '<span class="ansi-bright-white">',
  };

  // Escape HTML entities first
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Replace ANSI codes with HTML spans
  // Handle 256-color: \x1b[38;5;XXXm
  html = html.replace(/\x1b\[38;5;(\d+)m/g, (_, code) => {
    return `<span class="ansi-256-${code}">`;
  });

  // Handle standard codes
  html = html.replace(/\x1b\[([0-9;]+)m/g, (_, codes) => {
    const parts = codes.split(';');
    let result = '';
    for (const code of parts) {
      if (code === '0') {
        result += '</span>';
      } else if (colorMap[code]) {
        result += colorMap[code];
      }
    }
    return result;
  });

  // Remove any remaining escape sequences
  html = html.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');

  return html;
}

/**
 * Format relative time (1m ago, 5h ago, 3d ago)
 */
function relativeTime(unixTimestamp) {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - unixTimestamp;
  if (diff < 60) return '1m';
  const mins = Math.floor(diff / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

/**
 * Post-process graph HTML to add timestamps, indicators, and branch-colored hashes.
 * Two-color scheme: master = green, all other branches = blue.
 */
function enhanceGraphHtml(graphHtml, commitData, refMap) {
  const lines = graphHtml.split('\n');

  // Find master branch's ANSI class by locating master/main commit's node
  let masterAnsiClass = null;
  for (const [hash, info] of commitData) {
    if (info.refs && (info.refs.includes('HEAD -> master') || info.refs.includes('HEAD -> main') ||
        info.refs.match(/\bmaster\b/) || info.refs.match(/\bmain\b/))) {
      // Find this hash in the HTML lines and get its node's ANSI class
      for (const line of lines) {
        if (line.includes(hash)) {
          const nodeMatch = line.match(/<span class="(ansi-256-\d+|ansi-\w+)">\u25cf<\/span>/);
          if (nodeMatch) { masterAnsiClass = nodeMatch[1]; break; }
        }
      }
      if (masterAnsiClass) break;
    }
  }

  // Collect all ANSI classes used on graph nodes
  const allAnsiClasses = new Set();
  for (const line of lines) {
    const matches = line.matchAll(/<span class="(ansi-256-\d+|ansi-\w+)">/g);
    for (const m of matches) allAnsiClasses.add(m[1]);
  }

  const enhanced = lines.map(line => {
    // Replace all ANSI color classes: master → green, others → blue
    for (const ansiClass of allAnsiClasses) {
      const branchClass = ansiClass === masterAnsiClass ? 'git-branch-master' : 'git-branch-other';
      line = line.replaceAll(`class="${ansiClass}"`, `class="${branchClass}"`);
    }

    // Find a commit hash in this line (7-char hex inside a span)
    const hashMatch = line.match(/<span class="([^"]+)">([a-f0-9]{7})<\/span>/);
    if (!hashMatch) {
      // Connector-only lines still need the indicator spacer for alignment
      return '<span class="git-indicator"></span>' + line;
    }

    const hash = hashMatch[2];
    const info = commitData.get(hash);

    // 1. Color commit ID to match branch node color
    const nodeMatch = line.match(/<span class="(git-branch-\w+)">\u25cf<\/span>/);
    if (nodeMatch) {
      const branchColorClass = nodeMatch[1];
      line = line.replace(
        `<span class="${hashMatch[1]}">${hash}</span>`,
        `<span class="${branchColorClass}">${hash}</span>`
      );
    }

    // 2. Add relative timestamp after hash
    if (info?.timestamp) {
      const timeStr = relativeTime(info.timestamp);
      line = line.replace(
        new RegExp(`(<span class="[^"]*">${hash}</span>)`),
        `$1 <span class="git-time">${timeStr}</span>`
      );
    }

    // 2b. Add tag labels after timestamp
    if (info?.refs) {
      const tagMatches = info.refs.match(/tag: ([^,)]+)/g);
      if (tagMatches) {
        const tags = tagMatches.map(t => t.replace('tag: ', '').trim());
        const tagHtml = tags.map(t => `<span class="git-tag">\uD83C\uDFF7 ${t}</span>`).join(' ');
        // Insert after the git-time span, or after the hash span if no time
        const timeSpanEnd = '</span>';
        const timeIdx = line.lastIndexOf('class="git-time"');
        if (timeIdx !== -1) {
          const closeIdx = line.indexOf(timeSpanEnd, timeIdx);
          if (closeIdx !== -1) {
            const insertPos = closeIdx + timeSpanEnd.length;
            line = line.slice(0, insertPos) + ' ' + tagHtml + line.slice(insertPos);
          }
        } else {
          const hashSpanMatch = line.match(new RegExp(`(<span class="[^"]*">${hash}</span>)`));
          if (hashSpanMatch) {
            line = line.replace(hashSpanMatch[1], hashSpanMatch[1] + ' ' + tagHtml);
          }
        }
      }
    }

    // 3. Add master/remote indicators on the LEFT of the line
    let indicator = '';
    if (info?.refs) {
      const refs = info.refs;
      if (refs.includes('origin/master') || refs.includes('origin/main')) {
        indicator = '<span class="git-indicator git-remote" title="remote"><svg viewBox="0 0 24 24" width="10" height="10" fill="currentColor" style="vertical-align:middle"><path d="M19.35 10.04A7.49 7.49 0 0 0 12 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 0 0 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z"/></svg></span>';
      }
      if (refs.includes('HEAD -> master') || refs.includes('HEAD -> main') ||
          (refs.match(/\bmaster\b/) && !refs.includes('origin/')) ||
          (refs.match(/\bmain\b/) && !refs.includes('origin/'))) {
        indicator = '<span class="git-indicator git-master" title="master">\u2299</span>';
      }
      if ((refs.includes('origin/master') || refs.includes('origin/main')) &&
          (refs.match(/\bmaster\b/) || refs.match(/\bmain\b/)) &&
          !(refs.includes('origin/master') && !refs.match(/(?<!origin\/)master\b/))) {
        const hasLocal = refs.includes('HEAD -> master') || refs.includes('HEAD -> main') ||
          (refs.replace(/origin\/master|origin\/main/g, '').match(/\bmaster\b|\bmain\b/));
        const hasRemote = refs.includes('origin/master') || refs.includes('origin/main');
        if (hasLocal && hasRemote) {
          indicator = '<span class="git-indicator git-synced" title="master + remote"><svg viewBox="0 0 24 24" width="10" height="10" fill="currentColor" style="vertical-align:middle"><path d="M19.35 10.04A7.49 7.49 0 0 0 12 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 0 0 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z"/></svg></span>';
        }
      }
    }

    if (indicator) {
      line = indicator + line;
    } else {
      line = '<span class="git-indicator"></span>' + line;
    }

    return line;
  });

  return enhanced.join('\n');
}

/**
 * Fetch git graph data for a local repository (async — does NOT block event loop)
 */
async function fetchGraphData(repoPath, maxCommits = 50) {
  const opts = { cwd: repoPath, encoding: 'utf-8', timeout: 15000 };
  try {
    // Verify it's a git repo
    await execAsync('git rev-parse --is-inside-work-tree', opts);

    // Run independent git queries in parallel to minimize wall-clock time
    const [branchResult, stagedResult, unstagedResult, untrackedResult, logResult] = await Promise.all([
      execAsync('git branch --show-current', opts),
      execAsync('git diff --cached --name-only', opts),
      execAsync('git diff --name-only', opts),
      execAsync('git ls-files --others --exclude-standard', opts),
      execAsync(`git log --all --format="%h %at %D" -n ${maxCommits}`, opts).catch(() => ({ stdout: '' })),
    ]);

    const branch = branchResult.stdout.trim();
    const staged = stagedResult.stdout.trim().split('\n').filter(Boolean).length;
    const unstaged = unstagedResult.stdout.trim().split('\n').filter(Boolean).length;
    const untracked = untrackedResult.stdout.trim().split('\n').filter(Boolean).length;
    const total = staged + unstaged + untracked;

    // Get commit timestamps and refs for enrichment
    const commitData = new Map();
    const refMap = new Map();
    for (const line of logResult.stdout.trim().split('\n')) {
      if (!line) continue;
      const parts = line.match(/^([a-f0-9]+)\s+(\d+)\s*(.*)?$/);
      if (parts) {
        const [, hash, ts, refs] = parts;
        commitData.set(hash, { timestamp: parseInt(ts), refs: refs || '' });
        if (refs) refMap.set(hash, refs);
      }
    }

    // Try git-graph first, fall back to git log --graph
    let graphOutput;
    const graphEnv = { ...process.env, PATH: process.env.PATH + ':/home/' + process.env.USER + '/.cargo/bin' + ':/home/' + process.env.USER + '/.local/bin' };
    try {
      const result = await execAsync(`git-graph -s round --no-pager --color always -n ${maxCommits}`, { ...opts, env: graphEnv });
      graphOutput = result.stdout;
    } catch {
      const result = await execAsync(`git log --all --graph --oneline --decorate --color=always -n ${maxCommits}`, opts);
      graphOutput = result.stdout;
    }

    let graphHtml = ansiToHtml(graphOutput);
    graphHtml = enhanceGraphHtml(graphHtml, commitData, refMap);

    return {
      branch,
      uncommitted: { total, staged, unstaged, untracked },
      clean: total === 0,
      graphHtml,
      repoPath,
      timestamp: Date.now()
    };
  } catch (error) {
    return {
      error: error.message,
      repoPath,
      timestamp: Date.now()
    };
  }
}

const SKIP_DIRS = new Set(['node_modules', '.git', '.hg', '.svn', '.worktrees', 'vendor', 'dist', 'build', '__pycache__', '.cache', '.npm', '.yarn', '.claude']);
const DEFAULT_MAX_DEPTH = 4;

/**
 * Recursively scan a directory for git repositories up to maxDepth (async).
 * Once a .git repo is found, we don't recurse into it (no repo-inside-repo).
 * @param {string} scanRoot - the root folder the scan started from (for relative name display)
 * @param {Function} [onFound] - optional callback(repo) called each time a repo is found
 */
async function scanDirForRepos(dir, repos, seen, currentDepth, maxDepth, scanRoot, onFound) {
  if (currentDepth > maxDepth) return;
  let entries;
  try {
    entries = readdirSync(dir);
  } catch { return; }

  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const fullPath = join(dir, entry);
    try {
      const stat = statSync(fullPath);
      if (!stat.isDirectory()) continue;
      // Resolve symlinks so the same physical dir is never scanned twice
      let realPath;
      try { realPath = realpathSync(fullPath); } catch { realPath = fullPath; }
      if (seen.has(realPath)) continue;
      seen.add(realPath);

      const gitDir = join(fullPath, '.git');
      if (existsSync(gitDir)) {
        // Skip git worktrees — .git is a file (not directory) containing "gitdir: ..."
        const gitStat = statSync(gitDir);
        if (!gitStat.isDirectory()) continue;

        let branch = 'unknown';
        try {
          const result = await execAsync('git branch --show-current', { cwd: fullPath, encoding: 'utf-8', timeout: 5000 });
          branch = result.stdout.trim();
        } catch { /* ignore */ }
        const name = relative(scanRoot, fullPath) || entry;
        const repo = { path: fullPath, name, branch };
        repos.push(repo);
        if (onFound) onFound(repo);
        // Don't recurse into git repos — nested repos are unusual
      } else {
        // Not a git repo, keep searching deeper
        await scanDirForRepos(fullPath, repos, seen, currentDepth + 1, maxDepth, scanRoot, onFound);
      }
    } catch { /* skip entries we can't stat */ }
  }
}

/**
 * Scan for git repositories in common locations (local only, async)
 * @param {Function} [onFound] - optional callback(repo) for streaming results
 */
async function scanForRepos(onFound) {
  const home = homedir();
  const searchDirs = [
    home,
    join(home, 'Documents'),
    join(home, 'projects'),
    join(home, 'Music'),
    join(home, 'Music', '49Agents'),
  ];

  const repos = [];
  const seen = new Set();

  for (const dir of searchDirs) {
    if (!existsSync(dir)) continue;
    await scanDirForRepos(dir, repos, seen, 1, DEFAULT_MAX_DEPTH, home, onFound);
  }

  return repos;
}

/**
 * Scan for git repositories in a specific folder (local only, async)
 * @param {Function} [onFound] - optional callback(repo) for streaming results
 */
async function scanReposInFolder(folderPath, onFound) {
  const repos = [];
  try {
    if (!existsSync(folderPath)) return repos;
    const seen = new Set();

    // Check if the folder itself is a git repo (skip worktrees where .git is a file)
    const selfGitDir = join(folderPath, '.git');
    if (existsSync(selfGitDir) && statSync(selfGitDir).isDirectory()) {
      let branch = 'unknown';
      try {
        const result = await execAsync('git branch --show-current', { cwd: folderPath, encoding: 'utf-8', timeout: 5000 });
        branch = result.stdout.trim();
      } catch { /* ignore */ }
      const name = folderPath.split('/').pop() || folderPath;
      const repo = { path: folderPath, name, branch };
      repos.push(repo);
      let realSelf;
      try { realSelf = realpathSync(folderPath); } catch { realSelf = folderPath; }
      seen.add(realSelf);
      if (onFound) onFound(repo);
    }

    // Recursively scan children up to DEFAULT_MAX_DEPTH levels
    await scanDirForRepos(folderPath, repos, seen, 1, DEFAULT_MAX_DEPTH, folderPath, onFound);
  } catch { /* skip */ }
  return repos;
}

export const gitGraphService = {
  listGitGraphs() {
    return gitGraphsCache;
  },

  getGitGraph(id) {
    return gitGraphsCache.find(g => g.id === id);
  },

  createGitGraph({ repoPath, position, size, device }) {
    const id = randomUUID();
    const name = repoPath.split('/').pop();
    const gitGraph = {
      id,
      repoPath,
      repoName: name,
      position: position || { x: 100, y: 100 },
      size: size || { width: 500, height: 450 },
      device: device || null,
      createdAt: new Date().toISOString()
    };

    gitGraphsCache.push(gitGraph);
    saveGitGraphs(gitGraphsCache);
    return gitGraph;
  },

  updateGitGraph(id, updates) {
    const index = gitGraphsCache.findIndex(g => g.id === id);
    if (index === -1) {
      throw new Error(`Git graph pane not found: ${id}`);
    }

    const gitGraph = gitGraphsCache[index];
    // Position/size now handled by cloud-only storage
    if (updates.repoPath) {
      gitGraph.repoPath = updates.repoPath;
      gitGraph.repoName = updates.repoPath.split('/').pop();
    }

    gitGraphsCache[index] = gitGraph;
    saveGitGraphs(gitGraphsCache);
    return gitGraph;
  },

  deleteGitGraph(id) {
    const index = gitGraphsCache.findIndex(g => g.id === id);
    if (index !== -1) {
      gitGraphsCache.splice(index, 1);
      saveGitGraphs(gitGraphsCache);
    }
  },

  fetchGraphData,
  scanForRepos,
  scanReposInFolder
};
