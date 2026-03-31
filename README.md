# Zeeble Client

The official desktop client for [Zeeble](https://zeeble.xyz) — a self-hostable chat platform. Built with React, TypeScript, and Tauri.

## Features

- Real-time messaging with WebSocket support
- Voice channels with screen sharing (powered by LiveKit)
- Text channels with markdown rendering and GIF picker
- Server management — create, join, and configure servers
- Role-based permissions
- Friend system and direct messages
- Premium subscriptions (Stripe)
- Light and dark themes
- Self-hostable — connect to any Zeeble server, not just `api.zeeble.xyz`

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Rust](https://www.rust-lang.org/tools/install) (for Tauri desktop builds)

### Install dependencies

```bash
npm install
```

### Run in the browser (dev mode)

```bash
npm run dev
```

### Run as a desktop app (Tauri)

```bash
npm run tauri dev
```

### Build

```bash
# Web build
npm run build

# Desktop app
npm run tauri build
```

## Configuration

The client connects to `https://api.zeeble.xyz` by default. To connect to a self-hosted server, you can override the server URL from the **Dev** tab in Account Settings once logged in, or set environment variables before building:

```env
VITE_AUTH_URL=https://your-server.example.com
VITE_ZCLOUD_URL=https://your-cloud.example.com
VITE_TENOR_API_KEY=your_tenor_key   # optional, for GIF search
```

## Tech Stack

- [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- [Vite](https://vite.dev/) — build tooling
- [Tauri 2](https://tauri.app/) — desktop app wrapper
- [LiveKit](https://livekit.io/) — voice/video
- [Stripe](https://stripe.com/) — payments
- [DOMPurify](https://github.com/cure53/DOMPurify) — XSS sanitization

## Self-Hosting

To run your own Zeeble server, see the [zeeble-server](https://github.com/SamTechAV/zeeble-server) repository.
