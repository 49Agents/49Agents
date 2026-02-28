#!/usr/bin/env node

import { startAgent } from '../src/index.js';
import { loadToken, saveToken, clearToken } from '../src/auth.js';
import { config } from '../src/config.js';
import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fork } from 'child_process';
import { fileURLToPath } from 'url';
import { createInterface } from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PID_FILE = join(config.configDir, 'agent.pid');

const args = process.argv.slice(2);
const command = args[0] || 'help';

switch (command) {
  case 'login':
    await handleLogin();
    break;
  case 'start':
    await handleStart();
    break;
  case 'status':
    handleStatus();
    break;
  case 'stop':
    handleStop();
    break;
  case 'install-service':
    handleInstallService();
    break;
  case 'help':
  default:
    printHelp();
    break;
}

async function handleLogin() {
  // Accept token from command line or stdin
  const tokenArg = args[1];

  if (tokenArg) {
    saveToken(tokenArg);
    console.log('[49-agent] Token saved successfully.');
    return;
  }

  // Interactive: prompt for token
  console.log('[49-agent] Login to 49Agents Cloud');
  console.log('');
  console.log('  Visit your 49Agents dashboard to get an agent pairing token,');
  console.log('  then run:');
  console.log('');
  console.log('    49-agent login <YOUR_TOKEN>');
  console.log('');

  // Try to read from stdin if piped
  if (!process.stdin.isTTY) {
    const chunks = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    const token = Buffer.concat(chunks).toString().trim();
    if (token) {
      saveToken(token);
      console.log('[49-agent] Token saved successfully.');
    }
  }
}

async function handleStart() {
  const isDaemon = args.includes('--daemon') || args.includes('-d');

  if (isDaemon) {
    // Fork to background
    const child = fork(join(__dirname, '49-agent.js'), ['start'], {
      detached: true,
      stdio: 'ignore',
    });

    // Ensure config dir exists for PID file
    mkdirSync(config.configDir, { recursive: true });
    writeFileSync(PID_FILE, String(child.pid));
    child.unref();

    console.log(`[49-agent] Agent started in background (PID: ${child.pid})`);
    console.log(`[49-agent] PID file: ${PID_FILE}`);
    console.log(`[49-agent] Use "49-agent stop" to stop the agent.`);
    process.exit(0);
  }

  // Foreground mode
  let token = loadToken();
  let cloudUrl;
  if (!token) {
    const result = await promptConnectionMode();
    if (!result) process.exit(1);
    token = result.token;
    cloudUrl = result.cloudUrl;
  }

  // Write PID file for foreground process too (so status/stop work)
  mkdirSync(config.configDir, { recursive: true });
  writeFileSync(PID_FILE, String(process.pid));

  // Clean up PID file on exit
  const cleanupPid = () => {
    try {
      if (existsSync(PID_FILE)) {
        const storedPid = readFileSync(PID_FILE, 'utf-8').trim();
        if (storedPid === String(process.pid)) {
          unlinkSync(PID_FILE);
        }
      }
    } catch { /* ignore */ }
  };
  process.on('exit', cleanupPid);

  await startAgent({ token, cloudUrl });
}

function handleStatus() {
  const token = loadToken();
  const hasPid = existsSync(PID_FILE);
  let pid = null;
  let running = false;

  if (hasPid) {
    pid = parseInt(readFileSync(PID_FILE, 'utf-8').trim(), 10);
    try {
      process.kill(pid, 0); // Check if process exists
      running = true;
    } catch {
      running = false;
    }
  }

  console.log(`49Agents Agent v${config.version}`);
  console.log(`  Cloud URL:     ${config.cloudUrl}`);
  console.log(`  Config dir:    ${config.configDir}`);
  console.log(`  Token:         ${token ? 'configured' : 'NOT configured'}`);
  console.log(`  Agent status:  ${running ? `running (PID: ${pid})` : 'stopped'}`);
}

function handleStop() {
  if (!existsSync(PID_FILE)) {
    console.log('[49-agent] No PID file found. Agent may not be running.');
    return;
  }

  const pid = parseInt(readFileSync(PID_FILE, 'utf-8').trim(), 10);

  try {
    process.kill(pid, 'SIGTERM');
    console.log(`[49-agent] Sent SIGTERM to agent (PID: ${pid})`);
    try { unlinkSync(PID_FILE); } catch { /* ignore */ }
  } catch (err) {
    if (err.code === 'ESRCH') {
      console.log('[49-agent] Agent process not found. Cleaning up PID file.');
      try { unlinkSync(PID_FILE); } catch { /* ignore */ }
    } else {
      console.error('[49-agent] Failed to stop agent:', err.message);
    }
  }
}

function handleInstallService() {
  const platform = process.platform;

  if (platform === 'linux') {
    const serviceContent = `[Unit]
Description=49Agents Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=${process.execPath} ${join(__dirname, '49-agent.js')} start
Restart=always
RestartSec=5
Environment=HOME=${process.env.HOME}
User=${process.env.USER}

[Install]
WantedBy=multi-user.target`;

    const servicePath = join(process.env.HOME, '.config', 'systemd', 'user', '49-agent.service');
    console.log('[49-agent] To install as a systemd user service:');
    console.log('');
    console.log(`  mkdir -p ~/.config/systemd/user`);
    console.log(`  cat > ${servicePath} << 'EOF'`);
    console.log(serviceContent);
    console.log('EOF');
    console.log('  systemctl --user daemon-reload');
    console.log('  systemctl --user enable 49-agent');
    console.log('  systemctl --user start 49-agent');
    console.log('');
  } else if (platform === 'darwin') {
    const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.49agents.agent</string>
    <key>ProgramArguments</key>
    <array>
        <string>${process.execPath}</string>
        <string>${join(__dirname, '49-agent.js')}</string>
        <string>start</string>
    </array>
    <key>EnvironmentVariables</key>
    <dict>
        <key>TC_CLOUD_URL</key>
        <string>${config.cloudUrl}</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
</dict>
</plist>`;

    const plistPath = join(process.env.HOME, 'Library', 'LaunchAgents', 'com.49agents.agent.plist');
    console.log('[49-agent] To install as a launchd service:');
    console.log('');
    console.log(`  cat > ${plistPath} << 'EOF'`);
    console.log(plistContent);
    console.log('EOF');
    console.log(`  launchctl load ${plistPath}`);
    console.log('');
  } else {
    console.log('[49-agent] Service installation is only supported on Linux (systemd) and macOS (launchd).');
  }
}

async function promptConnectionMode() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise((resolve) => rl.question(q, resolve));

  console.log('');
  console.log('No authentication token found.');
  console.log('');
  console.log('Where would you like to connect?');
  console.log('');
  console.log('  1) Local / private network  (no login required)');
  console.log('  2) 49agents.com             (not yet available)');
  console.log('');

  const answer = (await ask('Enter choice [1/2]: ')).trim();

  if (answer === '1') {
    console.log('');
    console.log('  1) Single machine  (this machine only — default)');
    console.log('  2) Private network (specify a host on your network)');
    console.log('');
    const machineAnswer = (await ask('Enter choice [1/2, default: 1]: ')).trim() || '1';

    let host = 'localhost';
    if (machineAnswer === '2') {
      const hostInput = (await ask('Host or IP of the cloud server: ')).trim();
      host = hostInput || 'localhost';
    }

    const portInput = (await ask(`Port the cloud server is running on [default: 3001]: `)).trim();
    rl.close();
    const port = portInput || '3001';
    const cloudUrl = `ws://${host}:${port}`;
    console.log(`[49-agent] Connecting to ${cloudUrl} in local mode.`);
    return { token: 'dev', cloudUrl };
  }

  rl.close();

  if (answer === '2') {
    console.log('');
    console.log('Cloud mode is not yet available. Please choose option 1 for now :)');
    console.log('');
    return null;
  }

  console.error('[49-agent] Invalid choice. Exiting.');
  return null;
}

function printHelp() {
  console.log(`49Agents Agent v${config.version}

Usage: 49-agent <command> [options]

Commands:
  login [token]       Store authentication token for cloud relay
  start               Connect to cloud relay (foreground)
  start --daemon      Connect to cloud relay (background)
  status              Show agent status and configuration
  stop                Stop the background agent
  install-service     Show instructions for system service installation
  help                Show this help message

Environment:
  TC_CLOUD_URL        Override cloud relay URL (default: wss://49agents.com)
`);
}
