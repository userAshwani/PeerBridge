# Deploying PeerBridge to a VPS

Target: a single VPS running Docker + Nginx, domain `transfer.ashwanitiwari.com`.

## 1. DNS

Point an `A` (and `AAAA`, if the VPS has IPv6) record for
`transfer.ashwanitiwari.com` at the VPS's public IP. Confirm propagation
before requesting a certificate:

```bash
dig +short transfer.ashwanitiwari.com
```

## 2. Install Docker, Docker Compose, Nginx, and Certbot on the VPS

```bash
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER   # log out/in to apply
```

## 3. Deploy the app container

```bash
git clone https://github.com/userAshwani/PeerBridge.git
cd PeerBridge
docker compose up -d --build
```

This builds the image from the [Dockerfile](Dockerfile) and starts the app
bound to `127.0.0.1:3000` (see [docker-compose.yml](docker-compose.yml)) —
not exposed publicly; Nginx is the only thing that talks to it directly.

## 4. Configure Nginx

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

## 5. Issue the TLS certificate

```bash
sudo certbot --nginx -d transfer.ashwanitiwari.com
```

Certbot edits the Nginx config in place to point at the issued
cert/key and sets up its own renewal timer (`systemctl status
certbot.timer`) — no further action needed for renewal.

## 6. Verify

```bash
curl -I https://transfer.ashwanitiwari.com/
```

Open the site in two browsers/devices, drag a file into the sender view,
and confirm the receiver (via the QR code or `/join/<code>` link) can
accept and download it.

## Updating

```bash
cd PeerBridge
git pull
docker compose up -d --build
```

## Notes

- `server.js` runs both the Next.js app and the `/ws` signaling endpoint
  in one process, so only one upstream (`127.0.0.1:3000`) is needed.
- No file data ever reaches this VPS — the server only relays SDP/ICE
  signaling messages between two browsers; the transfer itself is a
  direct WebRTC `RTCDataChannel` connection.
- If the VPS sits behind a symmetric NAT/firewall that a plain STUN
  handshake can't traverse, add a TURN server (e.g. `coturn`) and append
  its `urls`/`username`/`credential` to `ICE_SERVERS` in
  [lib/webrtc.ts](lib/webrtc.ts).
