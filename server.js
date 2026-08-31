// Production custom server: serves Next.js and the WebSocket signaling
// endpoint from a single Node process on a single PORT, so the whole app
// runs as one Web Service (VPS + Nginx, or a single-instance host like
// Render's free tier).

const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");
const { WebSocketServer } = require("ws");
const { attachSignaling } = require("./server/signaling");

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOST || "0.0.0.0";
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// Paths an uptime monitor can hit to keep a free-tier instance awake and
// to satisfy the host's own health check.
const HEALTH_PATHS = new Set(["/health", "/ping", "/api/health"]);

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);

    if (req.method === "GET" && HEALTH_PATHS.has(parsedUrl.pathname)) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", uptime: process.uptime() }));
      return;
    }

    handle(req, res, parsedUrl);
  });

  const wss = new WebSocketServer({ noServer: true });
  attachSignaling(wss);

  server.on("upgrade", (request, socket, head) => {
    const { pathname } = parse(request.url);
    if (pathname === "/ws") {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  server.listen(port, () => {
    console.log(`> PeerBridge ready on http://${hostname}:${port} (ws: /ws)`);
  });
});
