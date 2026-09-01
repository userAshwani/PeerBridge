// Standalone signaling server — no Next.js involved.
//
// Used when the frontend and backend are deployed separately (e.g.
// frontend on Vercel, this on Render): the browser connects to this
// process directly over wss:// instead of a same-origin /ws path. See
// DEPLOY.md ("Option C: split — Vercel frontend + Render backend").
//
// For the single-service deployments (VPS/Docker, or Render running the
// whole app), server.js already bundles this alongside Next.js — this
// file just re-exposes the same signaling logic on its own HTTP server.

const { createServer } = require("http");
const { parse } = require("url");
const { WebSocketServer } = require("ws");
const { attachSignaling } = require("./signaling");

const hostname = process.env.HOST || "0.0.0.0";
const port = parseInt(process.env.PORT || "4000", 10);

const HEALTH_PATHS = new Set(["/health", "/ping", "/api/health", "/"]);

const server = createServer((req, res) => {
  const parsedUrl = parse(req.url, true);

  if (req.method === "GET" && HEALTH_PATHS.has(parsedUrl.pathname)) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", uptime: process.uptime(), service: "peerbridge-signaling" }));
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not found");
});

const wss = new WebSocketServer({ noServer: true });
attachSignaling(wss);

server.on("upgrade", (request, socket, head) => {
  const { pathname } = parse(request.url);
  if (pathname === "/ws" || pathname === "/") {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  } else {
    socket.destroy();
  }
});

server.listen(port, () => {
  console.log(`> PeerBridge signaling server ready on http://${hostname}:${port} (ws: /ws)`);
});
