# Deploying PeerBridge on your Hostinger VPS (CloudPanel)

Vercel and Render are no longer used — everything (frontend + WebSocket
signaling) now runs as **one Node process** on your VPS, managed
through CloudPanel, serving `transfer.ashwanitiwari.com` directly.

[server.js](server.js) already serves the Next.js app and the `/ws`
signaling endpoint on a single port — that's exactly what a CloudPanel
"Node.js Site" expects, no extra setup needed on the code side.

---

## 1. Point the domain at your VPS

In your DNS provider for `ashwanitiwari.com`, add/edit an **A record**:

```
transfer.ashwanitiwari.com  →  <your VPS public IP>
```

(The same IP CloudPanel's own dashboard/sites list is running on.)
Wait for it to resolve before continuing — `ping transfer.ashwanitiwari.com`.

## 2. Create the site in CloudPanel

1. CloudPanel → **Sites → + ADD SITE → Create a Node.js Site**.
2. **Domain Name**: `transfer.ashwanitiwari.com`
3. **Node.js Version**: 20 or newer (Next.js 16 requires it).
4. Leave/set the **Site User** — CloudPanel generates one; note the
   username, you'll SSH in as this user.
5. Create the site.

## 3. Deploy the code over SSH

```bash
ssh <site-user>@<your-vps-ip>
cd ~/htdocs/transfer.ashwanitiwari.com

# CloudPanel may drop a placeholder file here — clear it first
ls -la
rm -rf ./*

git clone https://github.com/userAshwani/PeerBridge.git .
npm install --include=dev
npm run build
```

`--include=dev` matters: Tailwind/TypeScript/ESLint are devDependencies
needed to build, not to run — same reason this was needed on Render.

## 4. Set the app port and start it with PM2

1. In CloudPanel, open the site → **Node.js** tab → set **App Port**
   to `3000` (or any free port — just remember it, it has to match
   step below). Save — this updates CloudPanel's Nginx vhost to proxy
   the domain to `127.0.0.1:3000`.
2. Back over SSH:
   ```bash
   npm install -g pm2
   PORT=3000 pm2 start npm --name peerbridge -- start
   pm2 save
   pm2 startup   # prints one sudo command — copy-paste and run it
   ```
   `pm2 startup` + `pm2 save` makes the app survive a VPS reboot.

## 5. Enable SSL

Site → **SSL/TLS** tab → **New Let's Encrypt Certificate** →
`transfer.ashwanitiwari.com` → Create. CloudPanel renews it
automatically — nothing else to do.

## 6. Confirm the WebSocket path works

CloudPanel's Node.js vhost proxies WebSocket upgrades by default in
current versions. Open `https://transfer.ashwanitiwari.com`, create a
room, and check the browser console — you should see the signaling
socket connect with no errors. If it fails to upgrade (visible as a
failed `wss://` connection in the Network tab), open the site's
**Vhost** tab in CloudPanel and confirm the `location /` block contains:

```
proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
```

Add them if missing and reload.

## 7. TURN server

Handled separately in [TURN-SETUP.md](TURN-SETUP.md) — it runs
alongside this on the same VPS (`coturn` listens on 3478/5349, this
app sits behind CloudPanel's Nginx on 443, no conflict). Do that guide
next if you haven't already; without it, cross-country transfers will
still fail the same way they did on Render.

---

## Auto-deploy on every `git push`

A GitHub Actions workflow is already committed at
[.github/workflows/deploy.yml](.github/workflows/deploy.yml) — it
SSHes into the VPS and re-deploys on every push to `main`. To activate
it:

### a. Create a dedicated deploy key

```bash
ssh-keygen -t ed25519 -C "github-deploy" -f deploy_key -N ""
```

This makes two files: `deploy_key` (private) and `deploy_key.pub`
(public).

### b. Authorize it on the VPS

```bash
cat deploy_key.pub | ssh <site-user>@<your-vps-ip> "cat >> ~/.ssh/authorized_keys"
```

### c. Add GitHub repo secrets

GitHub repo → **Settings → Secrets and variables → Actions → New
repository secret** — add all four:

| Secret | Value |
|---|---|
| `VPS_HOST` | your VPS IP |
| `VPS_USER` | the CloudPanel site user |
| `VPS_SSH_KEY` | the full contents of `deploy_key` (the private key) |
| `VPS_PORT` | `22` (unless you changed SSH's port) |

### d. Done

Push to `main` from any laptop/PC and GitHub Actions runs `git reset
--hard origin/main`, rebuilds, and `pm2 restart peerbridge`
automatically — check progress under the repo's **Actions** tab. Delete
`deploy_key`/`deploy_key.pub` from your local machine once step c is
done; only the VPS and GitHub need to hold onto them.
