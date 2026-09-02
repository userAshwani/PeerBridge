# Deploying PeerBridge

Live setup: a single **Hostinger VPS**, managed with **CloudPanel**,
running the whole app (`transfer.ashwanitiwari.com`) as one Node
process via PM2, plus a self-hosted **TURN relay** (`coturn`) on the
same VPS for cross-country transfers. No Vercel, no Render, no Docker
— this is the only path documented here because it's the only one in
use.

Auto-deploy is wired up: every `git push` to `main` redeploys the live
site automatically via GitHub Actions (see the last section).

---

## 1. Point the domain at your VPS

DNS provider for `ashwanitiwari.com` → add an **A record**:

```
transfer.ashwanitiwari.com  →  <your VPS public IP>
```

Wait for it to resolve: `ping transfer.ashwanitiwari.com`.

> **Gotcha if this domain was ever on Vercel**: Vercel leaves behind
> its own `CNAME` record for the exact subdomain, and a specific
> record always beats a wildcard `*` record — even one that already
> points at your VPS. That leftover record is what shows Vercel's
> `404: DEPLOYMENT_NOT_FOUND` instead of your site. Fix: in Hostinger
> hPanel → **DNS/Nameservers**, find and delete that record.

## 2. Create the site in CloudPanel

1. CloudPanel → **Sites → + ADD SITE → Create a Node.js Site**.
2. **Domain Name**: `transfer.ashwanitiwari.com`
3. **Node.js Version**: latest LTS (Next.js 16 needs 20.9.0+).
4. **App Port**: pick one not already used by another site on this VPS
   (CloudPanel rejects duplicates) — e.g. `3001`. Remember it.
5. Note the **Site User** it generates (e.g. `ashwanitiwari-transfer`)
   and its password — you'll SSH in as this user.
6. Create the site.

## 3. Give the VPS access to the (private) GitHub repo

The repo is private, so plain `git clone`/`git pull` over HTTPS won't
work non-interactively — GitHub disabled password auth for git years
ago. Use a **read-only Deploy Key** instead, scoped to just this repo:

```bash
ssh ashwanitiwari-transfer@<your-vps-ip>
ssh-keygen -t ed25519 -C "vps-deploy-key" -f ~/.ssh/github_repo_deploy -N ""
cat ~/.ssh/github_repo_deploy.pub
```

Copy that public key. On GitHub: repo → **Settings → Deploy keys →
Add deploy key** → paste it, leave **"Allow write access" unchecked**
→ **Add key**.

Back on the VPS, tell SSH to use this key for GitHub, specifically:

```bash
cat >> ~/.ssh/config <<'EOF'
Host github.com
  IdentityFile ~/.ssh/github_repo_deploy
  IdentitiesOnly yes
EOF
chmod 600 ~/.ssh/config
```

## 4. Deploy the code

```bash
cd ~/htdocs/transfer.ashwanitiwari.com
ls -la && rm -rf ./*          # clear CloudPanel's placeholder file first

git clone git@github.com:userAshwani/PeerBridge.git .
npm install --include=dev
npm run build
```

`--include=dev` matters: Tailwind/TypeScript/ESLint are
`devDependencies` — needed to build, not to run.

## 5. Run it with PM2

```bash
npm install -g pm2
PORT=3001 pm2 start npm --name peerbridge -- start   # match your App Port from step 2
pm2 save
pm2 startup   # prints one sudo command — copy-paste and run it, then `pm2 save` again
```

`pm2 list` should show exactly one `peerbridge` process, `online`.

## 6. Enable SSL

Site → **SSL/TLS** tab → **New Let's Encrypt Certificate** →
`transfer.ashwanitiwari.com` → Create. Renews automatically.

## 7. Confirm the WebSocket path works

Open `https://transfer.ashwanitiwari.com`, create a room, check the
browser console for a clean signaling connection. If `wss://` fails to
upgrade, open the site's **Vhost** tab in CloudPanel and confirm the
`location /` block has:
```
proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
```

---

## 8. TURN server (required for cross-country transfers)

STUN alone can't traverse symmetric/carrier-grade NAT — common between
different countries (confirmed in practice: India↔USA transfers hung
indefinitely without this). `coturn`, self-hosted on the same VPS,
fixes it at **$0 extra cost** (just counts against the VPS's own
bandwidth — no third-party per-GB billing like Cloudflare, no cap like
Metered's free tier).

### a. DNS + install

`turn.ashwanitiwari.com` already resolves to your VPS if you have a
wildcard `* → VPS IP` record; otherwise add an explicit `A` record for
it. Then, as **root**:

```bash
ssh root@<your-vps-ip>
apt update && apt install -y coturn certbot
```

### b. Get a certificate

CloudPanel's Nginx is already using port 80, so stop it first:
```bash
systemctl stop nginx
certbot certonly --standalone -d turn.ashwanitiwari.com --agree-tos --email you@example.com --no-eff-email
systemctl start nginx
```

### c. Configure coturn

```bash
cat > /etc/turnserver.conf <<'EOF'
listening-port=3478
tls-listening-port=5349
min-port=49160
max-port=49999

external-ip=YOUR_VPS_IP

realm=turn.ashwanitiwari.com
server-name=turn.ashwanitiwari.com

lt-cred-mech
user=peerbridge:YOUR-STRONG-PASSWORD

cert=/etc/letsencrypt/live/turn.ashwanitiwari.com/fullchain.pem
pkey=/etc/letsencrypt/live/turn.ashwanitiwari.com/privkey.pem

fingerprint
no-multicast-peers
no-cli
log-file=/var/log/turnserver.log
EOF

sed -i 's/#TURNSERVER_ENABLED=1/TURNSERVER_ENABLED=1/' /etc/default/coturn
systemctl enable coturn
systemctl restart coturn
systemctl status coturn   # should show active (running)
```

### d. Open the ports — both firewalls

A Hostinger VPS can have **two separate firewalls**; both need these
ports open, or coturn will look correctly configured and still fail
silently.

**Inside the VPS (`ufw`)**:
```bash
ufw allow 22/tcp
ufw allow 3478
ufw allow 5349
ufw allow 49160:49999/udp
ufw allow 49160:49999/tcp
ufw reload
```

**Hostinger's edge firewall** (separate from the VM entirely — only
reachable via hPanel, not SSH): hPanel → **VPS → your server →
Firewall**. If a restrictive profile is attached, add rules allowing
(source `0.0.0.0/0`): TCP+UDP `3478`, TCP+UDP `5349`, TCP+UDP
`49160-49999`, and TCP `22` if it's locked to a specific IP (that
would also block automated SSH deploys, see below).

> **Why the relay port range is this wide**: the app can open several
> parallel connections per large-file transfer (see the "Parallel
> connections" note in [lib/webrtc.ts](lib/webrtc.ts)), each needing
> its own relay allocation when TURN is in play — and several users
> can be transferring at once. 840 ports gives real headroom for that
> without needing to revisit it later.

### e. Test it, before touching the app

Open [Trickle ICE](https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/) — a small public WebRTC diagnostics page, safe to use and close when done, nothing persists. Clear the default servers and add:

| URI | username | credential |
|---|---|---|
| `turn:turn.ashwanitiwari.com:3478` | `peerbridge` | *(your password)* |
| `turns:turn.ashwanitiwari.com:5349?transport=tcp` | `peerbridge` | *(your password)* |

Click **Gather candidates** — you need at least one row with **`typ
relay`**. A UDP relay candidate on `:3478` is enough for TURN to work
in practice, even if the TCP/TLS `:5349` variant shows a connection
error (that just means the TLS fallback path isn't reachable — worth
revisiting later, not blocking).

### f. Point the app at it

```bash
cd ~/htdocs/transfer.ashwanitiwari.com
cat > .env.production.local <<'EOF'
NEXT_PUBLIC_TURN_URLS=turn:turn.ashwanitiwari.com:3478,turns:turn.ashwanitiwari.com:5349?transport=tcp
NEXT_PUBLIC_TURN_USERNAME=peerbridge
NEXT_PUBLIC_TURN_CREDENTIAL=YOUR-STRONG-PASSWORD
EOF

npm run build
pm2 restart peerbridge
```

This file is git-ignored (`.env*` in `.gitignore`) — safe to hold a
secret, and it survives every future `git push` deploy without
redoing this step.

---

## 9. Auto-deploy on every `git push`

[.github/workflows/deploy.yml](.github/workflows/deploy.yml) SSHes
into the VPS on every push to `main` and redeploys. Set it up entirely
from the VPS SSH session — no need to touch your own PC, and the
private key never has to leave the server except to paste into GitHub
once.

### a. Generate a dedicated login key for GitHub Actions → VPS

```bash
ssh-keygen -t ed25519 -C "github-deploy" -f ~/.ssh/github_deploy -N ""
cat ~/.ssh/github_deploy.pub >> ~/.ssh/authorized_keys
cat ~/.ssh/github_deploy
```
Copy that last output (the private key, including the `BEGIN`/`END` lines).

### b. Add GitHub repo secrets

Repo → **Settings → Secrets and variables → Actions → New repository
secret**:

| Secret | Value |
|---|---|
| `VPS_HOST` | your VPS IP |
| `VPS_USER` | the CloudPanel site user |
| `VPS_SSH_KEY` | what you copied in step a |
| `VPS_PORT` | `22` (unless changed) |

Then clean up: `rm ~/.ssh/github_deploy` — GitHub now holds the only
copy it needs.

### c. Done

Push to `main` from any machine and the workflow runs `git fetch` +
`git reset --hard origin/main` + `npm install --include=dev` +
`npm run build` + `pm2 restart peerbridge` on the VPS automatically —
check progress under the repo's **Actions** tab.

Two non-obvious things the workflow already accounts for, worth
knowing if you ever touch it:
- It explicitly sources `nvm` and selects the right Node version
  before running `npm`/`node` — a plain non-interactive `ssh host
  'command'` session doesn't load the shell startup files `nvm` hooks
  into, so without this it silently falls back to an older system
  Node.
- It authenticates to GitHub over SSH using the same kind of repo
  Deploy Key from step 3 above (already set up on the VPS by the time
  you get here) — not the `VPS_SSH_KEY` secret, which is a *different*
  key pair used only for GitHub Actions to log into the VPS itself.

---

## Notes

- No file data ever touches the server — it only relays SDP/ICE
  signaling messages between two browsers; the transfer itself is a
  direct WebRTC `RTCDataChannel` connection (falling back to the TURN
  relay above when a direct path isn't possible).
- A transfer survives brief network blips: the sender resumes from the
  same byte offset, and a dropped `RTCPeerConnection` gets one
  automatic ICE-restart attempt. It does **not** survive a page reload
  or the sender closing their tab — no file data is ever stored
  server-side, so there's nothing to resume from once the browser
  holding it is gone. Closing the sender's tab immediately invalidates
  the room code.
- Either side can cancel from the UI at any point; the other side is
  notified immediately and the room is freed.
- If no `NEXT_PUBLIC_TURN_*` env vars are set at build time,
  [lib/webrtc.ts](lib/webrtc.ts) falls back to a public shared TURN
  relay (Metered's Open Relay Project) — fine for a quick local
  checkout, not reliable enough for production (this is exactly what
  Step 8 above replaces for the live deployment).
