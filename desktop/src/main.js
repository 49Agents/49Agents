import { app, BrowserWindow, Tray, Menu, nativeImage, dialog, shell, ipcMain } from 'electron';
import { spawn } from 'child_process';
import { createServer } from 'net';
import { request } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { execSync, execFileSync } from 'child_process';
import { appendFileSync, mkdirSync, cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'fs';
import updaterPkg from 'electron-updater';
const { autoUpdater } = updaterPkg;

const __dirname = dirname(fileURLToPath(import.meta.url));

// Disable all GPU / WebGPU acceleration. Without these switches Electron still
// spawns a GPU helper process (49 Agents Helper (GPU)) even when hardware
// acceleration is off, because Dawn/WebGPU initialises independently.
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-compositing');
app.commandLine.appendSwitch('disable-software-rasterizer');
app.commandLine.appendSwitch('disable-webgl');
app.commandLine.appendSwitch('disable-webgl2');
// Disable ScreenCaptureKit features — these run in the GPU process and cause
// sustained CPU usage even when GL is disabled, because Chromium still
// initialises the capture pipeline on macOS by default in Electron 36.
app.commandLine.appendSwitch('disable-features', 'ScreenCaptureKitPickerScreen,ScreenCaptureKitStreamPickerSonoma,MacWebContentsOcclusion,SpareRendererForSitePerProcess,TimeoutHangingVideoCaptureStarts');

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

function prepareServices(userData) {
  const nodeBin = findNode();
  const npmBin = join(dirname(nodeBin), 'npm');
  const destCloud = join(userData, 'cloud');
  const destAgent = join(userData, 'agent');

  const appVersion = app.getVersion();

  for (const [name, dest] of [['cloud', destCloud], ['agent', destAgent]]) {
    const src = join(repoRoot, name);
    const nm = join(dest, 'node_modules');
    const versionStamp = join(dest, '.app-version');
    const installedVersion = existsSync(versionStamp) ? readFileSync(versionStamp, 'utf8').trim() : '';
    const needsInstall = !existsSync(nm);
    const needsUpdate = installedVersion !== appVersion;

    if (needsInstall || needsUpdate) {
      log(`${needsInstall ? 'installing' : 'updating'} ${name} (${installedVersion || 'none'} -> ${appVersion})...`);
      mkdirSync(dest, { recursive: true });
      // Re-copy everything except node_modules so source files (incl. public/*.min.js) stay current.
      cpSync(src, dest, {
        recursive: true,
        force: true,
        filter: (s) => !s.includes(`${name}/node_modules`),
      });
      if (needsInstall) {
        log(`npm install in ${dest}...`);
        execFileSync(npmBin, ['install', '--omit=dev', '--silent'], {
          cwd: dest,
          timeout: 120000,
        });
      } else {
        // Force better-sqlite3 rebuild on next step by clearing the ABI stamp.
        const abiStampPath = join(dest, '.node-abi');
        if (existsSync(abiStampPath)) rmSync(abiStampPath);
      }
      writeFileSync(versionStamp, appVersion);
      log(`${name} ready`);
    } else {
      log(`${name} up to date (${appVersion})`);
    }
  }

  // Rebuild better-sqlite3 only when the node ABI version changes.
  // Stamp file records the ABI we last compiled against so we don't rebuild
  // on every launch, but always rebuild after a node upgrade.
  const nodeAbi = process.versions.modules;
  const abiStamp = join(destCloud, '.node-abi');
  const lastAbi = existsSync(abiStamp) ? readFileSync(abiStamp, 'utf8').trim() : '';

  if (lastAbi !== nodeAbi) {
    log(`rebuilding better-sqlite3 (node ABI ${lastAbi || 'unknown'} -> ${nodeAbi})...`);
    try {
      // Delete existing binary so node-gyp always recompiles from source.
      const nativeBin = join(destCloud, 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node');
      if (existsSync(nativeBin)) rmSync(nativeBin);

      const nodeDir = dirname(dirname(nodeBin)); // e.g. /Users/foo/.nvm/versions/node/v22.x.x
      execFileSync(npmBin, ['rebuild', 'better-sqlite3'], {
        cwd: destCloud,
        timeout: 120000,
        env: { ...process.env, npm_config_nodedir: nodeDir },
      });
      writeFileSync(abiStamp, nodeAbi);
      log('better-sqlite3 ready');
    } catch (err) {
      log('better-sqlite3 rebuild failed:', err.message);
    }
  } else {
    log(`better-sqlite3 already built for ABI ${nodeAbi}`);
  }

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
  cloud: 'stopped',  // 'stopped' | 'starting' | 'running' | 'stopping' | 'error'
  agent: 'stopped',  // 'stopped' | 'starting' | 'running' | 'stopping' | 'error'
  port: null,
  cloudStartedAt: null,
  agentStartedAt: null,
  cloudLogs: [],
  agentLogs: [],
};

function pushLog(service, text) {
  const lines = text.trimEnd().split('\n');
  for (const line of lines) {
    if (!line.trim()) continue;
    const entry = { t: Date.now(), line };
    state[`${service}Logs`].push(entry);
    if (state[`${service}Logs`].length > 1000) state[`${service}Logs`].shift();
    dashboardWindow?.webContents.send('log', { service, ...entry });
  }
}

function setState(patch) {
  Object.assign(state, patch);
  dashboardWindow?.webContents.send('state', getPublicState());
  updateTray();
}

function getPublicState() {
  return {
    cloud: state.cloud,
    agent: state.agent,
    port: state.port,
    cloudStartedAt: state.cloudStartedAt,
    agentStartedAt: state.agentStartedAt,
  };
}

// ── Dependency check ──────────────────────────────────────────────────────────

function checkDependencies() {
  const searchPaths = ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin'];
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

function waitForServer(port, timeout = 30000) {
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

// Wait for a process to exit gracefully, SIGKILL as fallback.
function waitForExit(proc, timeoutMs = 5000) {
  return new Promise((resolve) => {
    if (!proc) { resolve(); return; }
    const timer = setTimeout(() => {
      try { proc.kill('SIGKILL'); } catch {}
      resolve();
    }, timeoutMs);
    proc.once('exit', () => { clearTimeout(timer); resolve(); });
  });
}

// ── Process management ────────────────────────────────────────────────────────

async function startCloud(port) {
  if (cloudProcess) return;
  setState({ cloud: 'starting', cloudStartedAt: null });

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
    setState({ cloud: 'error', cloudStartedAt: null });
    cloudProcess = null;
  });
  cloudProcess.on('exit', (code) => {
    log('[cloud] exited with code', code);
    if (code !== null && code !== 0) pushLog('cloud', `[exited with code ${code}]`);
    // Don't overwrite a 'starting' state set by restartAll
    if (state.cloud !== 'starting') setState({ cloud: 'stopped', port: null, cloudStartedAt: null });
    cloudProcess = null;
  });

  try {
    await waitForServer(port);
    setState({ cloud: 'running', port, cloudStartedAt: Date.now() });
  } catch (err) {
    setState({ cloud: 'error', cloudStartedAt: null });
    throw err;
  }
}

function startAgent(port) {
  if (agentProcess) return;
  setState({ agent: 'starting', agentStartedAt: null });

  const nodeBin = findNode();
  const env = { ...process.env, TC_CLOUD_URL: `ws://127.0.0.1:${port}` };
  agentProcess = spawn(nodeBin, ['bin/49-agent.js', 'start'], {
    cwd: agentDir,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  agentProcess.stdout.on('data', (d) => {
    const text = d.toString();
    pushLog('agent', text);
    // Mark running once the agent logs a successful connection
    if (state.agent === 'starting' && /connect|ready|started|listening/i.test(text)) {
      setState({ agent: 'running', agentStartedAt: Date.now() });
    }
  });
  agentProcess.stderr.on('data', (d) => pushLog('agent', d.toString()));
  agentProcess.on('error', (err) => {
    pushLog('agent', `[error] ${err.message}`);
    setState({ agent: 'error', agentStartedAt: null });
    agentProcess = null;
  });
  agentProcess.on('exit', (code) => {
    if (code !== null && code !== 0) pushLog('agent', `[exited with code ${code}]`);
    if (state.agent !== 'starting') setState({ agent: 'stopped', agentStartedAt: null });
    agentProcess = null;
  });

  // Fallback: if agent doesn't self-report ready within 10s, mark running anyway
  setTimeout(() => {
    if (state.agent === 'starting' && agentProcess) {
      setState({ agent: 'running', agentStartedAt: Date.now() });
    }
  }, 10000);
}

async function stopCloud() {
  if (!cloudProcess) { setState({ cloud: 'stopped', port: null, cloudStartedAt: null }); return; }
  setState({ cloud: 'stopping' });
  const proc = cloudProcess;
  cloudProcess = null;
  proc.kill('SIGTERM');
  await waitForExit(proc);
  setState({ cloud: 'stopped', port: null, cloudStartedAt: null });
}

async function stopAgent() {
  if (!agentProcess) { setState({ agent: 'stopped', agentStartedAt: null }); return; }
  setState({ agent: 'stopping' });
  const proc = agentProcess;
  agentProcess = null;
  proc.kill('SIGTERM');
  await waitForExit(proc);
  setState({ agent: 'stopped', agentStartedAt: null });
}

async function restartAll() {
  await stopAgent();
  await stopCloud();
  // Find a fresh port — old one may still be in TIME_WAIT after SIGTERM
  appPort = await findFreePort();
  await startCloud(appPort);
  startAgent(appPort);
  // Reload main window to new port
  if (mainWindow) mainWindow.loadURL(`http://127.0.0.1:${appPort}`);
}

function killAll() {
  if (cloudProcess) { cloudProcess.kill(); cloudProcess = null; }
  if (agentProcess) { agentProcess.kill(); agentProcess = null; }
}

// ── Tray ──────────────────────────────────────────────────────────────────────

function makeTrayIcon() {
  const img = nativeImage.createFromPath(join(__dirname, '..', 'assets', 'trayTemplate.png'));
  img.setTemplateImage(true);
  return img;
}

function updateTray() {
  if (!tray) return;
  tray.setImage(makeTrayIcon());

  const isRunning = state.cloud === 'running';
  const isBusy = ['starting', 'stopping'].includes(state.cloud) ||
                 ['starting', 'stopping'].includes(state.agent);

  const menu = Menu.buildFromTemplate([
    { label: '49Agents', enabled: false },
    { label: `Cloud: ${state.cloud}  ·  Agent: ${state.agent}`, enabled: false },
    { type: 'separator' },
    { label: 'Open 49Agents', click: openMainWindow, enabled: isRunning },
    { label: 'Control Panel', click: openDashboard },
    { type: 'separator' },
    { label: 'Restart', click: () => restartAll(), enabled: !isBusy },
    {
      label: isRunning ? 'Stop' : 'Start',
      enabled: !isBusy,
      click: () => {
        if (isRunning) { stopAgent().then(() => stopCloud()); }
        else { startCloud(appPort).then(() => startAgent(appPort)); }
      },
    },
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
    width: 520,
    height: 660,
    resizable: true,
    minWidth: 420,
    minHeight: 500,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#050D18',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: join(__dirname, 'preload.cjs'),
    },
  });

  dashboardWindow.loadFile(join(__dirname, 'dashboard.html'));
  dashboardWindow.on('closed', () => { dashboardWindow = null; });

  // Renderer signals ready via IPC after mounting — avoids the race where
  // did-finish-load fires before JS listeners are registered.
  ipcMain.once('dashboard-ready', () => {
    if (!dashboardWindow) return;
    dashboardWindow.webContents.send('state', getPublicState());
    for (const entry of state.cloudLogs.slice(-200))
      dashboardWindow.webContents.send('log', { service: 'cloud', ...entry });
    for (const entry of state.agentLogs.slice(-200))
      dashboardWindow.webContents.send('log', { service: 'agent', ...entry });
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
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
      backgroundThrottling: false,
    },
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
  (service === 'cloud' ? state.cloudLogs : state.agentLogs).slice(-200)
);
ipcMain.handle('action', async (_, action) => {
  switch (action) {
    case 'open':    openMainWindow(); break;
    case 'restart': await restartAll(); break;
    case 'stop':    await stopAgent(); await stopCloud(); break;
    case 'start':   await startCloud(appPort); startAgent(appPort); break;
  }
});
// Consumed via ipcMain.once inside openDashboard; register a no-op so
// Electron doesn't warn about unhandled channel on subsequent fires.
ipcMain.on('dashboard-ready', () => {});

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
  // Keep running — user can reopen via tray.
});

app.on('activate', () => {
  if (appPort) openMainWindow();
});

app.on('will-quit', killAll);
