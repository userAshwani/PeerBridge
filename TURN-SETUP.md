# Fixing cross-country transfers: self-hosted TURN on your Hostinger VPS

## What actually happened

Your India↔India-nearby-network test worked. Your India↔USA test got
stuck. Both sides ran the exact same code — the difference is the
network path between them, and here's why:

- WebRTC always tries a **direct** connection first (STUN helps two
  peers discover their public IP/port so they can punch through NAT).
  This works fine when both sides are on networks with "easy" NAT
  (most home/office Wi-Fi) — which is why your nearby-network friend
  connected instantly.
- It does **not** work when either side sits behind **symmetric NAT or
  carrier-grade NAT (CGNAT)** — extremely common on mobile carriers and
  typical for long-distance international routing, since traffic
  between India and the USA usually crosses several ISPs/carriers, each
  potentially adding another layer of NAT. Direct connection becomes
  impossible, full stop — no amount of retrying fixes it.
- The only fix for that case is a **TURN server**: a relay both sides
  can always reach, which forwards the encrypted data between them.
- Your app already falls back to a TURN server when no custom one is
  configured — but that fallback is Metered's **public, shared,
  free-for-anyone** "Open Relay" pool (`openrelayproject`). It has no
  uptime guarantee and is commonly overloaded or unreachable. Your test
  proved exactly that: the browser found other candidates, but never a
  working `relay` one.

**The fix:** run your own TURN server. It's not a code problem —
[lib/webrtc.ts](lib/webrtc.ts) already fully supports a custom TURN
server via three env vars. You just need a real, reliable one behind
those env vars instead of the public fallback.

## Why your Hostinger VPS and not Cloudflare/Metered

- **Cloudflare Realtime TURN** is only free when paired with their SFU
  (a video-conferencing product this app doesn't use). Used standalone
  — which is what a file-transfer app needs — it bills **$0.05 per GB
  relayed**, with no free quota. That's real, ongoing cost tied
  directly to your users' transfer volume.
- **Metered's free tier** caps at 50GB/month, then bills.
- **Self-hosting `coturn`** (the standard open-source TURN server) on
  your existing paid Hostinger VPS costs **$0 extra** — you're already
  paying for that VPS, and TURN relay traffic just counts against the
  VPS's own bandwidth allowance like any other traffic. No per-GB TURN
  billing, no usage cap from a third party.

---

## Step 1 — Point a subdomain at your VPS

TURN over TLS (`turns:`, port 5349) needs a real certificate, which
needs a domain. In your DNS (wherever `ashwanitiwari.com` is managed):

- Add an **A record**: `turn.ashwanitiwari.com` → your Hostinger VPS's
  public IP address.
- Wait for it to resolve (`ping turn.ashwanitiwari.com` from your own
  machine — a couple of minutes usually, longer if TTL is high).

## Step 2 — SSH into the VPS and install coturn

```bash
ssh root@YOUR_VPS_IP
apt update && apt install -y coturn certbot
```

(Hostinger VPS plans are commonly Ubuntu/Debian — if yours uses a
different distro, the package name is the same, just swap `apt` for
your package manager.)

## Step 3 — Get a TLS certificate for the subdomain

```bash
# Stop nothing else needs to be running on port 80 for this to work
certbot certonly --standalone -d turn.ashwanitiwari.com
```

This writes the certificate to
`/etc/letsencrypt/live/turn.ashwanitiwari.com/fullchain.pem` and
`privkey.pem`.

## Step 4 — Configure coturn

Open `/etc/turnserver.conf` and replace its contents with:

```
listening-port=3478
tls-listening-port=5349

# Relay port range — the actual media/data flows through these. Keep
# it reasonably sized; this app only ever has one active relay session
# per transfer, so this range is generous, not a bottleneck.
min-port=49160
max-port=49200

# Your VPS's public IP — REPLACE with the real address.
external-ip=YOUR_VPS_IP

realm=turn.ashwanitiwari.com
server-name=turn.ashwanitiwari.com

# Static credential — one fixed username/password this app authenticates
# with. Matches the NEXT_PUBLIC_TURN_USERNAME/_CREDENTIAL model already
# in lib/webrtc.ts, so no app code changes are needed.
lt-cred-mech
user=peerbridge:CHOOSE-A-STRONG-PASSWORD-HERE

cert=/etc/letsencrypt/live/turn.ashwanitiwari.com/fullchain.pem
pkey=/etc/letsencrypt/live/turn.ashwanitiwari.com/privkey.pem

fingerprint
no-multicast-peers
no-cli
log-file=/var/log/turnserver.log
```

Replace:
- `YOUR_VPS_IP` with the VPS's actual public IPv4 address.
- `CHOOSE-A-STRONG-PASSWORD-HERE` with a long random password (this is
  the credential every visitor's browser will use — treat it like a
  shared secret, not a personal password; a leaked one just lets
  someone else relay traffic through your VPS, it doesn't expose your
  files).

Then enable the service:

```bash
sed -i 's/#TURNSERVER_ENABLED=1/TURNSERVER_ENABLED=1/' /etc/default/coturn
systemctl enable coturn
systemctl restart coturn
systemctl status coturn   # should show "active (running)"
```

## Step 5 — Open the firewall

```bash
ufw allow 3478/tcp
ufw allow 3478/udp
ufw allow 5349/tcp
ufw allow 5349/udp
ufw allow 49160:49200/udp
ufw allow 49160:49200/tcp
```

If Hostinger's control panel has its own separate cloud firewall
(distinct from `ufw` inside the VPS), open the same ports there too —
otherwise Hostinger's edge firewall blocks the traffic before it even
reaches `ufw`.

## Step 6 — Keep the certificate renewed without downtime

Certbot's renewal needs port 80 free, which conflicts with coturn
running. Add a renewal hook so coturn briefly stops/restarts around
renewal instead of you doing it by hand:

```bash
mkdir -p /etc/letsencrypt/renewal-hooks/deploy
cat > /etc/letsencrypt/renewal-hooks/deploy/coturn-restart.sh <<'EOF'
#!/bin/sh
systemctl restart coturn
EOF
chmod +x /etc/letsencrypt/renewal-hooks/deploy/coturn-restart.sh
```

Certbot auto-renews via its own systemd timer already installed by the
package — nothing else to schedule.

## Step 7 — Test the TURN server in isolation (before touching the app)

Open Google's public [Trickle ICE
tester](https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/)
in a browser, remove the default STUN/TURN entries, and add:

| URI | username | credential |
|---|---|---|
| `turn:turn.ashwanitiwari.com:3478` | `peerbridge` | *(your password)* |
| `turns:turn.ashwanitiwari.com:5349?transport=tcp` | `peerbridge` | *(your password)* |

Click **Gather candidates**. You must see at least one line with
**`typ relay`** in the output. If you don't, stop here and re-check
Steps 4–5 (firewall is the most common culprit) before moving on.

## Step 8 — Point the app at it

In Vercel → your project → **Settings → Environment Variables**, add
(Production, and Preview if you want previews to use it too):

```
NEXT_PUBLIC_TURN_URLS=turn:turn.ashwanitiwari.com:3478,turns:turn.ashwanitiwari.com:5349?transport=tcp
NEXT_PUBLIC_TURN_USERNAME=peerbridge
NEXT_PUBLIC_TURN_CREDENTIAL=CHOOSE-A-STRONG-PASSWORD-HERE
```

(the same password you set in Step 4).

**Redeploy** — `NEXT_PUBLIC_*` values are baked into the JavaScript
bundle at build time, not read at runtime, so a plain restart doesn't
pick them up.

## Step 9 — Retest with your USA friend

Once redeployed, repeat the exact transfer that failed before. Open
the browser console on either side — you should now see
`[PeerBridge] ICE connection state: connected` and the transfer should
proceed. If it still fails, the new error message will now say
specifically what went wrong (no candidates at all / no relay found /
relay found but still failed) — send me that exact text.

---

## Cost recap

$0 beyond your existing Hostinger VPS payment. TURN relay traffic
counts against that VPS's normal bandwidth allowance, same as any
other traffic it serves — no third-party per-GB billing, no monthly
cap from an external provider.
