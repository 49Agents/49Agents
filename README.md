# 49Agents

An infinite canvas with real terminal panes powered by tmux. Access your terminals from any browser.
<img width="2559" height="1013" alt="Screenshot 2026-02-17 010827" src="https://github.com/user-attachments/assets/33238bd9-589c-438b-85a9-1c3ee780eca3" />

## How It Works

```
Your Machine                        Cloud Server (relay)
┌──────────────┐                   ┌──────────────────┐
│  49-agent    │ ──── WSS ───────► │  WebSocket relay  │
│  (tmux+ttyd) │                   │  + web app        │
└──────────────┘                   │  + SQLite         │
                                   └────────┬─────────┘
                                            │
                                   ◄── WSS ─┘
                                   │
                             ┌─────┴──────┐
                             │  Browser    │
                             │  (xterm.js) │
                             └────────────┘
```

The **agent** runs on your machine and manages tmux sessions via ttyd. The **cloud server** is a WebSocket relay that routes terminal I/O between the agent and your browser. No terminal data is stored on the server.

## Quick Start

**Prerequisites:** Node.js 18+, tmux, [ttyd](https://github.com/tsl0922/ttyd#installation)

```bash
git clone https://github.com/49Agents/49Agents.git
cd 49Agents
./49ctl setup    # interactive setup (one time)
./49ctl start    # start cloud server + agent
```

Open `http://localhost:1071` in your browser. No account, no login, no token needed for local use.

## Managing Services

```bash
./49ctl start          # Start cloud + agent (based on setup config)
./49ctl stop           # Stop everything cleanly
./49ctl restart        # Stop + start
./49ctl status         # Show what's running, PIDs, ports
./49ctl logs           # Tail both cloud and agent logs
./49ctl logs cloud     # Tail cloud logs only
./49ctl logs agent     # Tail agent logs only
./49ctl build          # Rebuild client assets + agent tarball

./49ctl cloud-start    # Start only the cloud server
./49ctl cloud-stop     # Stop only the cloud server
./49ctl agent-start    # Start only the agent
./49ctl agent-stop     # Stop only the agent
```

You can also use `./start.sh` for the original interactive setup-and-run experience.

## Single Machine Setup

Run `./49ctl setup`, choose **Single machine**, enter a port (default: `1071`). Then `./49ctl start`.

## Multi-Machine Setup

Run the cloud server on one machine and the agent on another (useful for accessing terminals from a laptop, tablet, or phone via a private network like [Tailscale](https://tailscale.com)).

Run `./49ctl setup`, choose **Multi machine**, then:

- **Cloud only** — runs just the relay server. Choose a port. Open `http://<this-machine-ip>:<port>` from any device on your network.
- **Agent only** — runs just the agent. Enter the WebSocket URL of your cloud server (e.g. `ws://192.168.1.10:1071`).
- **Both** — runs cloud and agent on this machine, useful as the "server" node in a multi-machine setup.

You can run agents on multiple machines all pointing at the same cloud server and switch between them from one browser tab.

## No Auth by Default

When no OAuth credentials are configured, the server runs in local mode — no login screen, no accounts. Anyone who can reach the server gets in. This is fine for Tailscale or a local network.

**To add authentication** for multi-user setups, register a [GitHub OAuth App](https://github.com/settings/applications/new) or Google OAuth credentials and set the env vars:

```bash
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
```

When OAuth is configured, the server requires login. When it's not, it's open — keep it behind a private network or firewall.

## Agent CLI

The agent binary lives at `agent/bin/49-agent.js` (or `~/.49agents/agent/bin/49-agent.js` if installed remotely).

```
49-agent start               Connect to relay (foreground, logs to stdout)
49-agent start --daemon      Connect to relay (background, writes PID file)
49-agent stop                Stop the background agent process
49-agent status              Check if the agent is running and show PID
49-agent config              Set a custom cloud server URL for private networks
49-agent login <token>       Store an auth token (used during remote pairing)
49-agent install-service     Print instructions to install as a system service
```

### Running the Agent as a System Service

By default, the agent runs as a foreground process (via `./49ctl start` or `49-agent start`). If you want it to **auto-start on boot** and run permanently in the background, you can install it as a system service:

```bash
49-agent install-service
```

This prints copy-paste instructions for your OS (it does **not** install anything automatically):

- **macOS (launchd)** — creates a plist at `~/Library/LaunchAgents/com.49agents.agent.plist`. The agent starts on login and restarts if it crashes.
- **Linux (systemd)** — creates a user service at `~/.config/systemd/user/49-agent.service`. Same behavior: starts on login, auto-restarts on failure.

This is optional. For local development, `./49ctl start` and `./49ctl stop` are all you need.

## Session & State Management

49Agents stores persistent state in several places. Use `./49ctl session` to see everything at a glance.

| What | Where | Purpose |
|------|-------|---------|
| Agent auth token | `~/.49agents/agent.json` | Authenticates the agent with the cloud server. Persists across restarts so you don't re-pair each time. |
| Terminal tracking | `~/.49agents/terminals.json` | Agent's record of which tmux sessions it manages. Panes reappear in the browser after an agent restart. |
| Cloud database | `cloud/data/tc.db` | SQLite — stores users, agent registrations, pane layouts, notes, and preferences. |
| Browser state | `localStorage` | Tutorial completion, UI drafts. Cleared by browser. |

```bash
./49ctl session            # Show all persistent state
./49ctl reset-agent        # Delete auth token (forces re-pairing)
./49ctl reset-terminals    # Clear terminal tracking (agent re-discovers on start)
./49ctl reset-db           # Delete cloud database (users, layouts, notes)
./49ctl reset-all          # Full state wipe (fresh start)
./49ctl clear-logs         # Truncate log files
```

## Configuration

The cloud server is configured via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `1071` | Cloud server port |
| `HOST` | `0.0.0.0` | Bind address |
| `JWT_SECRET` | dev default | Secret for signing user JWTs |
| `AGENT_JWT_SECRET` | dev default | Secret for signing agent JWTs |
| `GITHUB_CLIENT_ID` | _(none)_ | GitHub OAuth — enables login |
| `GITHUB_CLIENT_SECRET` | _(none)_ | GitHub OAuth secret |
| `GOOGLE_CLIENT_ID` | _(none)_ | Google OAuth — enables login |
| `GOOGLE_CLIENT_SECRET` | _(none)_ | Google OAuth secret |
| `DATABASE_PATH` | `./data/tc.db` | SQLite database path |

The agent reads one env var:

| Variable | Default | Description |
|----------|---------|-------------|
| `TC_CLOUD_URL` | `ws://localhost:1071` | WebSocket URL of the cloud relay |

## Project Structure

```
agent/                  # Agent daemon (runs on your machine)
├── bin/49-agent.js     # CLI entry point
├── src/                # Core: relay client, terminal manager, auth
└── services/           # tmux, file browsing, git, metrics

cloud/                  # Cloud server (relay + web app)
├── src/                # Server: WebSocket relay, auth, API routes, DB
├── src-client/         # Frontend source (vanilla JS)
├── public/             # Static assets (HTML, CSS, xterm.js)
└── build.js            # Frontend build script
```

## System Requirements

- **Node.js** 18+
- **tmux** — terminal multiplexer
- **ttyd** — terminal over WebSocket ([install](https://github.com/tsl0922/ttyd#installation))
- **git** _(optional)_ — for git graph features

## Hosted Version (Coming Soon)

We're building a hosted version at [49agents.com](https://49agents.com) — just install the agent, pair it, and access your terminals from anywhere without running your own server. Stay tuned.

## License

[Business Source License 1.1](./LICENSE) — free for individuals and companies under $1M in revenue or funding. Converts to MIT on 2030-02-26.
