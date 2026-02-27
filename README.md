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

## Quick Start (Local, Single Machine)

Run everything on one machine. No account, no internet, no auth.

**Prerequisites:** Node.js 18+, tmux, [ttyd](https://github.com/tsl0922/ttyd#installation)

```bash
# 1. Start the cloud server
cd cloud
npm install
npm run build
npm start                # http://localhost:3001

# 2. In another terminal, start the agent
cd agent
npm install
TC_CLOUD_URL=ws://localhost:3001 node bin/49-agent.js start
```

Open http://localhost:3001 in your browser. That's it.

## Multi-Device Access Over a Private Network

If you want to access your terminals from other devices (laptop, tablet, phone), run the cloud server on a machine reachable from those devices. A private network like [Tailscale](https://tailscale.com) is perfect for this.

```bash
# On your server machine (e.g. Tailscale IP 100.x.x.x)

# 1. Start the cloud server
cd cloud
npm install
npm run build
HOST=0.0.0.0 npm start

# 2. Start the agent (same machine, or a different one)
cd agent
npm install
TC_CLOUD_URL=ws://100.x.x.x:3001 node bin/49-agent.js start
```

Then open `http://100.x.x.x:3001` from any device on your network.

You can run multiple agents on different machines, all pointing at the same cloud server, and switch between them from one browser.

**Optional: Add authentication for multi-user setups.** Register a [GitHub OAuth App](https://github.com/settings/applications/new) or Google OAuth credentials, then set the env vars in your `.env` file. When OAuth is configured, the server requires login. When it's not, anyone who can reach the server gets in — fine for Tailscale, not for the public internet.

## Hosted Version (Coming Soon)

We're building a hosted version at [49agents.com](https://49agents.com) — just install the agent, pair it, and access your terminals from anywhere without running your own server. Stay tuned.

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

## Configuration

The cloud server is configured via environment variables. See `.env.example` for a full reference.

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Cloud server port |
| `HOST` | `0.0.0.0` | Bind address |
| `JWT_SECRET` | dev default | Secret for signing user JWTs |
| `AGENT_JWT_SECRET` | dev default | Secret for signing agent JWTs |
| `GITHUB_CLIENT_ID` | _(none)_ | GitHub OAuth — enables login |
| `GITHUB_CLIENT_SECRET` | _(none)_ | GitHub OAuth secret |
| `GOOGLE_CLIENT_ID` | _(none)_ | Google OAuth — enables login |
| `GOOGLE_CLIENT_SECRET` | _(none)_ | Google OAuth secret |
| `DATABASE_PATH` | `./data/tc.db` | SQLite database path |

**No OAuth = local mode.** No login screen, no accounts — a dev user is created automatically.

The agent reads one env var:

| Variable | Default | Description |
|----------|---------|-------------|
| `TC_CLOUD_URL` | `wss://49agents.com` | WebSocket URL of the cloud relay |

Set `TC_CLOUD_URL=ws://localhost:3001` for local use, or point it at your private server.

## Agent CLI

```
49-agent login <token>       Save auth token for cloud relay
49-agent start               Connect to relay (foreground)
49-agent start --daemon      Connect to relay (background)
49-agent status              Show agent status
49-agent stop                Stop background agent
49-agent install-service     Show systemd/launchd install instructions
```

## System Requirements

- **Node.js** 18+
- **tmux** — terminal multiplexer
- **ttyd** — terminal over WebSocket ([install](https://github.com/tsl0922/ttyd#installation))
- **git** _(optional)_ — for git graph features

## License

[Business Source License 1.1](./LICENSE) — free for individuals and companies under $1M in revenue or funding. Converts to MIT on 2030-02-26.
