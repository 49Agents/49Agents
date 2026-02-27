// Tutorial system for 49Agents
// Spotlight coach marks with floating explanation cards

(function() {
  'use strict';

  // ── State ──────────────────────────────────────────────────────────

  const STORAGE_KEY = 'tc_tutorial_progress';
  let currentStepIndex = -1; // -1 = not running
  let overlayBg = null;
  let spotlightEl = null;
  let cardEl = null;
  let _messageWatcher = null; // MutationObserver for waitForMessage steps

  function loadState() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch { return {}; }
  }

  function saveState(patch) {
    const s = { ...loadState(), ...patch };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  }

  // ── Tutorial Steps ─────────────────────────────────────────────────

  const STEPS = [
    // Chapter 1: Welcome & Setup
    {
      chapter: 1, chapterTitle: 'Welcome & Setup',
      title: 'Welcome to 49Agents',
      content: `
        <p>Your <strong>remote dev command center</strong>. Control terminals, edit files, track issues, and monitor AI coding sessions — all from your phone or any browser.</p>
        <p style="opacity:0.6;font-size:12px">This tour will walk you through everything you need to know.</p>
      `,
      target: null, position: 'center'
    },
    {
      chapter: 1, chapterTitle: 'Welcome & Setup',
      title: 'Share Feedback',
      titleBadge: '<kbd>Tab</kbd>+<kbd>F</kbd>',
      content: `
        <p>Share feedback, bugs, and get immediate responses from the <strong style="color:#4ec9b0;font-size:15px">founder</strong>.</p>
        <p>The feedback pane is a direct message with the <strong style="color:#4ec9b0;font-size:15px">founder</strong> — share bugs, comments, ideas, and proposals!</p>
        <p style="margin-top:12px;padding:10px 14px;background:rgba(78,201,176,0.1);border:1px solid rgba(78,201,176,0.3);border-radius:8px;font-size:13px;">
          <strong>Try it now:</strong> Type <kbd>hey</kbd> in the feedback chat below and send it!
        </p>
      `,
      target: '#feedback-hud', position: 'right',
      interactive: true,
      onEnter: function() {
        var hud = document.getElementById('feedback-hud');
        if (hud && hud.classList.contains('collapsed')) {
          hud.classList.remove('collapsed');
          hud._tutorialExpanded = true;
        }
        // Load messages if not loaded
        if (window._chatHud && window._chatHud.loadMessages) window._chatHud.loadMessages();
        // Focus textarea
        var textarea = hud && hud.querySelector('.chat-textarea');
        if (textarea) setTimeout(function() { textarea.focus(); }, 300);
      },
      onExit: function() {
        var hud = document.getElementById('feedback-hud');
        if (hud && hud._tutorialExpanded) {
          hud.classList.add('collapsed');
          delete hud._tutorialExpanded;
        }
      },
      waitForMessage: true
    },
    {
      chapter: 1, chapterTitle: 'Welcome & Setup',
      title: 'Connect Your Machine',
      content: `
        <p>To connect a machine, open the <strong>Machines</strong> pane in the HUD on the left side of your screen.</p>
        <p>Click the <strong>Add Machine</strong> button and follow the instructions to install and pair your agent.</p>
        <p style="opacity:0.6;font-size:12px">The agent connects outbound — no firewall or port config needed.</p>
      `,
      target: '#hud-overlay', position: 'auto',
      onEnter: function() {
        const hud = document.getElementById('hud-overlay');
        if (hud && hud.classList.contains('collapsed')) {
          hud.classList.remove('collapsed');
          hud._tutorialExpanded = true;
        }
      },
      onExit: function() {
        const hud = document.getElementById('hud-overlay');
        if (hud && hud._tutorialExpanded) {
          hud.classList.add('collapsed');
          delete hud._tutorialExpanded;
        }
      }
    },
    {
      chapter: 1, chapterTitle: 'Welcome & Setup',
      title: 'Multi-Device Setup',
      content: `
        <p>Connect <strong>multiple machines</strong> to one account. Each pane shows a <span style="display:inline-block;padding:1px 6px;background:rgba(99,102,241,0.2);border:1px solid rgba(99,102,241,0.3);border-radius:4px;font-size:10px;font-weight:600">device label</span> so you always know which machine you're working on.</p>
        <p style="opacity:0.6;font-size:12px">Switch between devices when creating new panes.</p>
      `,
      target: null, position: 'center'
    },

    // Chapter 2: Canvas & Panes
    {
      chapter: 2, chapterTitle: 'Canvas & Panes',
      title: 'Add Panes',
      content: `
        <p>Click the <strong>+</strong> button to add a new pane to your canvas.</p>
        <p>Each pane is a window into your dev machine — terminals, files, notes, and more.</p>
      `,
      target: '#add-pane-btn', position: 'auto'
    },
    {
      chapter: 2, chapterTitle: 'Canvas & Panes',
      title: 'Pane Types',
      content: `
        <p>Choose from <strong>7 pane types</strong>:</p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 16px;font-size:12px;margin:8px 0">
          <span><kbd>T</kbd> Terminal</span>
          <span><kbd>N</kbd> Note</span>
          <span><kbd>F</kbd> File Editor</span>
          <span><kbd>G</kbd> Git Graph</span>
          <span><kbd>B</kbd> Beads Issues</span>
          <span><kbd>W</kbd> Web Page</span>
          <span><kbd>D</kbd> Directory</span>
        </div>
        <p style="opacity:0.6;font-size:12px">Press the letter key when the menu is open as a shortcut.</p>
      `,
      target: '#add-pane-menu', position: 'auto',
      onEnter: function() {
        const menu = document.getElementById('add-pane-menu');
        if (menu) menu.classList.remove('hidden');
      },
      onExit: function() {
        const menu = document.getElementById('add-pane-menu');
        if (menu) menu.classList.add('hidden');
      }
    },
    {
      chapter: 2, chapterTitle: 'Canvas & Panes',
      title: 'Move Panes',
      content: `
        <p><strong>Drag the header bar</strong> of any pane to reposition it on the canvas.</p>
        <p style="opacity:0.6;font-size:12px">On mobile, tap and hold the header then drag.</p>
      `,
      target: '.pane .pane-header', position: 'auto'
    },
    {
      chapter: 2, chapterTitle: 'Canvas & Panes',
      title: 'Resize Panes',
      content: `
        <p>Drag the <strong>bottom-right corner</strong> of any pane to resize it.</p>
        <p style="opacity:0.6;font-size:12px">On mobile, long-press the resize handle then drag.</p>
      `,
      target: '.pane .pane-resize-handle', position: 'auto'
    },
    {
      chapter: 2, chapterTitle: 'Canvas & Panes',
      title: 'Navigate the Canvas',
      content: `
        <p>Your workspace is <strong>infinite</strong>:</p>
        <ul style="margin:8px 0;padding-left:20px;font-size:13px;line-height:1.8">
          <li><strong>Zoom:</strong> Scroll wheel (desktop) or pinch (mobile)</li>
          <li><strong>Pan:</strong> Drag empty canvas space</li>
          <li><strong>Zoom controls:</strong> + / − buttons in the bottom-right</li>
        </ul>
      `,
      target: null, position: 'center'
    },

    // Chapter 3: Settings & Navigation
    {
      chapter: 3, chapterTitle: 'Settings & Navigation',
      title: 'Settings',
      content: `
        <p>Open settings to customize your experience — themes, notification sounds, focus mode, terminal fonts, and more.</p>
        <p>Shortcut: <kbd>Tab</kbd>+<kbd>S</kbd></p>
      `,
      target: '#settings-btn', position: 'auto'
    },
    {
      chapter: 3, chapterTitle: 'Settings & Navigation',
      title: 'Move Mode',
      content: `
        <p>Double-tap <kbd>Tab</kbd> to enter <strong>Move Mode</strong> — navigate between panes using arrow keys or <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> without touching your mouse.</p>
        <p>Press <kbd>Enter</kbd> to focus the selected pane, or <kbd>Escape</kbd> to cancel.</p>
      `,
      target: null, position: 'center'
    },
    {
      chapter: 3, chapterTitle: 'Settings & Navigation',
      title: 'Keyboard Shortcuts',
      content: `
        <div style="display:grid;grid-template-columns:auto 1fr;gap:4px 16px;font-size:12px;margin:8px 0">
          <kbd>Tab</kbd>+<kbd>Q</kbd> <span>Cycle terminals</span>
          <kbd>Tab</kbd>+<kbd>A</kbd> <span>Add pane menu</span>
          <kbd>Tab</kbd>+<kbd>S</kbd> <span>Settings</span>
          <kbd>Tab</kbd>+<kbd>F</kbd> <span>Feedback</span>
          <kbd>Tab</kbd>+<kbd>H</kbd> <span>Hide/show HUD</span>
          <kbd>Tab</kbd>+<kbd>W</kbd> <span>Close focused pane</span>
          <kbd>Escape</kbd> <span>Cancel / clear selection</span>
        </div>
      `,
      target: null, position: 'center'
    },

    // Chapter 4: Power Features
    {
      chapter: 4, chapterTitle: 'Power Features',
      title: 'Broadcast Mode',
      content: `
        <p>Type in one terminal, <strong>send to many</strong>. Perfect for running the same command on multiple machines.</p>
        <ul style="margin:8px 0;padding-left:20px;font-size:13px;line-height:1.8">
          <li><strong>Shift+click</strong> terminal headers to select</li>
          <li><strong>Shift+drag</strong> empty canvas to rectangle-select</li>
          <li>Selected panes glow <span style="color:rgba(251,191,36,0.95)">gold</span></li>
        </ul>
      `,
      target: null, position: 'center'
    },
    {
      chapter: 4, chapterTitle: 'Power Features',
      title: 'Mention Mode',
      content: `
        <p>Use <strong>@</strong> to reference content from one pane in another — pull file contents, terminal output, or notes into context.</p>
        <p>Shortcut: <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>@</kbd></p>
        <p style="opacity:0.6;font-size:12px">Works across pane types — mention a file in a terminal, or terminal output in a note.</p>
      `,
      target: null, position: 'center'
    },
    {
      chapter: 4, chapterTitle: 'Power Features',
      title: 'Beads Issue Tracking',
      content: `
        <p>Tag panes with <strong>beads issues</strong> to track what you're working on. Assign a beads issue to a terminal or file pane to keep context organized.</p>
        <p style="opacity:0.6;font-size:12px">Open a Beads Issues pane (<kbd>B</kbd>) to manage your issues, then tag individual panes with the issue they belong to.</p>
      `,
      target: null, position: 'center'
    },

    // Chapter 5: Done
    {
      chapter: 5, chapterTitle: "You're Ready!",
      title: "You're Ready!",
      content: `
        <p>You now know everything you need to be productive with 49Agents.</p>
        <div style="margin:12px 0;padding:12px;background:rgba(99,102,241,0.1);border:1px solid rgba(99,102,241,0.2);border-radius:8px;font-size:12px;line-height:1.8">
          <strong>Quick Reference:</strong><br>
          <kbd>+</kbd> Add pane &nbsp;·&nbsp; <kbd>Tab</kbd><kbd>Tab</kbd> Move mode &nbsp;·&nbsp; <kbd>Tab</kbd>+<kbd>S</kbd> Settings<br>
          <kbd>Tab</kbd>+<kbd>Q</kbd> Cycle terminals &nbsp;·&nbsp; <kbd>Tab</kbd>+<kbd>F</kbd> Feedback &nbsp;·&nbsp; <kbd>Shift</kbd>+click Broadcast
        </div>
        <p>Click <strong>+</strong> to add your first pane and start building your workspace!</p>
      `,
      target: null, position: 'center'
    }
  ];

  // ── Chapter helpers ────────────────────────────────────────────────

  function getChapters() {
    const chapters = [];
    let last = 0;
    for (const s of STEPS) {
      if (s.chapter !== last) {
        chapters.push({ num: s.chapter, title: s.chapterTitle, startIndex: 0 });
        last = s.chapter;
      }
    }
    // fill startIndex
    let idx = 0;
    for (const c of chapters) {
      c.startIndex = idx;
      idx += STEPS.filter(s => s.chapter === c.num).length;
    }
    return chapters;
  }

  function getChapterForStep(stepIndex) {
    const step = STEPS[stepIndex];
    if (!step) return null;
    const chapters = getChapters();
    return chapters.find(c => c.num === step.chapter);
  }

  function getNextChapterStartIndex(stepIndex) {
    const step = STEPS[stepIndex];
    if (!step) return STEPS.length;
    const nextChapter = step.chapter + 1;
    const idx = STEPS.findIndex(s => s.chapter === nextChapter);
    return idx === -1 ? STEPS.length : idx;
  }

  function getStepInChapter(stepIndex) {
    const step = STEPS[stepIndex];
    if (!step) return { current: 0, total: 0 };
    const chapterSteps = STEPS.filter(s => s.chapter === step.chapter);
    const current = chapterSteps.indexOf(step) + 1;
    return { current, total: chapterSteps.length };
  }

  // ── DOM Creation ───────────────────────────────────────────────────

  function createOverlay() {
    // Background that catches clicks
    overlayBg = document.createElement('div');
    overlayBg.className = 'tutorial-overlay-bg';
    document.body.appendChild(overlayBg);

    // Spotlight element (positioned over target, box-shadow creates dark surround)
    spotlightEl = document.createElement('div');
    spotlightEl.className = 'tutorial-spotlight';
    document.body.appendChild(spotlightEl);

    // Card element
    cardEl = document.createElement('div');
    cardEl.className = 'tutorial-card';
    document.body.appendChild(cardEl);

    // overlay-bg is pointer-events:none to allow clicking through to spotlighted elements
  }

  function removeOverlay() {
    if (overlayBg) { overlayBg.remove(); overlayBg = null; }
    if (spotlightEl) { spotlightEl.remove(); spotlightEl = null; }
    if (cardEl) { cardEl.remove(); cardEl = null; }
  }

  // ── Positioning ────────────────────────────────────────────────────

  function positionSpotlight(targetEl) {
    if (!targetEl || !spotlightEl) {
      // No target — hide spotlight, overlay-bg provides dark backdrop
      if (spotlightEl) spotlightEl.style.display = 'none';
      if (overlayBg) overlayBg.style.background = 'rgba(0, 0, 0, 0.85)';
      return;
    }

    // Spotlight visible — its box-shadow provides dark surround, hide overlay-bg tint
    if (overlayBg) overlayBg.style.background = 'transparent';

    const rect = targetEl.getBoundingClientRect();
    const pad = 8;

    spotlightEl.style.display = 'block';
    spotlightEl.style.left = (rect.left - pad) + 'px';
    spotlightEl.style.top = (rect.top - pad) + 'px';
    spotlightEl.style.width = (rect.width + pad * 2) + 'px';
    spotlightEl.style.height = (rect.height + pad * 2) + 'px';
  }

  function positionCard(targetEl, position) {
    if (!cardEl) return;

    if (!targetEl || position === 'center') {
      // Center the card on screen
      cardEl.classList.add('tutorial-card--centered');
      cardEl.style.left = '50%';
      cardEl.style.top = '50%';
      cardEl.style.transform = 'translate(-50%, -50%)';
      cardEl.removeAttribute('data-arrow');
      return;
    }
    cardEl.classList.remove('tutorial-card--centered');

    const rect = targetEl.getBoundingClientRect();
    const pad = 8;
    const gap = 16;

    // Reset transform
    cardEl.style.transform = 'none';

    // Measure card
    cardEl.style.left = '-9999px';
    cardEl.style.top = '-9999px';
    const cardRect = cardEl.getBoundingClientRect();

    let finalPos = position;
    if (finalPos === 'auto') {
      // Pick the side with the most space
      const spaceAbove = rect.top;
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceLeft = rect.left;
      const spaceRight = window.innerWidth - rect.right;
      const maxSpace = Math.max(spaceAbove, spaceBelow, spaceLeft, spaceRight);

      if (maxSpace === spaceBelow) finalPos = 'below';
      else if (maxSpace === spaceAbove) finalPos = 'above';
      else if (maxSpace === spaceRight) finalPos = 'right';
      else finalPos = 'left';
    }

    let left, top;

    switch (finalPos) {
      case 'above':
        left = rect.left + rect.width / 2 - cardRect.width / 2;
        top = rect.top - pad - gap - cardRect.height;
        cardEl.setAttribute('data-arrow', 'below');
        break;
      case 'below':
        left = rect.left + rect.width / 2 - cardRect.width / 2;
        top = rect.bottom + pad + gap;
        cardEl.setAttribute('data-arrow', 'above');
        break;
      case 'left':
        left = rect.left - pad - gap - cardRect.width;
        top = rect.top + rect.height / 2 - cardRect.height / 2;
        cardEl.setAttribute('data-arrow', 'right');
        break;
      case 'right':
        left = rect.right + pad + gap;
        top = rect.top + rect.height / 2 - cardRect.height / 2;
        cardEl.setAttribute('data-arrow', 'left');
        break;
    }

    // Clamp to viewport
    left = Math.max(12, Math.min(left, window.innerWidth - cardRect.width - 12));
    top = Math.max(12, Math.min(top, window.innerHeight - cardRect.height - 12));

    cardEl.style.left = left + 'px';
    cardEl.style.top = top + 'px';
  }

  // ── Step Rendering ─────────────────────────────────────────────────

  function cleanupMessageWatcher() {
    if (_messageWatcher) {
      _messageWatcher.disconnect();
      _messageWatcher = null;
    }
  }

  function renderStep(index) {
    const step = STEPS[index];
    if (!step) return;

    // Cleanup any previous message watcher
    cleanupMessageWatcher();

    // Run onEnter hook
    if (step.onEnter) step.onEnter();

    // Find target element
    let targetEl = null;
    if (step.target) {
      targetEl = document.querySelector(step.target);
    }

    // Position spotlight
    positionSpotlight(targetEl);

    // Build card content
    const chapter = getChapterForStep(index);
    const { current, total } = getStepInChapter(index);
    const chapters = getChapters();
    const isFirst = index === 0;
    const isLast = index === STEPS.length - 1;

    // Title with optional badge on the right
    const titleBadgeHtml = step.titleBadge ? `<span class="tutorial-title-badge">${step.titleBadge}</span>` : '';

    cardEl.innerHTML = `
      <div class="tutorial-card-header">
        <span class="tutorial-chapter-badge">Chapter ${chapter.num}/${chapters.length}: ${chapter.title}</span>
        <span class="tutorial-step-count">Step ${current}/${total}</span>
      </div>
      <div class="tutorial-progress-bar">
        <div class="tutorial-progress-fill" style="width:${((index + 1) / STEPS.length) * 100}%"></div>
      </div>
      <div class="tutorial-title-row">
        <h3 class="tutorial-title">${step.title}</h3>
        ${titleBadgeHtml}
      </div>
      <div class="tutorial-content">${step.content}</div>
      <div class="tutorial-nav">
        ${!isFirst ? '<button class="tutorial-btn tutorial-btn-back">Back</button>' : '<span></span>'}
        <div class="tutorial-nav-right">
          ${!isLast && getNextChapterStartIndex(index) < STEPS.length ? '<button class="tutorial-btn tutorial-btn-skip">Skip Chapter</button>' : ''}
          ${isLast
            ? '<button class="tutorial-btn tutorial-btn-next tutorial-btn-primary">Finish</button>'
            : '<button class="tutorial-btn tutorial-btn-next tutorial-btn-primary">Next</button>'
          }
        </div>
      </div>
      <button class="tutorial-btn-close" aria-label="End tutorial">&times;</button>
    `;

    // Position card
    positionCard(targetEl, step.position);

    // Attach navigation handlers
    const backBtn = cardEl.querySelector('.tutorial-btn-back');
    const nextBtn = cardEl.querySelector('.tutorial-btn-next');
    const skipBtn = cardEl.querySelector('.tutorial-btn-skip');
    const closeBtn = cardEl.querySelector('.tutorial-btn-close');

    if (backBtn) backBtn.addEventListener('click', () => goToStep(index - 1));
    if (nextBtn) nextBtn.addEventListener('click', () => {
      if (isLast) endTutorial(true);
      else goToStep(index + 1);
    });
    if (skipBtn) skipBtn.addEventListener('click', () => {
      const nextStart = getNextChapterStartIndex(index);
      if (nextStart >= STEPS.length) endTutorial(true);
      else goToStep(nextStart);
    });
    if (closeBtn) closeBtn.addEventListener('click', () => endTutorial(false));

    // Interactive step: disable Next until condition met
    if (step.interactive && step.waitForMessage && nextBtn) {
      nextBtn.disabled = true;
      nextBtn.style.opacity = '0.4';
      nextBtn.style.cursor = 'not-allowed';
      nextBtn.textContent = 'Send a message first';

      // Watch for new messages in the feedback HUD chat
      const msgList = document.querySelector('#feedback-hud .chat-messages');
      if (msgList) {
        _messageWatcher = new MutationObserver(function(mutations) {
          // Check if a user bubble was added
          for (var i = 0; i < mutations.length; i++) {
            var added = mutations[i].addedNodes;
            for (var j = 0; j < added.length; j++) {
              if (added[j].classList && added[j].classList.contains('chat-bubble') && added[j].classList.contains('user')) {
                // User sent a message — unlock Next
                nextBtn.disabled = false;
                nextBtn.style.opacity = '1';
                nextBtn.style.cursor = 'pointer';
                nextBtn.textContent = 'Next';
                cleanupMessageWatcher();
                return;
              }
            }
          }
        });
        _messageWatcher.observe(msgList, { childList: true });
      }
    }

    // Save progress
    currentStepIndex = index;
    saveState({ lastStep: index });
  }

  function goToStep(index) {
    // Cleanup previous step
    cleanupMessageWatcher();
    const prevStep = STEPS[currentStepIndex];
    if (prevStep && prevStep.onExit) prevStep.onExit();

    if (index < 0 || index >= STEPS.length) {
      endTutorial(true);
      return;
    }

    renderStep(index);
  }

  // ── Resize handler ──────────────────────────────────────────────────

  let resizeTimer = null;
  function handleResize() {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (currentStepIndex < 0) return;
      const step = STEPS[currentStepIndex];
      if (!step) return;
      let targetEl = step.target ? document.querySelector(step.target) : null;
      positionSpotlight(targetEl);
      positionCard(targetEl, step.position);
    }, 100);
  }

  // ── Keyboard handler ───────────────────────────────────────────────

  function handleKeydown(e) {
    if (currentStepIndex < 0) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      endTutorial(false);
    } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
      // Block advance on interactive steps where Next is still locked
      var nextB = cardEl && cardEl.querySelector('.tutorial-btn-next');
      if (nextB && nextB.disabled) return;
      e.preventDefault();
      e.stopPropagation();
      if (currentStepIndex >= STEPS.length - 1) endTutorial(true);
      else goToStep(currentStepIndex + 1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      e.stopPropagation();
      if (currentStepIndex > 0) goToStep(currentStepIndex - 1);
    }
  }

  // ── Public API ─────────────────────────────────────────────────────

  function startTutorial(fromStep) {
    if (currentStepIndex >= 0) return; // already running

    // Determine start step: explicit param > saved progress > 0
    let startIdx = 0;
    if (typeof fromStep === 'number' && fromStep >= 0 && fromStep < STEPS.length) {
      startIdx = fromStep;
    } else {
      const saved = loadState();
      if (saved.dismissed && typeof saved.lastStep === 'number' && saved.lastStep >= 0 && saved.lastStep < STEPS.length) {
        startIdx = saved.lastStep;
      }
    }

    // Mark as running immediately to prevent double-launch race
    currentStepIndex = startIdx;

    createOverlay();
    document.addEventListener('keydown', handleKeydown, true);
    window.addEventListener('resize', handleResize);

    // Small delay to let overlay render
    requestAnimationFrame(() => renderStep(startIdx));
  }

  function endTutorial(completed) {
    const savedIndex = currentStepIndex;

    // Cleanup watchers
    cleanupMessageWatcher();

    // Cleanup current step
    const step = STEPS[currentStepIndex];
    if (step && step.onExit) step.onExit();

    document.removeEventListener('keydown', handleKeydown, true);
    window.removeEventListener('resize', handleResize);
    removeOverlay();
    currentStepIndex = -1;

    saveState({
      completed: completed || false,
      dismissed: !completed,
      lastStep: completed ? STEPS.length - 1 : savedIndex
    });
  }

  function isTutorialActive() {
    return currentStepIndex >= 0;
  }

  // ── Auto-start for new users ────────────────────────────────────────

  function autoStartIfNewUser() {
    const saved = loadState();
    // Never seen tutorial before — auto-start
    if (!saved.completed && !saved.dismissed && saved.lastStep === undefined) {
      // Small delay so the app finishes initializing first
      setTimeout(() => startTutorial(0), 1500);
    }
  }

  // ── Expose globally ────────────────────────────────────────────────

  window.__tcTutorial = {
    start: startTutorial,
    end: endTutorial,
    isActive: isTutorialActive,
    autoStartIfNewUser: autoStartIfNewUser,
    STEPS: STEPS
  };

})();
