# PeerBridge

Zero-cloud, ephemeral peer-to-peer file transfer. Files never touch a
server — they stream directly between two browsers over an encrypted
WebRTC `RTCDataChannel`. The server only relays room codes and WebRTC
signaling (SDP/ICE), and exposes a `/health` endpoint for uptime
monitoring.

Live at **[transfer.ashwanitiwari.com](https://transfer.ashwanitiwari.com)**, a free tool from [ashwanitiwari.com](https://ashwanitiwari.com). Questions or feedback: [ashwanitiwari.com/contact](https://ashwanitiwari.com/contact) or dev.ashwanitiwari@gmail.com.

## Stack

- **Next.js 16** (App Router, TypeScript, Tailwind CSS 4)
- **[server.js](server.js)** — a custom Node server that runs the Next.js
  app, a `ws`-based WebSocket signaling server (`/ws`), and a health
  check (`/health`, `/ping`, `/api/health`) all on one HTTP server/port.
  For a split deployment (e.g. Vercel + Render, see below),
  [server/standalone.js](server/standalone.js) runs just the signaling
  half on its own, with no Next.js dependency.
- **WebRTC `RTCDataChannel`** — 64KB chunked transfer with
  `bufferedAmount` backpressure, SHA-256 (Web Crypto API) integrity
  verification per file, and an automatic ICE-restart attempt on a
  dropped connection so brief network blips don't restart the transfer
  (see [lib/webrtc.ts](lib/webrtc.ts))
- **Batches, not just single files** — drag in multiple files or a whole
  folder (folder structure is preserved via each file's relative path);
  [lib/collect-files.ts](lib/collect-files.ts) walks the File and
  Directory Entries API for dropped folders.
- **File System Access API** (Chromium browsers) — accepting a transfer
  prompts for a save location (a folder picker for multi-file/folder
  batches, a "Save As" for a single file) and streams straight to disk;
  other browsers fall back to buffering in memory and a normal download
  per file.
- **Gilroy + Rubik** — self-hosted heading/body fonts and the `#5368fd`
  brand indigo, both pulled from ashwanitiwari.com's own theme (see
  [lib/fonts.ts](lib/fonts.ts)) so this reads as the same brand rather
  than a generic template.

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The dev server runs
`server.js`, so the `/ws` signaling endpoint is available immediately —
open the app in two tabs to test a real transfer locally.

## Project layout

| Path | What it is |
| --- | --- |
| `server.js` / `server/signaling.js` | Custom Node server + WebSocket room/SDP/ICE relay |
| `server/standalone.js` | Signaling-only server for a split frontend/backend deployment |
| `render.yaml` | Render Blueprint pinning the signaling service's config as code (build/start command, health check, auto-deploy) |
| `lib/webrtc.ts` | The `PeerTransferSession` engine: chunking, backpressure, reconnect, SHA-256 |
| `lib/signaling-client.ts` | Browser-side WebSocket client for the signaling protocol |
| `hooks/usePeerTransfer.ts` | React hook wrapping a transfer session (sender or receiver) |
| `hooks/useRelayStatus.ts` | Tracks signaling-relay connectivity/latency, surfaces cold starts |
| `app/page.tsx` | Sender UI: dropzone, room code, QR pairing, cancel |
| `app/join/[roomId]/page.tsx` | Receiver UI: accept/decline, progress, verified download, cancel |

## Scripts

```bash
npm run dev       # node server.js (dev mode, bundles Next.js + /ws)
npm run build     # next build
npm start         # NODE_ENV=production node server.js
npm run start:ws  # NODE_ENV=production node server/standalone.js (signaling only)
npm run lint      # eslint
```

## Deployment

See [DEPLOY.md](DEPLOY.md) for three paths. All of them auto-deploy on
every `git push` to `main` once set up once:

- **Render (free tier)** — everything in one Node web service, custom
  domain + free SSL, step-by-step from repo connection to DNS.
- **Vercel (frontend) + Render (backend)** — Next.js on Vercel,
  `server/standalone.js` as a signaling-only service on Render (deployed
  from [render.yaml](render.yaml) as a Blueprint, so its config is
  version-controlled instead of hand-typed into a dashboard form),
  connected via `NEXT_PUBLIC_SIGNALING_URL`.
- **VPS with Docker + Nginx** — [Dockerfile](Dockerfile),
  [docker-compose.yml](docker-compose.yml), and an
  [Nginx virtual host config](deploy/nginx/transfer.ashwanitiwari.com.conf)
  with Certbot instructions (this one has no platform auto-deploy —
  see DEPLOY.md).

## Known limitations

- TURN falls back to a shared public relay (Metered's Open Relay
  Project) when no dedicated TURN credentials are configured, so
  cross-network/international transfers work without any setup — but
  that fallback is rate-limited with no uptime guarantee. For real
  reliability at scale, get your own free-tier TURN credentials and
  set `NEXT_PUBLIC_TURN_URLS` / `_USERNAME` / `_CREDENTIAL` (Metered.ca,
  Cloudflare Calls) — see [DEPLOY.md](DEPLOY.md#notes-all-options).
- A transfer can't resume after either tab is closed or reloaded — since
  no file data is ever stored server-side, there's nothing to resume
  from once the browser holding it in memory is gone. It does survive
  brief reconnects (Wi-Fi drop, ICE restart) without losing progress.
