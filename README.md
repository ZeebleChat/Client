# Zeeble Client

The official desktop client for [Zeeble](https://zeeble.xyz) — a self-hostable, Discord-style chat platform. Built with React, TypeScript, and Tauri.

## Features

- **Real-time messaging** — WebSocket-powered chat with markdown rendering and GIF search
- **Voice & video** — Voice channels with screen sharing, powered by LiveKit
- **Servers** — Create, join, and configure servers with role-based permissions
- **Direct messages** — Friend system and private conversations
- **Premium** — Subscription support via Stripe
- **Themes** — Light and dark mode
- **Self-hostable** — Connect to any Zeeble-compatible server, not just `api.zeeble.xyz`

## Download

Grab the latest release from the [Releases](https://github.com/SamTechAV/zeeble-client/releases) page and run the installer.

## Building from Source

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Rust](https://www.rust-lang.org/tools/install)

### Install dependencies

```bash
npm install
```

### Run in dev mode

```bash
# Browser
npm run dev

# Desktop
npm run tauri dev
```

### Build

```bash
# Web
npm run build

# Desktop
npm run tauri build
```

## Self-Hosting

To connect to a self-hosted Zeeble server, override the server URL from the **Dev** tab in Account Settings after logging in. To run your own server, see the [zeeble-server](https://github.com/SamTechAV/zeeble-server) repository.

## Tech Stack

| | |
|---|---|
| [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) | UI framework |
| [Vite](https://vite.dev/) | Build tooling |
| [Tauri 2](https://tauri.app/) | Desktop app wrapper |
| [LiveKit](https://livekit.io/) | Voice & video |
| [Stripe](https://stripe.com/) | Payments |
| [DOMPurify](https://github.com/cure53/DOMPurify) | XSS sanitization |
