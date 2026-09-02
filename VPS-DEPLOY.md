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

> **If `transfer.ashwanitiwari.com` was ever a Vercel domain**, Vercel
> left behind its own DNS record for that exact subdomain (a `CNAME`
> pointing at something like `*.vercel-dns.com`), and a specific
> subdomain record always wins over a wildcard `*` record even if the
> wildcard already points at your VPS. That leftover record is what
> shows Vercel's `404: DEPLOYMENT_NOT_FOUND` page instead of your VPS.
> Fix: in Hostinger hPanel → **DNS / Nameservers**, search "transfer",
> find that record, and either delete it (the existing `*` wildcard, if
> it already points to your VPS IP, then serves it automatically) or
> edit it into a plain **A** record pointing at your VPS IP. Give it a
> few minutes to propagate, then re-check.

## 2. Create the site in CloudPanel

1. CloudPanel → **Sites → + ADD SITE → Create a Node.js Site**.
2. **Domain Name**: `transfer.ashwanitiwari.com`
3. **Node.js Version**: 20 or newer (Next.js 16 requires it).
4. Leave/set the **Site User** — CloudPanel generates one; note the
   username, you'll SSH in as this user.
5. Create the site.

## 3. Deploy the code over SSH

You can log in as **either** the CloudPanel site user (`ashwanitiwari-transfer`,
password from the creation screen) **or root** — both work, but use
the site user for this app so files under `htdocs/` end up owned by
the account CloudPanel/Nginx expects; only reach for `root` if a
command specifically needs it (e.g. `apt install`, editing `ufw`).

```bash
ssh ashwanitiwari-transfer@<your-vps-ip>
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
   to a port not already used by another site on this VPS (CloudPanel
   will reject a duplicate — `3000` is commonly taken by the first
   Node site, e.g. `ashwanitiwari.com`; pick something free like
   `3001`). Remember it, it has to match the step below. Save — this
   updates CloudPanel's Nginx vhost to proxy the domain to
   `127.0.0.1:<port>`.
2. Back over SSH:
   ```bash
   npm install -g pm2
   PORT=3001 pm2 start npm --name peerbridge -- start
   pm2 save
   pm2 startup   # prints one sudo command — copy-paste and run it
   ```
   Replace `3001` with whatever port you actually set in step 1 — it
   must match exactly, since that's what CloudPanel's Nginx proxies
   to.
   `pm2 startup` + `pm2 save` makes the app survive a VPS reboot.
   `pm2 startup` prints one `sudo env PATH=... pm2 startup systemd ...`
   command — copy-paste and run that too, then `pm2 save` once more.

   If you ran `pm2 start` more than once while testing, run `pm2 list`
   to confirm there's exactly **one** `peerbridge` process (status
   `online`) — if you see duplicates, `pm2 delete <id>` the extras,
   then `pm2 save` again so the saved process list matches.

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

Do this entirely inside the **VPS SSH session you already have open**
— no need to touch your PC at all, and the private key never has to
leave the server except to paste it into GitHub once.

### a. Generate a dedicated deploy key, on the VPS

```bash
ssh-keygen -t ed25519 -C "github-deploy" -f ~/.ssh/github_deploy -N ""
```

### b. Authorize it for logins to this same account

```bash
cat ~/.ssh/github_deploy.pub >> ~/.ssh/authorized_keys
```

### c. Print the private key and copy it

```bash
cat ~/.ssh/github_deploy
```

Select and copy the **entire** output, including the
`-----BEGIN OPENSSH PRIVATE KEY-----` and `-----END...-----` lines.

### d. Add GitHub repo secrets

On github.com → your repo → **Settings → Secrets and variables →
Actions → New repository secret** — add all four:

| Secret | Value |
|---|---|
| `VPS_HOST` | your VPS IP |
| `VPS_USER` | `ashwanitiwari-transfer` (the site user) |
| `VPS_SSH_KEY` | paste what you copied in step c |
| `VPS_PORT` | `22` (unless you changed SSH's port) |

### e. Clean up the private key file on the VPS

```bash
rm ~/.ssh/github_deploy
```

Safe to delete — GitHub now holds the only copy it needs, and the
public half is already in `authorized_keys`.

### f. Done

Push to `main` from any laptop/PC and GitHub Actions runs `git reset
--hard origin/main`, rebuilds, and `pm2 restart peerbridge`
automatically — check progress under the repo's **Actions** tab.
