/**
 * Panes, Broadcasting & Navigation tutorial guide.
 *
 * Registers itself on window.TUT_GUIDES['panes'].
 * Receives a `ctx` object from the tutorial engine with all shared
 * helpers, DOM refs, and state accessors.
 */
(function () {
  'use strict';

  window.TUT_GUIDES = window.TUT_GUIDES || {};

  window.TUT_GUIDES['panes'] = async function panesTutorial(ctx) {
    const TOTAL_STEPS = 13;
    const {
      showPrompt, hidePrompt, sleep, waitForClick, waitForMenuItemClick, waitForMenuShortcut,
      waitForDrag, waitForResize, enterPlacementMode, enterShiftPlacementMode,
      waitForTabA,
      createFakeTerminalPane, showMenuItems,
      tutOverlay, tutDim, tutComplete, addPaneBtn, paneMenu, canvas, panes,
      updateHudCounts, setZoom, updateCanvasTransform,
    } = ctx;

    // ── Welcome ──
    await waitForClick('#tut-start-btn');
    tutOverlay.classList.add('hiding');
    await sleep(500);
    tutOverlay.classList.add('hidden');

    // Pre-create HUD with device already connected (skip onboarding)
    ctx.createHud();
    ctx.renderHudWithDevice();
    ctx.createUsageHud();

    // Show + button
    addPaneBtn.style.display = '';

    // ══════════════════════════════════════════
    // CHAPTER 1: WORKING WITH PANES
    // ══════════════════════════════════════════

    // ── Step 0: Add a terminal via Tab+A ──
    tutDim.classList.add('visible');
    showMenuItems(['terminal']);

    showPrompt('Working with Panes', 'Open the pane menu',
      'Hold <kbd>Tab</kbd> + press <kbd>A</kbd> to open the pane menu.',
      0, TOTAL_STEPS);

    addPaneBtn.classList.add('tut-above-dim');
    addPaneBtn.classList.add('tut-glow-purple');
    await waitForTabA();
    addPaneBtn.classList.remove('tut-glow-purple');

    showPrompt('Working with Panes', 'Select Terminal',
      'Press <kbd>T</kbd> to select a terminal pane.',
      0, TOTAL_STEPS);
    await waitForMenuShortcut('terminal');
    addPaneBtn.classList.remove('tut-above-dim');
    tutDim.classList.remove('visible');

    // Place first terminal
    showPrompt('Working with Panes', 'Place the terminal',
      'Click anywhere on the canvas to place it.',
      0, TOTAL_STEPS);
    const pos1 = await enterPlacementMode('terminal');
    const term1 = createFakeTerminalPane(pos1.x, pos1.y);
    hidePrompt();
    await sleep(400);

    // ── Step 1: Multi-place — Shift+Click to place 2 more terminals ──
    showPrompt('Working with Panes', 'Place two more terminals',
      'Hold <kbd>Shift</kbd> and click to place <span class="hl">two more terminals</span>. Shift+Click keeps you in placement mode.',
      1, TOTAL_STEPS);

    // Enter Shift+Click placement mode for 2 placements
    const pos2 = await enterShiftPlacementMode('terminal');
    const term2 = createFakeTerminalPane(pos2.x, pos2.y);

    const pos3 = await enterShiftPlacementMode('terminal');
    const term3 = createFakeTerminalPane(pos3.x, pos3.y);
    hidePrompt();
    await sleep(400);

    // ══════════════════════════════════════════
    // CHAPTER 2: BROADCAST MODE
    // ══════════════════════════════════════════

    // ── Step 2: Shift+Click to broadcast-select ──
    showPrompt('Broadcast Mode', 'Select terminals for broadcast',
      '<span class="hl">Shift+Click</span> on two or more terminals to select them for broadcasting. A yellow border will appear on selected panes.',
      2, TOTAL_STEPS);

    // Wait for user to shift+click 2+ panes
    await ctx.waitForBroadcastSelect(2);
    hidePrompt();
    await sleep(400);

    // ── Step 3: Type to all ──
    showPrompt('Broadcast Mode', 'Type a command',
      'Now <span class="hl">click inside</span> any selected terminal and type. Watch the text appear in <span class="hl">all selected terminals</span> simultaneously.',
      3, TOTAL_STEPS);

    await ctx.waitForBroadcastType();
    await sleep(300);
    hidePrompt();
    await sleep(400);

    // ── Step 4: Clear broadcast ──
    showPrompt('Broadcast Mode', 'Clear the selection',
      'Press <kbd>Esc</kbd> to clear the broadcast selection.',
      4, TOTAL_STEPS);

    await ctx.waitForEscClear();
    hidePrompt();
    await sleep(400);

    // ── Step 5: Shift+Drag to select ALL panes ──
    showPrompt('Broadcast Mode', 'Select all panes',
      '<span class="hl">Shift+Drag</span> on the empty canvas to draw a selection rectangle around all three panes.',
      5, TOTAL_STEPS);

    await ctx.waitForDragSelect(3);
    hidePrompt();
    await sleep(400);

    // ── Step 6: Drag the broadcast group ──
    showPrompt('Broadcast Mode', 'Move the group',
      'Drag any pane header to move <span class="hl">all selected panes</span> together.',
      6, TOTAL_STEPS);

    await ctx.waitForBroadcastDrag(30);
    hidePrompt();
    await sleep(400);

    // ══════════════════════════════════════════
    // CHAPTER 3: MOVE MODE
    // ══════════════════════════════════════════

    // ── Step 7: Enter move mode (broadcast drops) ──
    showPrompt('Move Mode', 'Enter move mode',
      'Double-tap <kbd>Tab</kbd> to enter <span class="hl">Move Mode</span>. Note: entering move mode will drop the broadcast selection.',
      7, TOTAL_STEPS);

    await ctx.waitForMoveMode();
    hidePrompt();
    await sleep(400);

    // ── Step 8: WASD navigate ──
    showPrompt('Move Mode', 'Navigate with WASD',
      'Use <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> or arrow keys to move the highlight between panes.',
      8, TOTAL_STEPS);

    await ctx.waitForWASDNav(2); // navigate at least 2 times
    hidePrompt();
    await sleep(400);

    // ── Step 9: Enter to focus ──
    showPrompt('Move Mode', 'Focus a pane',
      'Press <kbd>Enter</kbd> to focus the highlighted pane and exit move mode.',
      9, TOTAL_STEPS);

    await ctx.waitForEnterSelect();
    hidePrompt();
    await sleep(400);

    // ── Step 10: Tab+W to close ──
    showPrompt('Move Mode', 'Close a pane',
      'Hold <kbd>Tab</kbd> and press <kbd>W</kbd> to close the currently focused pane.',
      10, TOTAL_STEPS);

    await ctx.waitForTabW();
    hidePrompt();
    await sleep(400);

    // ── Step 11: Tab+H to hide HUD ──
    showPrompt('Keyboard Shortcuts', 'Hide the HUD',
      'Hold <kbd>Tab</kbd> and press <kbd>H</kbd> to toggle the HUD panel visibility.',
      11, TOTAL_STEPS);

    await ctx.waitForTabH();
    hidePrompt();
    await sleep(400);

    // ── Step 12: Completion ──
    // Save completion
    try { localStorage.setItem('tc_tutorial_panes', 'completed'); } catch (e) {}

    // Fire-and-forget server persistence
    try {
      const resp = await fetch('/api/preferences', { credentials: 'include' });
      if (resp.ok) {
        const prefs = await resp.json();
        const tc = prefs.tutorialsCompleted || {};
        tc['panes'] = true;
        prefs.tutorialsCompleted = tc;
        fetch('/api/preferences', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(prefs),
        }).catch(() => {});
      }
    } catch (e) { /* not logged in -- skip server sync */ }

    tutComplete.classList.add('visible');
  };
})();
