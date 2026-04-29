import { app, BrowserWindow, dialog, shell } from 'electron';
import { spawn } from 'child_process';
import { createServer } from 'net';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));

// When packaged, cloud/agent live in process.resourcesPath/cloud|agent.
// In dev (electron . from desktop/), they are siblings of desktop/.
const isDev = !app.isPackaged;
const repoRoot = isDev ? join(__dirname, '..', '..') : process.resourcesPath;
const cloudDir = join(repoRoot, 'cloud');
const agentDir = join(repoRoot, 'agent');

let mainWindow = null;
let cloudProcess = null;
let agentProcess = null;
let appPort = null;

// ── Dependency check ─────────────────────────────────────────────────────────

function checkDependencies() {
  const missing = [];
  for (const bin of ['tmux', 'ttyd']) {
    try {
      execSync(`which ${bin}`, { stdio: 'ignore' });
    } catch {
      missing.push(bin);
    }
  }
  return missing;
}

// ── Free port finder ─────────────────────────────────────────────────────────

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

// ── Process management ────────────────────────────────────────────────────────

function spawnCloud(port) {
  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'development',
    };

    cloudProcess = spawn('node', ['src/index.js'], {
      cwd: cloudDir,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let ready = false;

    const onData = (data) => {
      const text = data.toString();
      // Cloud server logs "Listening on" or similar when ready.
      // We poll instead — resolve after a short delay giving it time to bind.
      if (!ready) {
        ready = true;
        setTimeout(() => resolve(), 1500);
      }
    };

    cloudProcess.stdout.on('data', onData);
    cloudProcess.stderr.on('data', onData);

    cloudProcess.on('error', reject);

    cloudProcess.on('exit', (code) => {
      if (!ready) reject(new Error(`Cloud exited with code ${code} before becoming ready`));
    });

    // Fallback: resolve after 4 seconds regardless
    setTimeout(() => {
      if (!ready) {
        ready = true;
        resolve();
      }
    }, 4000);
  });
}

function spawnAgent(port) {
  const env = {
    ...process.env,
    TC_CLOUD_URL: `ws://127.0.0.1:${port}`,
  };

  agentProcess = spawn('node', ['bin/49-agent.js', 'start'], {
    cwd: agentDir,
    env,
    stdio: 'ignore',
  });

  agentProcess.on('error', (err) => {
    console.error('Agent process error:', err);
  });
}

function killAll() {
  if (cloudProcess) {
    cloudProcess.kill();
    cloudProcess = null;
  }
  if (agentProcess) {
    agentProcess.kill();
    agentProcess = null;
  }
}

// ── Window ────────────────────────────────────────────────────────────────────

function createWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: '49Agents',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.loadURL(`http://127.0.0.1:${port}`);

  // Open external links in the system browser, not in the app window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ── App lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
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

  try {
    appPort = await findFreePort();
    await spawnCloud(appPort);
    spawnAgent(appPort);
    createWindow(appPort);
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
  // On macOS, quit when all windows are closed (don't keep running in dock).
  app.quit();
});

app.on('will-quit', () => {
  killAll();
});

app.on('activate', () => {
  if (mainWindow === null && appPort) {
    createWindow(appPort);
  }
});
