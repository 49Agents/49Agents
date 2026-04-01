// ─── Git Graph Renderer ───────────────────────────────────────────────────
// Renders git commit history as an SVG graph with lane assignment.

import { escapeHtml } from './utils.js';
import { ICON_GIT_GRAPH } from './constants.js';

let _ctx = null;

export function initGitGraphDeps(ctx) { _ctx = ctx; }

// ── SVG Graph Constants ──
const GG = {
  ROW_H: 24, LANE_W: 16, NODE_R: 4, MERGE_R_OUTER: 5.5, MERGE_R_INNER: 2.5,
  LEFT_PAD: 16, LINE_W: 2, SHADOW_W: 4,
  // 12-color palette matching mhutchie/vscode-git-graph
  COLORS: [
    '#85e89d', '#0085d9', '#b392f0', '#d9008f', '#ffab70', '#00d90a',
    '#f97583', '#d98500', '#4ec9b0', '#a300d9', '#ffd33d', '#dc5b23',
  ],
};

export function renderGitGraphPane(paneData) {
  const existingPane = document.getElementById(`pane-${paneData.id}`);
  if (existingPane) existingPane.remove();

  const pane = document.createElement('div');
  pane.className = 'pane git-graph-pane';
  pane.id = `pane-${paneData.id}`;
  pane.style.left = `${paneData.x}px`;
  pane.style.top = `${paneData.y}px`;
  pane.style.width = `${paneData.width}px`;
  pane.style.height = `${paneData.height}px`;
  pane.style.zIndex = paneData.zIndex;
  pane.dataset.paneId = paneData.id;

  if (!paneData.shortcutNumber) paneData.shortcutNumber = _ctx.getNextShortcutNumber();
  const deviceTag = paneData.device ? _ctx.deviceLabelHtml(paneData.device) : '';

  pane.innerHTML = `
    <div class="pane-header">
      <span class="pane-title git-graph-title">
        ${deviceTag}<svg viewBox="0 0 24 24" width="14" height="14" style="vertical-align: middle; margin-right: 4px;">${ICON_GIT_GRAPH}</svg>
        ${paneData.repoName || 'Git Graph'}
      </span>
      ${_ctx.paneNameHtml(paneData)}
      <div class="pane-header-right">
        ${_ctx.shortcutBadgeHtml(paneData)}
        <div class="pane-zoom-controls">
          <button class="pane-zoom-btn zoom-out" data-tooltip="Zoom out">\u2212</button>
          <button class="pane-zoom-btn zoom-in" data-tooltip="Zoom in">+</button>
        </div>
        <button class="pane-expand" aria-label="Expand pane" data-tooltip="Expand">\u26F6</button>
        <button class="pane-close" aria-label="Close pane"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      </div>
    </div>
    <div class="pane-content">
      <div class="git-graph-container">
        <div class="git-graph-header">
          <span class="git-graph-branch"></span>
          <span class="git-graph-status"></span>
          <button class="git-graph-mode-btn" data-tooltip="Toggle SVG/ASCII mode">${paneData.graphMode === 'ascii' ? 'SVG' : 'ASCII'}</button>
          <button class="git-graph-push-btn" data-tooltip="Push to remote"><svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" style="vertical-align: middle; margin-right: 3px;"><path d="M19.35 10.04A7.49 7.49 0 0 0 12 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 0 0 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z"/></svg>Push</button>
        </div>
        <div class="git-graph-output"><span class="git-graph-loading">Loading git graph...</span></div>
      </div>
    </div>
    <div class="pane-resize-handle"></div>
  `;

  _ctx.setupPaneListeners(pane, paneData);
  setupGitGraphListeners(pane, paneData);
  _ctx.getCanvas().appendChild(pane);

  fetchGitGraphData(pane, paneData);
}

function setupGitGraphListeners(paneEl, paneData) {
  const graphOutput = paneEl.querySelector('.git-graph-output');
  const pushBtn = paneEl.querySelector('.git-graph-push-btn');
  const modeBtn = paneEl.querySelector('.git-graph-mode-btn');

  if (!paneData.graphMode) paneData.graphMode = 'svg';

  modeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    paneData.graphMode = paneData.graphMode === 'svg' ? 'ascii' : 'svg';
    modeBtn.textContent = paneData.graphMode === 'ascii' ? 'SVG' : 'ASCII';
    _ctx.cloudSaveLayout(paneData);
    fetchGitGraphData(paneEl, paneData);
  });

  pushBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    pushBtn.disabled = true;
    pushBtn.textContent = 'Pushing\u2026';
    pushBtn.classList.add('pushing');
    try {
      await _ctx.agentRequest('POST', `/api/git-graphs/${paneData.id}/push`, null, paneData.agentId);
      pushBtn.textContent = 'Pushed!';
      pushBtn.classList.add('push-success');
      fetchGitGraphData(paneEl, paneData);
    } catch (err) {
      pushBtn.textContent = 'Failed';
      pushBtn.classList.add('push-failed');
      console.error('[App] Git push error:', err);
    }
    setTimeout(() => {
      pushBtn.disabled = false;
      pushBtn.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" style="vertical-align: middle; margin-right: 3px;"><path d="M19.35 10.04A7.49 7.49 0 0 0 12 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 0 0 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z"/></svg>Push';
      pushBtn.classList.remove('pushing', 'push-success', 'push-failed');
    }, 2000);
  });

  graphOutput.addEventListener('mousedown', (e) => e.stopPropagation());
  graphOutput.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
  graphOutput.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });

  const refreshInterval = setInterval(() => fetchGitGraphData(paneEl, paneData), 5000);
  _ctx.gitGraphPanes.set(paneData.id, { refreshInterval });
}

export function assignLanes(commits) {
  const hashIndex = new Map();
  commits.forEach((c, i) => hashIndex.set(c.hash, i));

  const lanes = new Map();       // hash -> lane index
  const activeLanes = [];        // lane index -> expected hash (or null if free)
  let maxLane = 0;
  const branchColors = new Map(); // lane index -> color index

  // Color pool: track when each color was freed (row index).
  // A color is available if it was freed before the current row.
  const colorFreeAt = new Array(GG.COLORS.length).fill(-1); // row when color became free
  let masterColorIdx = 0; // green for main/master
  colorFreeAt[masterColorIdx] = Infinity; // reserve until assigned

  // Find master/main HEAD commit to assign color 0
  let masterHash = null;
  for (const c of commits) {
    if (c.refs && (/HEAD -> main\b/.test(c.refs) || /HEAD -> master\b/.test(c.refs))) {
      masterHash = c.hash;
      break;
    }
  }

  function allocateColor(row) {
    // Find earliest-freed color (temporal separation)
    let bestIdx = -1, bestFreeRow = Infinity;
    for (let c = 1; c < GG.COLORS.length; c++) { // skip 0 (reserved for master)
      if (colorFreeAt[c] <= row && colorFreeAt[c] < bestFreeRow) {
        bestFreeRow = colorFreeAt[c];
        bestIdx = c;
      }
    }
    if (bestIdx === -1) {
      // All colors in use — pick the one freed longest ago (fallback)
      bestIdx = 1;
      for (let c = 2; c < GG.COLORS.length; c++) {
        if (colorFreeAt[c] < colorFreeAt[bestIdx]) bestIdx = c;
      }
    }
    colorFreeAt[bestIdx] = Infinity; // mark in use
    return bestIdx;
  }

  function freeColor(colorIdx, row) {
    if (colorIdx === masterColorIdx) return; // never free master color
    colorFreeAt[colorIdx] = row;
  }

  for (let row = 0; row < commits.length; row++) {
    const commit = commits[row];

    // Find lane: check if any active lane expects this commit
    let lane = -1;
    for (let i = 0; i < activeLanes.length; i++) {
      if (activeLanes[i] === commit.hash) { lane = i; break; }
    }
    if (lane === -1) {
      // New branch — find first free lane
      for (let i = 0; i < activeLanes.length; i++) {
        if (activeLanes[i] === null) { lane = i; break; }
      }
      if (lane === -1) { lane = activeLanes.length; activeLanes.push(null); }
    }

    lanes.set(commit.hash, lane);
    if (lane > maxLane) maxLane = lane;

    // Assign color if not already set
    if (!branchColors.has(lane)) {
      if (commit.hash === masterHash) {
        branchColors.set(lane, masterColorIdx);
        colorFreeAt[masterColorIdx] = Infinity;
      } else {
        branchColors.set(lane, allocateColor(row));
      }
    }

    // Free this lane's slot
    const oldColor = branchColors.get(lane);
    activeLanes[lane] = null;

    if (commit.parents.length > 0) {
      const firstParent = commit.parents[0];
      if (hashIndex.has(firstParent) && !lanes.has(firstParent)) {
        const existingLane = activeLanes.indexOf(firstParent);
        if (existingLane === -1) {
          // Continue in same lane — keep same color
          activeLanes[lane] = firstParent;
        }
      } else if (!hashIndex.has(firstParent)) {
        // Parent not in our commit list — lane dies here, free color
        freeColor(oldColor, row);
      }

      // Handle merge parents (2nd, 3rd, etc.)
      for (let p = 1; p < commit.parents.length; p++) {
        const parentHash = commit.parents[p];
        if (!hashIndex.has(parentHash) || lanes.has(parentHash)) continue;
        const existing = activeLanes.indexOf(parentHash);
        if (existing !== -1) continue;
        let mergeLane = -1;
        for (let i = 0; i < activeLanes.length; i++) { if (activeLanes[i] === null) { mergeLane = i; break; } }
        if (mergeLane === -1) { mergeLane = activeLanes.length; activeLanes.push(null); }
        activeLanes[mergeLane] = parentHash;
        if (mergeLane > maxLane) maxLane = mergeLane;
        if (!branchColors.has(mergeLane)) {
          branchColors.set(mergeLane, allocateColor(row));
        }
      }
    } else {
      // Root commit — lane dies, free color
      freeColor(oldColor, row);
    }

    // Free colors for lanes that became empty (no longer expecting anything)
    if (activeLanes[lane] === null && oldColor !== undefined) {
      // Only free if we didn't re-assign this lane above
      const stillActive = activeLanes[lane] !== null;
      if (!stillActive) freeColor(oldColor, row);
    }
  }

  return { lanes, maxLane, branchColors };
}

export function gitRelativeTime(ts) {
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 60) return '1m';
  const mins = Math.floor(diff / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo`;
  return `${Math.floor(months / 12)}y`;
}

export function renderSvgGitGraph(outputEl, commits, currentBranch) {
  if (!commits || commits.length === 0) {
    outputEl.innerHTML = '<span class="git-graph-loading">No commits found</span>';
    return;
  }

  const { lanes, maxLane, branchColors } = assignLanes(commits);
  const svgWidth = GG.LEFT_PAD + (maxLane + 1) * GG.LANE_W + 8;
  const totalHeight = commits.length * GG.ROW_H;

  const pathSegments = []; // { d, color, isMergeIn }
  const nodes = [];        // { cx, cy, color, isMerge, isHead }
  const hashIndex = new Map();
  commits.forEach((c, i) => hashIndex.set(c.hash, i));

  // Detect HEAD commit
  let headHash = null;
  for (const c of commits) {
    if (c.refs && /HEAD/.test(c.refs)) { headHash = c.hash; break; }
  }

  for (let i = 0; i < commits.length; i++) {
    const commit = commits[i];
    const lane = lanes.get(commit.hash);
    const colorIdx = branchColors.get(lane) ?? 1;
    const color = GG.COLORS[colorIdx];
    const cx = GG.LEFT_PAD + lane * GG.LANE_W;
    const cy = i * GG.ROW_H + GG.ROW_H / 2;
    const isMerge = commit.parents.length > 1;
    const isHead = commit.hash === headHash;

    nodes.push({ cx, cy, color, isMerge, isHead, hash: commit.hash });

    for (let pIdx = 0; pIdx < commit.parents.length; pIdx++) {
      const parentHash = commit.parents[pIdx];
      const pi = hashIndex.get(parentHash);
      if (pi === undefined) continue;
      const parentLane = lanes.get(parentHash);
      if (parentLane === undefined) continue;
      const parentColorIdx = branchColors.get(parentLane) ?? 1;
      const px = GG.LEFT_PAD + parentLane * GG.LANE_W;
      const py = pi * GG.ROW_H + GG.ROW_H / 2;

      let d;
      const isMergeIn = pIdx > 0; // secondary parent = merge-in line
      const isBranchOff = pIdx === 0 && lane !== parentLane; // first parent but different lane

      if (lane === parentLane) {
        // Same lane: straight vertical
        d = `M${cx} ${cy} L${px} ${py}`;
      } else if (isBranchOff) {
        // Branch-off: stay in parent lane first, then curve to child lane
        // "locked to end" — vertical first from child, curve near parent
        const curveD = GG.ROW_H * 0.8;
        d = `M${cx} ${cy} C${cx} ${cy + curveD}, ${px} ${py - curveD}, ${px} ${py}`;
      } else {
        // Merge-in: start from child lane, curve toward parent lane
        // "locked to start" — curve near child, vertical into parent
        const curveD = GG.ROW_H * 0.8;
        d = `M${cx} ${cy} C${px} ${cy + curveD}, ${px} ${py - curveD}, ${px} ${py}`;
      }

      // Merge-in lines use the incoming branch color; branch-off uses parent color
      const lineColor = isMergeIn ? color : GG.COLORS[parentColorIdx];
      pathSegments.push({ d, color: lineColor });
    }
  }

  // Render SVG: shadow paths first (wider, dark), then colored paths, then nodes on top
  const bgColor = '#0a0f1a'; // approximate dark canvas background for shadow
  const svgShadows = pathSegments.map(p =>
    `<path d="${p.d}" stroke="${bgColor}" stroke-width="${GG.SHADOW_W}" fill="none" stroke-linecap="round"/>`
  ).join('');
  const svgPaths = pathSegments.map(p =>
    `<path d="${p.d}" stroke="${p.color}" stroke-width="${GG.LINE_W}" fill="none" stroke-opacity="0.85" stroke-linecap="round"/>`
  ).join('');

  const svgNodes = nodes.map(n => {
    if (n.isHead) {
      // HEAD: open circle with thicker stroke (like mhutchie's "current" style)
      return `<circle cx="${n.cx}" cy="${n.cy}" r="${GG.NODE_R + 1}" fill="none" stroke="${n.color}" stroke-width="2.5"/>` +
             `<circle cx="${n.cx}" cy="${n.cy}" r="2" fill="${n.color}"/>`;
    }
    if (n.isMerge) {
      // Merge: double filled circle (outer + inner, like VS Code's built-in)
      return `<circle cx="${n.cx}" cy="${n.cy}" r="${GG.MERGE_R_OUTER}" fill="${n.color}" stroke="rgba(0,0,0,0.3)" stroke-width="0.5"/>` +
             `<circle cx="${n.cx}" cy="${n.cy}" r="${GG.MERGE_R_INNER}" fill="#0d1117"/>`;
    }
    // Regular commit: solid filled circle
    return `<circle cx="${n.cx}" cy="${n.cy}" r="${GG.NODE_R}" fill="${n.color}" stroke="rgba(0,0,0,0.3)" stroke-width="0.5"/>`;
  }).join('');

  const rowsHtml = commits.map((commit, i) => {
    const lane = lanes.get(commit.hash);
    const colorIdx = branchColors.get(lane) ?? 1;
    const color = GG.COLORS[colorIdx];
    const timeStr = commit.timestamp ? gitRelativeTime(commit.timestamp) : '';

    let refsHtml = '';
    if (commit.refs) {
      const refParts = commit.refs.split(',').map(r => r.trim()).filter(Boolean);
      for (const ref of refParts) {
        if (ref.startsWith('HEAD -> ')) {
          refsHtml += `<span class="gg-ref gg-ref-head">${escapeHtml(ref.replace('HEAD -> ', ''))}</span>`;
        } else if (ref.startsWith('tag: ')) {
          refsHtml += `<span class="gg-ref gg-ref-tag">${escapeHtml(ref.replace('tag: ', ''))}</span>`;
        } else if (ref.startsWith('origin/')) {
          refsHtml += `<span class="gg-ref gg-ref-remote">${escapeHtml(ref)}</span>`;
        } else {
          refsHtml += `<span class="gg-ref gg-ref-branch">${escapeHtml(ref)}</span>`;
        }
      }
    }

    return `<div class="gg-row" data-hash="${commit.hash}" style="height:${GG.ROW_H}px">
      <div class="gg-graph-spacer" style="width:${svgWidth}px"></div>
      <div class="gg-info">
        <span class="gg-hash" style="color:${color}">${commit.hash}</span>
        <span class="gg-time">${timeStr}</span>
        ${refsHtml}
        <span class="gg-subject">${escapeHtml(commit.subject || '')}</span>
        <span class="gg-author">${escapeHtml(commit.author || '')}</span>
      </div>
    </div>`;
  }).join('');

  outputEl.innerHTML = `
    <div class="gg-scroll-container">
      <svg class="gg-svg" width="${svgWidth}" height="${totalHeight}"
           viewBox="0 0 ${svgWidth} ${totalHeight}" xmlns="http://www.w3.org/2000/svg">
        ${svgShadows}
        ${svgPaths}
        ${svgNodes}
      </svg>
      <div class="gg-rows">${rowsHtml}</div>
    </div>`;
}

export function renderAsciiGitGraph(outputEl, asciiGraph, commits) {
  if (!asciiGraph) {
    outputEl.innerHTML = '<span class="git-graph-loading">No graph data</span>';
    return;
  }

  // Build lookup from hash -> commit for enrichment
  const commitMap = new Map();
  if (commits) commits.forEach(c => commitMap.set(c.hash, c));

  // Determine lane colors: use assignLanes if commits available
  let laneColors = null;
  if (commits && commits.length > 0) {
    const { lanes, branchColors } = assignLanes(commits);
    laneColors = { lanes, branchColors };
  }

  const lines = asciiGraph.split('\n').filter(l => l.length > 0);

  const rowsHtml = lines.map(line => {
    // git log --graph --oneline produces: "graph_part hash (refs) subject"
    // Split into graph portion and text portion at the first hash match
    const hashMatch = line.match(/^([*|/\\ _.\-\s]+?)([a-f0-9]{7,})\s/);

    if (!hashMatch) {
      // Connector-only line (no commit on this line)
      const graphPart = escapeHtml(line);
      const colored = colorizeGraphChars(graphPart, laneColors, null);
      return `<div class="gg-row gg-ascii-row" style="height:${GG.ROW_H}px"><span class="gg-ascii-graph">${colored}</span></div>`;
    }

    const graphPart = hashMatch[1];
    const hash = hashMatch[2];
    const rest = line.slice(hashMatch[0].length - 1).slice(hash.length).trim();
    const commit = commitMap.get(hash);

    // Colorize graph characters
    const coloredGraph = colorizeGraphChars(escapeHtml(graphPart), laneColors, hash);

    // Get lane color for the hash
    let hashColor = '#79b8ff';
    if (laneColors && commit) {
      const lane = laneColors.lanes.get(hash);
      if (lane !== undefined) {
        const colorIdx = laneColors.branchColors.get(lane) ?? 1;
        hashColor = GG.COLORS[colorIdx];
      }
    }

    // Time
    const timeStr = commit?.timestamp ? gitRelativeTime(commit.timestamp) : '';

    // Refs from commit data (more reliable than parsing the oneline)
    let refsHtml = '';
    const refSrc = commit?.refs || '';
    if (refSrc) {
      const refParts = refSrc.split(',').map(r => r.trim()).filter(Boolean);
      for (const ref of refParts) {
        if (ref.startsWith('HEAD -> ')) {
          refsHtml += `<span class="gg-ref gg-ref-head">${escapeHtml(ref.replace('HEAD -> ', ''))}</span>`;
        } else if (ref.startsWith('tag: ')) {
          refsHtml += `<span class="gg-ref gg-ref-tag">${escapeHtml(ref.replace('tag: ', ''))}</span>`;
        } else if (ref.startsWith('origin/')) {
          refsHtml += `<span class="gg-ref gg-ref-remote">${escapeHtml(ref)}</span>`;
        } else {
          refsHtml += `<span class="gg-ref gg-ref-branch">${escapeHtml(ref)}</span>`;
        }
      }
    }

    // Subject: strip the (refs) decoration from git's oneline output
    const subject = commit?.subject || rest.replace(/\([^)]*\)\s*/, '').trim();

    // Author
    const authorHtml = commit?.author ? `<span class="gg-author">${escapeHtml(commit.author)}</span>` : '';

    return `<div class="gg-row gg-ascii-row" style="height:${GG.ROW_H}px">
      <span class="gg-ascii-graph">${coloredGraph}</span>
      <span class="gg-info">
        <span class="gg-hash" style="color:${hashColor}">${hash}</span>
        <span class="gg-time">${timeStr}</span>
        ${refsHtml}
        <span class="gg-subject">${escapeHtml(subject)}</span>
        ${authorHtml}
      </span>
    </div>`;
  }).join('');

  outputEl.innerHTML = `<div class="gg-scroll-container gg-ascii-container">${rowsHtml}</div>`;
}

// Colorize ASCII graph chars (* | / \) using lane colors
function colorizeGraphChars(graphStr, laneColors, commitHash) {
  // Color the graph symbols: * gets commit color, | / \ get lane position colors
  const graphChars = ['*', '|', '/', '\\', '_'];
  let result = '';
  let col = 0;
  for (let i = 0; i < graphStr.length; i++) {
    const ch = graphStr[i];
    if (graphChars.includes(ch)) {
      // Estimate lane from column position
      const laneIdx = Math.floor(col / 2);
      let color = GG.COLORS[laneIdx % GG.COLORS.length];

      // If we have lane data and this is the commit node, use the actual lane color
      if (ch === '*' && commitHash && laneColors) {
        const lane = laneColors.lanes.get(commitHash);
        if (lane !== undefined) {
          const colorIdx = laneColors.branchColors.get(lane) ?? 1;
          color = GG.COLORS[colorIdx];
        }
      }

      result += `<span style="color:${color}">${ch}</span>`;
    } else {
      result += ch;
    }
    col++;
  }
  return result;
}

export async function fetchGitGraphData(paneEl, paneData) {
  try {
    const outputEl = paneEl.querySelector('.git-graph-output');
    const maxCommits = 200;
    const modeParam = paneData.graphMode === 'ascii' ? '&mode=ascii' : '';
    const data = await _ctx.agentRequest('GET', `/api/git-graphs/${paneData.id}/data?maxCommits=${maxCommits}${modeParam}`, null, paneData.agentId);

    const branchEl = paneEl.querySelector('.git-graph-branch');
    const statusEl = paneEl.querySelector('.git-graph-status');

    if (data.error) {
      outputEl.innerHTML = `<span class="git-graph-error">Error: ${data.error}</span>`;
      return;
    }

    branchEl.innerHTML = `<span class="git-graph-branch-name">${escapeHtml(data.branch)}</span>`;

    if (data.clean) {
      statusEl.innerHTML = '<span class="git-graph-clean">&#x25cf; clean</span>';
    } else {
      const u = data.uncommitted;
      const details = [];
      if (u.staged > 0) details.push(`<span class="git-detail-staged">\u2713${u.staged}</span>`);
      if (u.unstaged > 0) details.push(`<span class="git-detail-modified">\u270E${u.unstaged}</span>`);
      if (u.untracked > 0) details.push(`<span class="git-detail-new">+${u.untracked}</span>`);
      const detailHtml = details.length ? `<span class="git-graph-detail">${details.join(' ')}</span>` : '';
      statusEl.innerHTML = `<span class="git-graph-dirty">&#x25cf; ${u.total} uncommitted</span>${detailHtml}`;
    }

    // Preserve scroll position across re-renders
    const scrollEl = outputEl.querySelector('.gg-scroll-container');
    const prevScrollTop = scrollEl ? scrollEl.scrollTop : 0;

    if (data.commits) {
      if (paneData.graphMode === 'ascii' && data.asciiGraph) {
        renderAsciiGitGraph(outputEl, data.asciiGraph, data.commits);
      } else {
        renderSvgGitGraph(outputEl, data.commits, data.branch);
      }
    } else if (data.graphHtml) {
      outputEl.innerHTML = `<pre style="margin:0;padding:8px 10px;white-space:pre;font-family:inherit;font-size:inherit;color:inherit;">${data.graphHtml}</pre>`;
    }

    // Restore scroll position
    if (prevScrollTop > 0) {
      const newScrollEl = outputEl.querySelector('.gg-scroll-container');
      if (newScrollEl) newScrollEl.scrollTop = prevScrollTop;
    }
  } catch (e) {
    console.error('[App] Failed to fetch git graph data:', e);
  }
}
