import { app, BrowserWindow, Tray, Menu, nativeImage, dialog, shell, ipcMain } from 'electron';
import { spawn } from 'child_process';
import { createServer } from 'net';
import { request } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { execSync, execFileSync } from 'child_process';
import { appendFileSync, mkdirSync, cpSync, existsSync, readFileSync } from 'fs';
import updaterPkg from 'electron-updater';
const { autoUpdater } = updaterPkg;

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Auto-updater ──────────────────────────────────────────────────────────────

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;

autoUpdater.on('update-available', (info) => {
  log('Update available:', info.version);
  dialog.showMessageBox({
    type: 'info',
    title: 'Update Available',
    message: `Version ${info.version} is available.`,
    detail: 'Download and install now? The app will restart.',
    buttons: ['Install Update', 'Later'],
    defaultId: 0,
  }).then(({ response }) => {
    if (response === 0) autoUpdater.downloadUpdate();
  });
});

autoUpdater.on('update-not-available', () => {
  log('No update available');
  if (_checkUpdateManual) {
    _checkUpdateManual = false;
    dialog.showMessageBox({ type: 'info', title: 'Up to Date', message: 'You are on the latest version.' });
  }
});

autoUpdater.on('update-downloaded', () => {
  log('Update downloaded');
  dialog.showMessageBox({
    type: 'info',
    title: 'Ready to Install',
    message: 'Update downloaded.',
    detail: 'The app will restart to apply the update.',
    buttons: ['Restart Now'],
  }).then(() => {
    killAll();
    autoUpdater.quitAndInstall();
  });
});

autoUpdater.on('error', (err) => {
  log('Updater error:', err.message);
  if (_checkUpdateManual) {
    _checkUpdateManual = false;
    dialog.showMessageBox({ type: 'error', title: 'Update Check Failed', message: err.message });
  }
});

let _checkUpdateManual = false;

function checkForUpdates(manual = false) {
  if (!app.isPackaged) return;
  _checkUpdateManual = manual;
  autoUpdater.checkForUpdates().catch((err) => log('checkForUpdates error:', err.message));
}

const isDev = !app.isPackaged;
const repoRoot = isDev ? join(__dirname, '..', '..') : process.resourcesPath;
let cloudDir = join(repoRoot, 'cloud');
let agentDir = join(repoRoot, 'agent');

// Augment PATH so child processes can find Homebrew binaries (tmux, ttyd, node).
const EXTRA_PATHS = ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin'];
process.env.PATH = [...new Set([...EXTRA_PATHS, ...(process.env.PATH || '').split(':')])].join(':');

// Find the node binary that matches the ABI of the cloud's native modules.
// Reads the node path written by scripts/prestart.js so spawn uses the exact
// same node that ran `npm install`, preventing better-sqlite3 ABI mismatches.
function findNode() {
  try {
    const recorded = readFileSync('/tmp/49agents-node-path.txt', 'utf8').trim();
    if (recorded) { execFileSync(recorded, ['--version'], { stdio: 'ignore' }); return recorded; }
  } catch { /* fall through */ }

  const candidates = [
    '/opt/homebrew/bin/node',
    '/usr/local/bin/node',
    '/usr/bin/node',
  ];
  for (const c of candidates) {
    try { execFileSync(c, ['--version'], { stdio: 'ignore' }); return c; }
    catch { /* try next */ }
  }
  throw new Error('Could not find Node.js. Please install it from https://nodejs.org');
}

// Log to userData/app.log for debugging packaged builds.
let logFile = null;
function log(...args) {
  const line = `[${new Date().toISOString()}] ${args.join(' ')}\n`;
  console.log(...args);
  if (logFile) { try { appendFileSync(logFile, line); } catch {} }
}

// In a packaged .app, resources are read-only and node_modules are stripped.
// Copy cloud+agent to userData on first launch, npm install, then build tarball.
function prepareServices(userData) {
  const nodeBin = findNode();
  const npmBin = join(dirname(nodeBin), 'npm');
  const destCloud = join(userData, 'cloud');
  const destAgent = join(userData, 'agent');

  for (const [name, dest] of [['cloud', destCloud], ['agent', destAgent]]) {
    const src = join(repoRoot, name);
    const nm = join(dest, 'node_modules');

    if (!existsSync(nm)) {
      log(`copying ${name} to userData...`);
      mkdirSync(dest, { recursive: true });
      cpSync(src, dest, { recursive: true, force: true });
      log(`npm install in ${dest}...`);
      execFileSync(npmBin, ['install', '--omit=dev', '--silent'], {
        cwd: dest,
        timeout: 120000,
      });
      log(`${name} ready`);
    } else {
      log(`${name} already prepared`);
    }
  }

  // Always rebuild better-sqlite3 against the node that will actually run the
  // server — the pre-built binary in the bundle may have a different ABI.
  log('rebuilding better-sqlite3 for current node ABI...');
  try {
    execFileSync(npmBin, ['rebuild', 'better-sqlite3', '--silent'], {
      cwd: destCloud,
      timeout: 60000,
    });
    log('better-sqlite3 ready');
  } catch (err) {
    log('better-sqlite3 rebuild failed:', err.message);
  }

  // Build the agent tarball so the cloud's /dl/49-agent.tar.gz route works.
  const tarball = join(destCloud, 'dl', '49-agent.tar.gz');
  if (!existsSync(tarball)) {
    log('building agent tarball...');
    mkdirSync(join(destCloud, 'dl'), { recursive: true });
    execFileSync('tar', ['czf', tarball, 'agent'], { cwd: userData, timeout: 30000 });
    log('agent tarball built');
  }

  return { cloudDir: destCloud, agentDir: destAgent };
}

let tray = null;
let dashboardWindow = null;
let mainWindow = null;
let cloudProcess = null;
let agentProcess = null;
let appPort = null;

// ── State ─────────────────────────────────────────────────────────────────────

const state = {
  cloud: 'stopped',  // 'stopped' | 'starting' | 'running' | 'error'
  agent: 'stopped',
  port: null,
  cloudLogs: [],
  agentLogs: [],
};

function pushLog(service, text) {
  const lines = text.trimEnd().split('\n');
  for (const line of lines) {
    if (!line.trim()) continue;
    const entry = { t: Date.now(), line };
    state[`${service}Logs`].push(entry);
    if (state[`${service}Logs`].length > 500) state[`${service}Logs`].shift();
    dashboardWindow?.webContents.send('log', { service, ...entry });
  }
}

function setState(patch) {
  Object.assign(state, patch);
  dashboardWindow?.webContents.send('state', getPublicState());
  updateTray();
}

function getPublicState() {
  return { cloud: state.cloud, agent: state.agent, port: state.port };
}

// ── Dependency check ──────────────────────────────────────────────────────────

function checkDependencies() {
  // Packaged apps don't inherit the user's shell PATH, so `which` may fail
  // even when binaries exist. Check known Homebrew locations explicitly.
  const searchPaths = [
    '/opt/homebrew/bin',  // Apple Silicon
    '/usr/local/bin',     // Intel
    '/usr/bin',
  ];
  const missing = [];
  for (const bin of ['tmux', 'ttyd']) {
    const found = searchPaths.some(dir => {
      try { execSync(`test -x "${dir}/${bin}"`, { stdio: 'ignore' }); return true; }
      catch { return false; }
    });
    if (!found) missing.push(bin);
  }
  return missing;
}

// ── Port finder ───────────────────────────────────────────────────────────────

function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}

// ── HTTP poll ─────────────────────────────────────────────────────────────────

function waitForServer(port, timeout = 20000) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeout;
    const probe = () => {
      const req = request({ host: '127.0.0.1', port, path: '/', method: 'GET' }, () => resolve());
      req.on('error', () => {
        if (Date.now() >= deadline) reject(new Error(`Server did not respond within ${timeout}ms`));
        else setTimeout(probe, 300);
      });
      req.end();
    };
    probe();
  });
}

// ── Process management ────────────────────────────────────────────────────────

async function startCloud(port) {
  if (cloudProcess) return;
  setState({ cloud: 'starting' });

  const userData = app.getPath('userData');
  const nodeBin = findNode();
  log('Using node:', nodeBin);
  log('cloudDir:', cloudDir);

  const env = {
    ...process.env,
    PORT: String(port),
    NODE_ENV: 'development',
    DATABASE_PATH: join(userData, 'tc.db'),
    SKIP_CLOUD_AUTH: '1',
  };

  cloudProcess = spawn(nodeBin, ['src/index.js'], {
    cwd: cloudDir,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  cloudProcess.stdout.on('data', (d) => { log('[cloud]', d.toString().trimEnd()); pushLog('cloud', d.toString()); });
  cloudProcess.stderr.on('data', (d) => { log('[cloud:err]', d.toString().trimEnd()); pushLog('cloud', d.toString()); });
  cloudProcess.on('error', (err) => {
    log('[cloud] spawn error:', err.message);
    pushLog('cloud', `[error] ${err.message}`);
    setState({ cloud: 'error' });
    cloudProcess = null;
  });
  cloudProcess.on('exit', (code) => {
    log('[cloud] exited with code', code);
    pushLog('cloud', `[exited with code ${code}]`);
    setState({ cloud: 'stopped' });
    cloudProcess = null;
  });

  try {
    await waitForServer(port);
    setState({ cloud: 'running', port });
  } catch (err) {
    setState({ cloud: 'error' });
    throw err;
  }
}

function startAgent(port) {
  if (agentProcess) return;
  setState({ agent: 'starting' });

  const nodeBin = findNode();
  const env = { ...process.env, TC_CLOUD_URL: `ws://127.0.0.1:${port}` };
  agentProcess = spawn(nodeBin, ['bin/49-agent.js', 'start'], {
    cwd: agentDir,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  agentProcess.stdout.on('data', (d) => pushLog('agent', d.toString()));
  agentProcess.stderr.on('data', (d) => pushLog('agent', d.toString()));
  agentProcess.on('error', (err) => {
    pushLog('agent', `[error] ${err.message}`);
    setState({ agent: 'error' });
    agentProcess = null;
  });
  agentProcess.on('exit', (code) => {
    pushLog('agent', `[exited with code ${code}]`);
    setState({ agent: 'stopped' });
    agentProcess = null;
  });

  setState({ agent: 'running' });
}

function stopCloud() {
  if (cloudProcess) { cloudProcess.kill(); cloudProcess = null; }
  setState({ cloud: 'stopped' });
}

function stopAgent() {
  if (agentProcess) { agentProcess.kill(); agentProcess = null; }
  setState({ agent: 'stopped' });
}

async function restartAll() {
  stopAgent();
  stopCloud();
  await new Promise(r => setTimeout(r, 600));
  await startCloud(appPort);
  startAgent(appPort);
}

function killAll() {
  if (cloudProcess) { cloudProcess.kill(); cloudProcess = null; }
  if (agentProcess) { agentProcess.kill(); agentProcess = null; }
}

// ── Tray ──────────────────────────────────────────────────────────────────────

function makeTrayIcon() {
  // PNG template image — filename contains "Template" so macOS auto-inverts
  // for light/dark menu bar. @2x version is used automatically on retina.
  const img = nativeImage.createFromPath(join(__dirname, '..', 'assets', 'trayTemplate.png'));
  img.setTemplateImage(true);
  return img;
}

function overallStatus() {
  if (state.cloud === 'running' && state.agent === 'running') return 'running';
  if (state.cloud === 'error' || state.agent === 'error') return 'error';
  if (state.cloud === 'starting' || state.agent === 'starting') return 'starting';
  return 'stopped';
}

function updateTray() {
  if (!tray) return;
  tray.setImage(makeTrayIcon());

  const isRunning = state.cloud === 'running';
  const isBusy = state.cloud === 'starting' || state.agent === 'starting';

  const menu = Menu.buildFromTemplate([
    { label: '49Agents', enabled: false },
    { label: `Cloud: ${state.cloud}  ·  Agent: ${state.agent}`, enabled: false },
    { type: 'separator' },
    { label: 'Open 49Agents', click: openMainWindow, enabled: isRunning },
    { label: 'Dashboard', click: openDashboard },
    { type: 'separator' },
    { label: 'Restart', click: () => restartAll(), enabled: !isBusy },
    { label: isRunning ? 'Stop' : 'Start', click: () => isRunning ? (stopAgent(), stopCloud()) : (startCloud(appPort).then(() => startAgent(appPort))), enabled: !isBusy },
    { type: 'separator' },
    { label: 'Check for Updates', click: () => checkForUpdates(true) },
    { label: 'Quit', click: () => app.quit() },
  ]);
  tray.setContextMenu(menu);
}

function createTray() {
  tray = new Tray(makeTrayIcon());
  tray.setToolTip('49Agents');
  tray.on('click', openDashboard);
  updateTray();
}

// ── Dashboard window ──────────────────────────────────────────────────────────

function openDashboard() {
  if (dashboardWindow) { dashboardWindow.focus(); return; }

  dashboardWindow = new BrowserWindow({
    width: 500,
    height: 620,
    resizable: false,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#050D18',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: join(__dirname, 'preload.js'),
    },
  });

  dashboardWindow.loadFile(join(__dirname, 'dashboard.html'));
  dashboardWindow.on('closed', () => { dashboardWindow = null; });

  dashboardWindow.webContents.on('did-finish-load', () => {
    dashboardWindow?.webContents.send('state', getPublicState());
    for (const entry of state.cloudLogs.slice(-100))
      dashboardWindow?.webContents.send('log', { service: 'cloud', ...entry });
    for (const entry of state.agentLogs.slice(-100))
      dashboardWindow?.webContents.send('log', { service: 'agent', ...entry });
  });
}

// ── Main canvas window ────────────────────────────────────────────────────────

function openMainWindow() {
  if (mainWindow) { mainWindow.focus(); return; }

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: '49Agents',
    webPreferences: { nodeIntegration: false, contextIsolation: true, webSecurity: false },
  });

  mainWindow.loadURL(`http://127.0.0.1:${appPort}`);
  if (isDev) mainWindow.webContents.openDevTools();

  mainWindow.webContents.on('did-fail-load', (_e, code) => {
    if (code !== -3) setTimeout(() => mainWindow?.loadURL(`http://127.0.0.1:${appPort}`), 500);
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ── IPC ───────────────────────────────────────────────────────────────────────

ipcMain.handle('get-state', () => getPublicState());
ipcMain.handle('get-logs', (_, service) =>
  (service === 'cloud' ? state.cloudLogs : state.agentLogs).slice(-100)
);
ipcMain.handle('action', async (_, action) => {
  switch (action) {
    case 'open':    openMainWindow(); break;
    case 'restart': await restartAll(); break;
    case 'stop':    stopAgent(); stopCloud(); break;
    case 'start':   await startCloud(appPort); startAgent(appPort); break;
  }
});

// ── App lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  app.dock?.hide();
  const userData = app.getPath('userData');
  mkdirSync(userData, { recursive: true });
  logFile = join(userData, 'app.log');
  log('App starting, userData:', userData);
  log('PATH:', process.env.PATH);

  const missing = checkDependencies();
  if (missing.length > 0) {
    await dialog.showMessageBox({
      type: 'error',
      title: 'Missing dependencies',
      message: `49Agents requires ${missing.join(' and ')} to be installed.`,
      detail: `Install with Homebrew:\n\n  brew install ${missing.join(' ')}\n\nThen relaunch the app.`,
      buttons: ['Quit'],
    });
    app.quit();
    return;
  }

  createTray();

  try {
    if (app.isPackaged) {
      // Resources dir is read-only; copy cloud+agent to writable userData and
      // npm install there on first launch.
      log('preparing services in userData...');
      const prepared = prepareServices(userData);
      cloudDir = prepared.cloudDir;
      agentDir = prepared.agentDir;
      log('cloudDir:', cloudDir, 'agentDir:', agentDir);
    }

    appPort = await findFreePort();
    await startCloud(appPort);
    startAgent(appPort);
    openMainWindow();
    setTimeout(() => checkForUpdates(false), 10000);
  } catch (err) {
    await dialog.showMessageBox({
      type: 'error',
      title: 'Failed to start',
      message: 'Could not start the 49Agents server.',
      detail: err.message,
      buttons: ['Quit'],
    });
    app.quit();
  }
});

app.on('window-all-closed', () => {
  // Keep running — user can reopen via dock or tray.
});

app.on('activate', () => {
  // Dock icon clicked — bring up main window if server is running.
  if (appPort) openMainWindow();
});

app.on('will-quit', killAll);
