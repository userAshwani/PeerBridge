# TURN server on your Hostinger VPS (simple version)

## Why you need this

Your app already works fine when both people are on friendly networks.
It gets stuck when one person is far away (like India↔USA) because
their connection has to cross carrier-grade NAT, which only a **TURN
relay server** can get through. Right now it's falling back to a free
public relay that isn't reliable. This guide sets up your own, on the
same VPS that's already running `transfer.ashwanitiwari.com` — no
extra cost, no third-party billing.

This is separate from CloudPanel/website stuff — `coturn` isn't a
website, it's a background service, so none of this touches your
Node.js site.

---

## Step 1 — Point a subdomain at your VPS (probably already done)

You already have a wildcard DNS record (`* → your VPS IP`) in
Hostinger, which means `turn.ashwanitiwari.com` **already resolves to
your VPS** with nothing extra to do. Confirm:

```bash
ping turn.ashwanitiwari.com
```

If that doesn't return your VPS IP, add an **A record**: Name
`turn`, Type `A`, Content = your VPS IP, in Hostinger's DNS page.

## Step 2 — SSH in as root and install coturn

```bash
ssh root@<your-vps-ip>
apt update && apt install -y coturn certbot
```

## Step 3 — Get a certificate for the subdomain

```bash
certbot certonly --standalone -d turn.ashwanitiwari.com
```

If this fails saying port 80 is busy, stop first with
`systemctl stop nginx` (CloudPanel's Nginx), run certbot, then
`systemctl start nginx` again.

## Step 4 — Configure coturn

Replace everything in `/etc/turnserver.conf` with this (edit the two
lines marked `# CHANGE THIS`):

```
listening-port=3478
tls-listening-port=5349
min-port=49160
max-port=49200

external-ip=YOUR_VPS_IP_HERE
# CHANGE THIS ^ to your VPS's actual public IP

realm=turn.ashwanitiwari.com
server-name=turn.ashwanitiwari.com

lt-cred-mech
user=peerbridge:YOUR-STRONG-PASSWORD-HERE
# CHANGE THIS ^ password — this is what your app authenticates with

cert=/etc/letsencrypt/live/turn.ashwanitiwari.com/fullchain.pem
pkey=/etc/letsencrypt/live/turn.ashwanitiwari.com/privkey.pem

fingerprint
no-multicast-peers
no-cli
log-file=/var/log/turnserver.log
```

Start it:

```bash
sed -i 's/#TURNSERVER_ENABLED=1/TURNSERVER_ENABLED=1/' /etc/default/coturn
systemctl enable coturn
systemctl restart coturn
systemctl status coturn
```

You should see `active (running)` in green.

## Step 5 — Open the ports (the step most people miss)

There are potentially **two separate firewalls** on a Hostinger VPS —
you need both open, not just one:

**a) Inside the VPS (`ufw`):**
```bash
ufw allow 3478
ufw allow 5349
ufw allow 49160:49200/udp
ufw allow 49160:49200/tcp
```

**b) Hostinger's own VPS firewall (a separate, edge-level firewall —
this is very likely why your GitHub Actions SSH connection is also
timing out right now):** In hPanel → **VPS → your server → Firewall**,
check whether a firewall profile is attached and what rules exist. If
it's restricted to specific IPs, add rules allowing (source: anywhere
/ 0.0.0.0/0):
- TCP `3478`, UDP `3478`
- TCP `5349`, UDP `5349`
- TCP+UDP `49160-49200`
- TCP `22` (SSH) — if this is currently locked to your own IP only, that's exactly what's blocking GitHub Actions from deploying too.

Skipping this step is the #1 reason a TURN server "looks" configured
correctly but still doesn't work — the certificate and coturn config
can be perfect and it'll still fail silently if the edge firewall
drops the traffic.

## Step 6 — Test it works, before touching the app

Open [Trickle
ICE](https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/),
clear the default servers, and add:

| URI | username | credential |
|---|---|---|
| `turn:turn.ashwanitiwari.com:3478` | `peerbridge` | *(your password)* |
| `turns:turn.ashwanitiwari.com:5349?transport=tcp` | `peerbridge` | *(your password)* |

Click **Gather candidates**. You need to see a line with **`typ
relay`**. If you don't, it's Step 5 — go back and double-check both
firewalls.

## Step 7 — Point the app at it

Since you're deploying from your VPS repo directly (not Vercel
anymore), add these to a file the app reads at build time:

```bash
cd ~/htdocs/transfer.ashwanitiwari.com
nano .env.production.local
```

Paste in (this file is git-ignored, safe to keep secrets in):

```
NEXT_PUBLIC_TURN_URLS=turn:turn.ashwanitiwari.com:3478,turns:turn.ashwanitiwari.com:5349?transport=tcp
NEXT_PUBLIC_TURN_USERNAME=peerbridge
NEXT_PUBLIC_TURN_CREDENTIAL=YOUR-STRONG-PASSWORD-HERE
```

Save, then rebuild and restart (env vars are baked in at build time,
not read live):

```bash
npm run build
pm2 restart peerbridge
```

## Step 8 — Retest with your USA friend

Same transfer that failed before. It should connect now. If it still
fails, the app's error message will say exactly what happened — send
me that text.

---

## Cost

$0 beyond the VPS you already pay for.
