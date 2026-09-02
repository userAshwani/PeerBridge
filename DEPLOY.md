# Deploying PeerBridge

Three supported paths:

- **[Option A: Render (free tier)](#option-a-render-free-tier)** — no server to manage, single Node web service, custom domain + free SSL.
- **[Option B: VPS with Docker + Nginx](#option-b-vps-with-docker--nginx)** — full control, no cold starts, no free-tier sleep.
- **[Option C: Vercel (frontend) + Render (backend)](#option-c-vercel-frontend--render-backend)** — the split most people reach for by default: Vercel for the Next.js app, Render for the signaling server.

All three target the production domain `transfer.ashwanitiwari.com`.

**Auto-deploy on every `git push` is the default on every path here** —
nothing extra to configure beyond the one-time setup below:

- **Vercel**: automatic for any Git-connected project. Every push to
  `main` triggers a new production deployment; pushes to other branches
  get their own preview deployment. Nothing to turn on.
- **Render**: **Auto-Deploy** defaults to **On** for both a manually
  configured Web Service and a Blueprint (`render.yaml`) service —
  visible under **Settings → Build & Deploy**. Option C below uses the
  [render.yaml](render.yaml) Blueprint specifically so the *service
  configuration itself* (Build/Start command, health check, plan) is
  also version-controlled — Render's dashboard wizard auto-filling the
  wrong build command (a real issue hit while writing this guide, see
  Option C) can't happen once the service is defined in that file
  instead of typed into the dashboard by hand.
- **Docker/VPS (Option B)** has no platform to auto-deploy for you — see
  its own "Updating" section for a `git pull && docker compose up -d
  --build` one-liner; wiring that to a webhook/CI runner is out of
  scope here.

---

## Option A: Render (free tier)

Render builds and runs `server.js` directly with Node — **not** the
[Dockerfile](Dockerfile) — so the free-tier instance is a plain Node web
service. Because a `Dockerfile` exists in the repo root, Render's
"New Web Service" wizard auto-detects **Docker** as the language; you
need to switch that to **Node** for step 2 below (Docker works too, see
Option B, but the free-plan settings in this guide assume Node).

### 1. Create the Web Service

1. In the [Render dashboard](https://dashboard.render.com), click **New +** → **Web Service**.
2. Connect the GitHub repo **`userAshwani/PeerBridge`**, branch `main`.
3. On the **Configure** step:
   - **Name**: `PeerBridge` (or anything — this becomes part of the default `*.onrender.com` hostname).
   - **Language**: change the auto-detected **Docker** to **Node** — this reveals the Build/Start command fields.
   - **Branch**: `main`.
   - **Region**: pick whichever is closest to your users (Singapore, Oregon, Frankfurt, etc. all work — the WebRTC transfer itself never touches this region, only the signaling handshake does).
   - **Build Command**: `npm install --include=dev && npm run build`
   - **Start Command**: `npm start`
   - **Instance Type**: **Free** ($0/month, 0.1 CPU / 512MB RAM) — sufficient, since no file data ever passes through this instance.
4. **Environment Variables** — click **Add Environment Variable**:
   - `NODE_ENV` = `production`
   - You do **not** need to set `PORT` yourself — Render injects its own `PORT` at runtime and [server.js](server.js) already reads `process.env.PORT`. If you do set one explicitly, it must match what Render tells the service to listen on (Render's dashboard shows this, commonly `10000`).
5. Click **Deploy Web Service**.

> **Why `--include=dev`:** Tailwind, TypeScript, and ESLint are all
> `devDependencies` — needed to build the app, not to run it. Setting
> `NODE_ENV=production` (step 4) makes a plain `npm install` skip
> `devDependencies`, so `next build` fails with `Cannot find module
> '@tailwindcss/postcss'`. `--include=dev` forces them to install
> regardless. If you already deployed with the plain `npm install &&
> npm run build` command and hit that error, this is the fix — update
> the Build Command in **Settings** and **Manual Deploy** → **Deploy
> latest commit**.

First deploy takes a few minutes (`npm install --include=dev && npm run build` runs cold). Watch the **Logs** tab for `> PeerBridge ready on http://0.0.0.0:<port> (ws: /ws)`.

### 2. Verify the deploy

Render gives you a temporary URL like `https://peerbridge-xxxx.onrender.com`. Confirm both the app and the health endpoint:

```bash
curl -I https://peerbridge-xxxx.onrender.com/
curl https://peerbridge-xxxx.onrender.com/health
# -> {"status":"ok","uptime":12.3}
```

Open it in two browser tabs and send a real file through the QR/room-code flow before moving on.

### 3. Point `transfer.ashwanitiwari.com` at it (custom domain)

1. In the service, go to **Settings** → **Custom Domains** → **Add Custom Domain**.
2. Enter `transfer.ashwanitiwari.com` and confirm. Render shows you a target hostname to point DNS at (your service's `onrender.com` hostname).
3. At your DNS provider for `ashwanitiwari.com`, add:
   - **Type**: `CNAME`
   - **Name/Host**: `transfer`
   - **Value/Target**: the `onrender.com` hostname Render showed you
   - **TTL**: default/automatic
   - (A subdomain only ever needs a `CNAME` — no `A`/`ALIAS` record needed here.)
4. Wait for DNS to propagate (usually minutes, can take longer depending on your registrar/TTL):
   ```bash
   dig +short transfer.ashwanitiwari.com
   ```
5. Once Render's dashboard shows the domain as **Verified**, it automatically provisions and auto-renews a Let's Encrypt SSL certificate for it — no manual Certbot step on this path.
6. Confirm:
   ```bash
   curl -I https://transfer.ashwanitiwari.com/
   ```

### 4. Keep the free instance from sleeping (optional)

Render's free web services spin down after ~15 minutes idle and take
~30-40s to wake back up on the next request — the frontend's
[RelayStatusBadge](components/RelayStatusBadge.tsx) surfaces this
transparently ("Waking secure P2P signaling relay…") so it's never a
silent hang, but you can avoid the wait entirely for real visitors by
pinging the instance regularly:

1. Sign up for a free uptime monitor — [UptimeRobot](https://uptimerobot.com), [PingFlow](https://pingflow.io), or [cron-job.org](https://cron-job.org) all work.
2. Create an HTTP(S) monitor hitting:
   ```
   https://transfer.ashwanitiwari.com/api/health
   ```
3. Set the interval to **every 10 minutes** (must be under Render's ~15-minute idle timeout).
4. Expect a `200` with `{"status":"ok","uptime":...}`.

Caveats worth knowing:
- This is a workaround, not an official "keep-alive" feature — Render's free plan has a monthly instance-hours cap shared across your free services (check your current plan's limit in the dashboard); pinging 24/7 uses toward that.
- It only prevents *idle* sleep. A deploy, a Render-side restart, or the platform reclaiming the instance will still cause a genuine cold start — the badge is what makes those visible instead of confusing.

### Updating

Render auto-deploys on every push to `main` by default (see **Settings** → **Build & Deploy** → **Auto-Deploy**). To deploy manually instead: **Manual Deploy** → **Deploy latest commit** in the dashboard.

---

## Option B: VPS with Docker + Nginx

Target: a single VPS running Docker + Nginx, domain `transfer.ashwanitiwari.com`.

### 1. DNS

Point an `A` (and `AAAA`, if the VPS has IPv6) record for
`transfer.ashwanitiwari.com` at the VPS's public IP. Confirm propagation
before requesting a certificate:

```bash
dig +short transfer.ashwanitiwari.com
```

### 2. Install Docker, Docker Compose, Nginx, and Certbot on the VPS

```bash
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER   # log out/in to apply
```

### 3. Deploy the app container

```bash
git clone https://github.com/userAshwani/PeerBridge.git
cd PeerBridge
docker compose up -d --build
```

This builds the image from the [Dockerfile](Dockerfile) and starts the app
bound to `127.0.0.1:3000` (see [docker-compose.yml](docker-compose.yml)) —
not exposed publicly; Nginx is the only thing that talks to it directly.

### 4. Configure Nginx

```bash
sudo mkdir -p /var/www/certbot
sudo cp deploy/nginx/transfer.ashwanitiwari.com.conf \
    /etc/nginx/sites-available/transfer.ashwanitiwari.com
sudo ln -s /etc/nginx/sites-available/transfer.ashwanitiwari.com \
    /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

The shipped config starts HTTP-only (port 80) with an ACME challenge
location and a redirect to HTTPS — the `ssl_certificate` lines will only
resolve once step 5 issues a certificate. `nginx -t` will complain about
missing certs at this point; that's expected before running certbot.

### 5. Issue the TLS certificate

```bash
sudo certbot --nginx -d transfer.ashwanitiwari.com
```

Certbot edits the Nginx config in place to point at the issued
cert/key and sets up its own renewal timer (`systemctl status
certbot.timer`) — no further action needed for renewal.

### 6. Verify

```bash
curl -I https://transfer.ashwanitiwari.com/
curl https://transfer.ashwanitiwari.com/health
```

Open the site in two browsers/devices, drag a file into the sender view,
and confirm the receiver (via the QR code or `/join/<code>` link) can
accept and download it.

### Updating

```bash
cd PeerBridge
git pull
docker compose up -d --build
```

---

## Option C: Vercel (frontend) + Render (backend)

This splits the two responsibilities server.js normally bundles together:

- **Vercel** serves the Next.js app itself (`transfer.ashwanitiwari.com`) — Vercel's standard framework build, no custom server involved.
- **Render** runs *only* the WebSocket signaling relay, via the new [server/standalone.js](server/standalone.js) — a plain Node/`ws` server with no Next.js dependency, exposing `/ws` and a `/health` check.

The two talk to each other over `wss://`, which isn't subject to the
same-origin restrictions `fetch` has, so cross-domain works fine.

### 1. Deploy the signaling backend to Render, from render.yaml

Use the **Blueprint** flow rather than manually filling in the "New Web
Service" form — [render.yaml](render.yaml) already pins the correct
Build/Start commands as code, which is what avoids the exact problem
this guide originally ran into (Render's wizard silently auto-filling a
Next.js build command onto a service that must never run one).

1. In the [Render dashboard](https://dashboard.render.com), **New +** → **Blueprint**.
2. Connect **`userAshwani/PeerBridge`**, branch `main`. Render detects [render.yaml](render.yaml) and shows one service to create: **`peerbridge-ws`**.
3. Click **Apply** / **Create New Resources**. Render provisions it using exactly the config in the file — `npm install` as the build command, `npm run start:ws` as the start command, the `/health` path as its health check, free plan, `NODE_ENV=production` — no fields to fill in or get wrong.
4. Watch the logs for `> PeerBridge signaling server ready on http://0.0.0.0:<port> (ws: /ws)` — not anything mentioning `next build` or `Turbopack`.
5. Verify:
   ```bash
   curl https://peerbridge-ws-xxxx.onrender.com/health
   ```

**Already have a manually created `peerbridge-ws` service from before?**
Either fix its Build Command by hand (**Settings** → Build Command →
`npm install`, deleting any `&& npm run build`), or delete that service
and create a fresh one via the Blueprint flow above — either works, the
Blueprint just makes it impossible to mis-set going forward, since
future edits happen in `render.yaml` (committed, reviewed, pushed) 
instead of a dashboard form.

**Auto-Deploy** is on by default for Blueprint services — confirm under
**Settings → Build & Deploy** on the service. Every push to `main` (to
`render.yaml` or any other file) redeploys it automatically; a
`render.yaml` change also updates the service's own settings, not just
its code.

Optionally give it a custom subdomain too (e.g. `ws.ashwanitiwari.com`) the
same way as step 3 in Option A — a second `CNAME` at your DNS provider,
Render auto-issues its own cert for it. Using the default `onrender.com`
hostname directly is simpler and works just as well; the examples below
assume that.

### 2. Deploy the frontend to Vercel

1. In the [Vercel dashboard](https://vercel.com/new), import **`userAshwani/PeerBridge`**.
2. Framework preset: **Next.js** (auto-detected). Leave the build command as `next build` (Vercel ignores `server.js` entirely — it only matters for Options A/B).
3. **Environment Variables** — add:
   - `NEXT_PUBLIC_SIGNALING_URL` = `wss://peerbridge-ws-xxxx.onrender.com/ws` (the Render URL from step 1, with `wss://` and the `/ws` path — this is what makes [lib/signaling-client.ts](lib/signaling-client.ts) point at Render instead of same-origin).
4. Deploy.

### 3. Point `transfer.ashwanitiwari.com` at Vercel

1. In the Vercel project, **Settings** → **Domains** → add `transfer.ashwanitiwari.com`.
2. Vercel shows you a DNS target — for a subdomain it's a `CNAME` to `cname.vercel-dns.com` (Vercel's dashboard gives you the exact current value; use that, not this doc, if they differ).
3. At your DNS provider for `ashwanitiwari.com`, add that `CNAME` record for the `transfer` host.
4. Vercel auto-provisions and renews SSL once DNS verifies (usually minutes).

### 4. Verify end to end

```bash
curl -I https://transfer.ashwanitiwari.com/
curl https://peerbridge-ws-xxxx.onrender.com/health
```

Open the site, drag in a file, and confirm the QR/room-code flow works —
watch the [RelayStatusBadge](components/RelayStatusBadge.tsx) at the top:
it connects straight to the Render backend, so a cold Render instance
shows "Waking secure P2P signaling relay…" here exactly like it would in
Option A, even though the page itself loaded instantly from Vercel.

The same optional keep-alive-ping setup from Option A applies here —
point it at `https://peerbridge-ws-xxxx.onrender.com/health` instead of
`/api/health` on your own domain, since that's the Render service now.

### Updating

Both Vercel and Render auto-deploy on push to `main` by default — one
`git push` updates both halves. To double-check it's actually on for
your project:

- **Vercel**: project → **Settings** → **Git** — the connected repo/branch
  is shown there; as long as it's connected, every push deploys. There's
  no separate "auto-deploy" switch to miss.
- **Render**: `peerbridge-ws` → **Settings** → **Build & Deploy** →
  **Auto-Deploy** should read **Yes**. If it was ever switched to
  **No** (e.g. while debugging a bad deploy), flip it back.

Push a trivial commit (e.g. touch `DEPLOY.md`) and watch both
dashboards' **Deploys**/**Deployments** tab pick it up automatically as
a sanity check.

---

## Notes (all options)

- `server.js` runs the Next.js app, the `/ws` signaling endpoint, and a
  `/health` (`/ping`, `/api/health`) check all on one process/port — so
  only a single upstream is ever needed, whether that's Render's own
  routing or your Nginx `proxy_pass`.
- No file data ever reaches either host — the server only relays SDP/ICE
  signaling messages between two browsers; the transfer itself is a
  direct WebRTC `RTCDataChannel` connection.
- **Cross-network / international transfers need a TURN server —
  STUN alone is not enough.** STUN only resolves "easy" NATs
  (full-cone, restricted-cone); it cannot traverse symmetric NAT, which
  is common on cellular/carrier networks and many corporate firewalls.
  Two peers on genuinely different networks or countries hit this often
  enough that without TURN, a real fraction of transfers will get stuck
  showing "Connected" and never actually move data (the app now detects
  this specific stuck state after ~18s and shows an error instead of
  hanging silently — but a TURN server is the actual fix, not just
  better error messaging).

  1. Sign up for a free TURN provider — [Metered.ca](https://www.metered.ca/tools/openrelay/) has a generous free tier and the simplest setup; Cloudflare Calls and Twilio also work.
  2. From their dashboard, get a TURN URL (or comma-separated list of `turn:`/`turns:` URLs for UDP/TCP/TLS variants), a username, and a credential.
  3. Set three environment variables **on whichever host serves the frontend** (Vercel in Option C, or the single Render service in Option A/B — this is client-side WebRTC config, not backend):
     ```
     NEXT_PUBLIC_TURN_URLS=turn:standard.relay.metered.ca:80,turn:standard.relay.metered.ca:443
     NEXT_PUBLIC_TURN_USERNAME=<from the provider>
     NEXT_PUBLIC_TURN_CREDENTIAL=<from the provider>
     ```
  4. **Redeploy.** `NEXT_PUBLIC_*` variables are inlined into the client bundle at `next build` time, not read at runtime — setting them without rebuilding does nothing.
  5. [lib/webrtc.ts](lib/webrtc.ts)'s `ICE_SERVERS` picks these up automatically once set (falls back to STUN-only, today's behavior, if they're unset).

  Without this, PeerBridge still works great for same-network or
  friendly-NAT transfers (most home Wi-Fi, most same-country transfers)
  — TURN specifically matters for the harder cases this product is
  explicitly meant to handle ("global, international" use).
- A transfer survives brief network blips automatically: the sender
  pauses and resumes from the same byte offset, and a dropped
  `RTCPeerConnection` gets one automatic ICE-restart attempt before
  giving up. What it does **not** do is survive a page reload or the
  sender closing their tab — because no file data is ever written to a
  server (the whole point of the zero-storage design), there is nothing
  to resume from once a tab is gone. Closing the sender's tab
  immediately invalidates the room code for new joins.
- Either side can cancel from the UI at any point; the other side is
  notified immediately and the room is freed.
