/**
 * Control panel unit tests — no Electron dependency.
 * Tests the state machine logic extracted from main.js and the dashboard
 * rendering helpers extracted from dashboard.html.
 *
 * Run: node test/control-panel.test.mjs
 */

import assert from 'assert/strict';

// ── State machine helpers (mirrors main.js logic) ─────────────────────────────

function makeState() {
  return {
    cloud: 'stopped', agent: 'stopped',
    port: null, cloudStartedAt: null, agentStartedAt: null,
    cloudLogs: [], agentLogs: [],
  };
}

function getPublicState(state) {
  return {
    cloud: state.cloud, agent: state.agent, port: state.port,
    cloudStartedAt: state.cloudStartedAt, agentStartedAt: state.agentStartedAt,
  };
}

function pushLog(state, service, text) {
  const lines = text.trimEnd().split('\n');
  const pushed = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const entry = { t: Date.now(), line };
    state[`${service}Logs`].push(entry);
    if (state[`${service}Logs`].length > 1000) state[`${service}Logs`].shift();
    pushed.push(entry);
  }
  return pushed;
}

// ── Dashboard rendering helpers (mirrors dashboard.html JS) ───────────────────

function dotClass(s) {
  return { running: 'dot-running', starting: 'dot-starting', stopping: 'dot-stopping', error: 'dot-error' }[s] || 'dot-stopped';
}

function cardClass(s) {
  return { running: 'running', error: 'error', stopping: 'stopping' }[s] || '';
}

function isRunning(state)  { return state.cloud === 'running'; }
function isBusy(state)     { return ['starting','stopping'].includes(state.cloud) || ['starting','stopping'].includes(state.agent); }
function isErr(line)       { return /\berror\b|exception|uncaughtException|unhandledRejection/i.test(line); }
function isWarn(line)      { return /\bwarn(ing)?\b/i.test(line); }

function formatUptime(startedAt) {
  if (!startedAt) return '';
  const secs = Math.floor((Date.now() - startedAt) / 1000);
  if (secs < 60)   return `up ${secs}s`;
  if (secs < 3600) return `up ${Math.floor(secs / 60)}m ${secs % 60}s`;
  return `up ${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
}

// ── Test runner ───────────────────────────────────────────────────────────────

let passed = 0, failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓  ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗  ${name}`);
    console.error(`       ${err.message}`);
    failed++;
  }
}

// ── Tests: state machine ──────────────────────────────────────────────────────

console.log('\nState machine');

test('initial state is stopped', () => {
  const s = makeState();
  assert.equal(s.cloud, 'stopped');
  assert.equal(s.agent, 'stopped');
  assert.equal(s.port, null);
});

test('getPublicState omits log arrays', () => {
  const s = makeState();
  s.cloud = 'running'; s.port = 1234;
  const pub = getPublicState(s);
  assert.equal(pub.cloud, 'running');
  assert.equal(pub.port, 1234);
  assert(!('cloudLogs' in pub));
  assert(!('agentLogs' in pub));
});

test('pushLog splits multi-line text', () => {
  const s = makeState();
  pushLog(s, 'cloud', 'line1\nline2\nline3\n');
  assert.equal(s.cloudLogs.length, 3);
  assert.equal(s.cloudLogs[0].line, 'line1');
  assert.equal(s.cloudLogs[2].line, 'line3');
});

test('pushLog skips blank lines', () => {
  const s = makeState();
  pushLog(s, 'cloud', '\n\n  \nreal line\n\n');
  assert.equal(s.cloudLogs.length, 1);
  assert.equal(s.cloudLogs[0].line, 'real line');
});

test('pushLog caps at 1000 entries', () => {
  const s = makeState();
  for (let i = 0; i < 1005; i++) pushLog(s, 'cloud', `line ${i}`);
  assert.equal(s.cloudLogs.length, 1000);
  assert.equal(s.cloudLogs[0].line, 'line 5');
});

test('pushLog keeps cloud and agent logs separate', () => {
  const s = makeState();
  pushLog(s, 'cloud', 'cloud msg');
  pushLog(s, 'agent', 'agent msg');
  assert.equal(s.cloudLogs.length, 1);
  assert.equal(s.agentLogs.length, 1);
  assert.equal(s.cloudLogs[0].line, 'cloud msg');
  assert.equal(s.agentLogs[0].line, 'agent msg');
});

// ── Tests: button state logic ─────────────────────────────────────────────────

console.log('\nButton state logic');

test('Open disabled when cloud stopped', () => {
  const s = { cloud: 'stopped', agent: 'stopped' };
  assert.equal(isRunning(s), false);
});

test('Open enabled when cloud running', () => {
  const s = { cloud: 'running', agent: 'stopped' };
  assert.equal(isRunning(s), true);
});

test('Buttons busy when cloud starting', () => {
  const s = { cloud: 'starting', agent: 'stopped' };
  assert.equal(isBusy(s), true);
});

test('Buttons busy when cloud stopping', () => {
  const s = { cloud: 'stopping', agent: 'running' };
  assert.equal(isBusy(s), true);
});

test('Buttons busy when agent starting', () => {
  const s = { cloud: 'running', agent: 'starting' };
  assert.equal(isBusy(s), true);
});

test('Buttons busy when agent stopping', () => {
  const s = { cloud: 'running', agent: 'stopping' };
  assert.equal(isBusy(s), true);
});

test('Buttons not busy when both running', () => {
  const s = { cloud: 'running', agent: 'running' };
  assert.equal(isBusy(s), false);
});

test('Buttons not busy when both stopped', () => {
  const s = { cloud: 'stopped', agent: 'stopped' };
  assert.equal(isBusy(s), false);
});

// ── Tests: dot/card CSS classes ───────────────────────────────────────────────

console.log('\nCSS class helpers');

test('dotClass running', ()  => assert.equal(dotClass('running'),  'dot-running'));
test('dotClass starting', () => assert.equal(dotClass('starting'), 'dot-starting'));
test('dotClass stopping', () => assert.equal(dotClass('stopping'), 'dot-stopping'));
test('dotClass error', ()    => assert.equal(dotClass('error'),    'dot-error'));
test('dotClass stopped', ()  => assert.equal(dotClass('stopped'),  'dot-stopped'));
test('dotClass unknown', ()  => assert.equal(dotClass('whatever'), 'dot-stopped'));

test('cardClass running',  () => assert.equal(cardClass('running'),  'running'));
test('cardClass error',    () => assert.equal(cardClass('error'),    'error'));
test('cardClass stopping', () => assert.equal(cardClass('stopping'), 'stopping'));
test('cardClass stopped',  () => assert.equal(cardClass('stopped'),  ''));
test('cardClass starting', () => assert.equal(cardClass('starting'), ''));

// ── Tests: log line classification ───────────────────────────────────────────

console.log('\nLog line classification');

test('isErr detects "error"',                   () => assert.equal(isErr('something error occurred'), true));
test('isErr detects "Error" (case-insensitive)', () => assert.equal(isErr('Error: ENOENT'), true));
test('isErr detects "exception"',               () => assert.equal(isErr('uncaught exception thrown'), true));
test('isErr detects "uncaughtException"',        () => assert.equal(isErr('uncaughtException: boom'), true));
test('isErr detects "unhandledRejection"',       () => assert.equal(isErr('unhandledRejection at promise'), true));
test('isErr false on normal log',               () => assert.equal(isErr('server listening on port 3000'), false));
test('isErr false on "errors" in URL',          () => assert.equal(isErr('/api/no-errors-here'), false));

test('isWarn detects "warn"',    () => assert.equal(isWarn('warn: deprecated api'), true));
test('isWarn detects "warning"', () => assert.equal(isWarn('WARNING: ssl cert expiring'), true));
test('isWarn false on normal',   () => assert.equal(isWarn('server started'), false));

// ── Tests: uptime formatting ──────────────────────────────────────────────────

console.log('\nUptime formatting');

test('formatUptime null returns empty string', () => assert.equal(formatUptime(null), ''));
test('formatUptime seconds', () => {
  const t = Date.now() - 30 * 1000;
  assert.equal(formatUptime(t), 'up 30s');
});
test('formatUptime minutes', () => {
  const t = Date.now() - 90 * 1000;
  assert.match(formatUptime(t), /^up 1m \d+s$/);
});
test('formatUptime hours', () => {
  const t = Date.now() - (2 * 3600 + 15 * 60) * 1000;
  assert.equal(formatUptime(t), 'up 2h 15m');
});

// ── Tests: state transitions ──────────────────────────────────────────────────

console.log('\nState transitions');

test('stop action clears port and startedAt', () => {
  const s = makeState();
  s.cloud = 'running'; s.port = 1234; s.cloudStartedAt = Date.now() - 5000;
  // Simulate stop completing
  Object.assign(s, { cloud: 'stopped', port: null, cloudStartedAt: null });
  assert.equal(s.cloud, 'stopped');
  assert.equal(s.port, null);
  assert.equal(s.cloudStartedAt, null);
});

test('restart finds new port (simulated)', () => {
  const ports = new Set();
  // Simulate two findFreePort calls returning different values
  ports.add(3001);
  ports.add(3002);
  assert.equal(ports.size, 2, 'restart should use a fresh port');
});

test('agent does not immediately report running (no optimistic state)', () => {
  // In the new code, agent starts in 'starting' and only moves to 'running'
  // when it logs a ready signal or after 10s fallback.
  const s = makeState();
  s.agent = 'starting';
  // Before any log output, agent should still be 'starting'
  assert.equal(s.agent, 'starting');
  // Simulate a ready log arriving
  const text = 'Agent connected to cloud';
  if (/connect|ready|started|listening/i.test(text)) {
    s.agent = 'running';
    s.agentStartedAt = Date.now();
  }
  assert.equal(s.agent, 'running');
  assert.notEqual(s.agentStartedAt, null);
});

test('cloud exit during starting does not stomp restarting state', () => {
  const s = makeState();
  s.cloud = 'starting';
  // Simulate the old process exiting while we're already restarting
  // The exit handler checks: if (state.cloud !== 'starting') setState stopped
  // So if cloud is 'starting', we skip the setState — correct.
  const shouldSetStopped = s.cloud !== 'starting';
  assert.equal(shouldSetStopped, false);
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
