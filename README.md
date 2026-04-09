<p align="center">
  <img alt="49Agents" src="https://github.com/user-attachments/assets/4ee43d8f-75de-4305-98ca-09b4a96e1e5f" height="120" />
</p>

<h1 align="center">49 Agents IDE</h1>

<p align="center">The first 2D agentic IDE. Open source.</p>

<p align="center"><strong>All agents. All terminals. All projects. All machines. One unified space.</strong></p>

<p align="center">
  <a href="https://github.com/49Agents/49Agents/stargazers"><img src="https://img.shields.io/github/stars/49Agents/49Agents?style=flat" alt="GitHub Stars" /></a>
  <a href="https://discord.gg/rkUbxYvGj"><img src="https://img.shields.io/badge/Discord-Join-5865F2?logo=discord&logoColor=white" alt="Discord" /></a>
  <a href="https://twitter.com/49agents"><img src="https://img.shields.io/twitter/follow/49agents" alt="Twitter Follow" /></a>
</p>

<h1 align="center">
  Before
</h1>

<img width="100%" alt="After — 49Agents" src="https://github.com/user-attachments/assets/878b3926-e017-4ccc-9c54-315b647fd417" />
<h1 align="center">
  49
</h1>
<img width="100%" alt="Before — terminal clutter" src="https://github.com/user-attachments/assets/b06c8fe8-d1bf-432a-b935-bbf8376bd7ff" />
<h1 align="center">
</h1>
<img width="1544" height="832" alt="diagram_with_pane_titles" src="https://github.com/user-attachments/assets/52a68a3a-8d77-4612-bbb0-dbc43ca990dd" />


---

| Before | 49 |
|--------|--------------|
| 14 terminal tabs | One zoomable canvas |
| SSH into each machine | All machines, zero SSH |
| Alt-tab to check Claude | Claude status on every pane |
| Can't work from phone | Any device, anywhere |
| Terminal-only, no files | Monaco editor on the canvas |
| 🤷 | Git graph |
| 🤷 | Interactive issue tables ([Beads](https://github.com/steveyegge/beads)) |
| 🤷 | Permission notifications |
| 🤷 | Markdown notes |

---

## Quick Start

```bash
git clone https://github.com/49Agents/49Agents.git
cd 49Agents
./49ctl setup    # interactive setup (one time)
./49ctl start    # start cloud server + agent
```

Open `http://localhost:1071`. No account, no login, no token.

Don't want to self-host? **[49agents.com](https://app.49agents.com)**
![tutorial](https://github.com/user-attachments/assets/776a96c7-35ae-495a-8c15-ee847b3dcd57)


---

## Features

### Canvas and Workspace

- [x] **Infinite canvas** — no tabs, no splits. Place panes anywhere on a zoomable surface
- [x] **Drag, resize, arrange** — your workspace grows with your thinking, not your monitor
- [x] **Zoom levels** — zoom out for the big picture, zoom in to focus
- [x] **Persistent layout** — everything stays where you put it

### Terminals

- [x] **Real tmux sessions** via ttyd — full ANSI color, scrollback, your shell config
- [x] **Broadcast input** — type once, send keystrokes to multiple terminals simultaneously

### Multi-Machine

- [x] **Zero SSH** — connect agents from any machine to one canvas
- [x] **HUD overlay** — live CPU, RAM, and Claude API usage across all connected machines

### Access

- [x] **Any device** — laptop, tablet, phone. Same workspace, same layout
- [x] **Tailscale / LAN / hosted relay** — works however you connect
- [x] **Fully self-hosted** — the entire stack runs on your hardware
- [x] **No data stored server-side** — terminal I/O is relayed, never persisted

### Keyboard-First

- [x] **Tab chords** for pane switching
- [x] **WASD move mode** for spatial navigation
- [x] **Shortcut numbers** (1–9) for instant pane focus
- [x] **Broadcast mode** for multi-terminal input

---

## Architecture

```
┌──────────────┐    WSS    ┌──────────────┐    WSS    ┌──────────────┐
│  🖥️ PC       │ ────────►│  ☁️ Relay    │ ◄──────── │  📱 Browser  │
│  49-agent    │           │              │           │              │
└──────────────┘           └──────────────┘           └──────────────┘
                           Self-host or use
                            49agents.com
```

<details>
<summary>Multi-machine setup</summary>

```
┌──────────────┐                                         ┌──────────────┐
│  🖥️ MacBook  │ ─── WSS ───┐                        ┌───│  📱 Phone   │
│  49-agent    │             │                       │   │  Browser     │
└──────────────┘             │                       │   └──────────────┘
                             │   ┌──────────────┐    │
┌──────────────┐             ├──►│  ☁️ Relay    │◄───┤   ┌──────────────┐
│  🖥️ PC       │ ─── WSS ───┤   │              │     ├───│  💻 Laptop  │
│  49-agent    │             │   │  Self-host   │    │   │  Browser     │
└──────────────┘             │   │  or use      │    │   └──────────────┘
                             │   │ 49agents.com │    │
┌──────────────┐             │   └──────────────┘    │    ┌──────────────┐
│  ☁️ Azure VM │ ─── WSS ───┘                        └───│  📱 Tablet   │
│  49-agent    │                                          │  Browser     │
└──────────────┘                                          └──────────────┘

                  Each agent independently connects
                   to the relay via WebSocket.
                  No terminal data stored server-side.
```

</details>

---

## License

[BSL 1.1](./LICENSE) — free for individuals and small teams. Converts to MIT on 2030-02-26.
