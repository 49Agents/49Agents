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
./start.sh
```

The setup script will:
1. Install dependencies for both cloud and agent
2. Build the client assets
3. Ask whether you're running on a **single machine** or **multiple machines**
4. Start everything and print the URL to open in your browser

No account, no login, no token needed for local use.

## Single Machine Setup

When prompted, choose **Single machine**. Enter a port (default: `1071`). Both the cloud server and agent start automatically.

```
Open http://localhost:1071 in your browser.
```

## Multi-Machine Setup

Run the cloud server on one machine and the agent on another (useful for accessing terminals from a laptop, tablet, or phone via a private network like [Tailscale](https://tailscale.com)).

When prompted, choose **Multi machine**, then:

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

```
49-agent start               Connect to relay (foreground)
49-agent start --daemon      Connect to relay (background)
49-agent config              Set a custom host/port for private network setups
49-agent status              Show agent status
49-agent stop                Stop background agent
49-agent install-service     Show systemd/launchd install instructions
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
