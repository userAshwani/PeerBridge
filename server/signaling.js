// WebSocket signaling server for PeerBridge.
// Responsible only for room bookkeeping and relaying WebRTC SDP/ICE messages.
// No file data ever passes through here.

const { randomUUID } = require("crypto");

/** @typedef {{ id: string, ws: import('ws').WebSocket, role: 'sender'|'receiver' }} Peer */

/**
 * @param {import('ws').WebSocketServer} wss
 */
function attachSignaling(wss) {
  /** @type {Map<string, { sender: Peer|null, receivers: Map<string, Peer> }>} */
  const rooms = new Map();

  const getRoom = (roomId) => {
    let room = rooms.get(roomId);
    if (!room) {
      room = { sender: null, receivers: new Map() };
      rooms.set(roomId, room);
    }
    return room;
  };

  const cleanupEmptyRoom = (roomId) => {
    const room = rooms.get(roomId);
    if (room && !room.sender && room.receivers.size === 0) {
      rooms.delete(roomId);
    }
  };

  const send = (ws, payload) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  };

  wss.on("connection", (ws) => {
    const peerId = randomUUID();
    let currentRoomId = null;
    let currentRole = null;

    ws.isAlive = true;
    ws.on("pong", () => {
      ws.isAlive = true;
    });

    const leaveCurrentRoom = () => {
      if (!currentRoomId) return;
      const room = rooms.get(currentRoomId);
      if (room) {
        if (currentRole === "sender" && room.sender?.id === peerId) {
          room.sender = null;
          for (const receiver of room.receivers.values()) {
            send(receiver.ws, { type: "peer-left", peerId, role: "sender" });
          }
        } else if (currentRole === "receiver") {
          room.receivers.delete(peerId);
          if (room.sender) {
            send(room.sender.ws, { type: "peer-left", peerId, role: "receiver" });
          }
        }
        cleanupEmptyRoom(currentRoomId);
      }
      currentRoomId = null;
      currentRole = null;
    };

    ws.on("message", (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return send(ws, { type: "error", message: "Invalid JSON" });
      }

      const { type } = msg;

      switch (type) {
        case "create-room": {
          const { roomId } = msg;
          if (!roomId || typeof roomId !== "string") {
            return send(ws, { type: "error", message: "roomId required" });
          }
          const room = getRoom(roomId);
          if (room.sender && room.sender.ws.readyState === room.sender.ws.OPEN) {
            return send(ws, { type: "error", message: "Room already has a sender" });
          }
          // A stale sender (socket no longer open, e.g. reconnecting after
          // a dropped connection) doesn't get to keep the room.
          room.sender = { id: peerId, ws, role: "sender" };
          currentRoomId = roomId;
          currentRole = "sender";
          send(ws, { type: "room-created", roomId, peerId });

          // Reclaiming a room that already had one or more receivers
          // waiting (e.g. this sender's own signaling socket dropped and
          // reconnected mid-negotiation) — those receivers joined before
          // this socket existed, so without this they'd never learn a
          // sender came back and would just sit there. Tell the sender
          // about each one as if they'd just joined.
          for (const receiver of room.receivers.values()) {
            send(ws, { type: "peer-joined", peerId: receiver.id, role: "receiver" });
          }
          break;
        }

        case "join-room": {
          const { roomId } = msg;
          if (!roomId || typeof roomId !== "string") {
            return send(ws, { type: "error", message: "roomId required" });
          }
          const room = rooms.get(roomId);
          if (!room || !room.sender) {
            return send(ws, { type: "error", message: "Room not found" });
          }
          room.receivers.set(peerId, { id: peerId, ws, role: "receiver" });
          currentRoomId = roomId;
          currentRole = "receiver";
          send(ws, { type: "room-joined", roomId, peerId, senderId: room.sender.id });
          send(room.sender.ws, { type: "peer-joined", peerId, role: "receiver" });
          break;
        }

        case "signal": {
          const { roomId, targetId, data } = msg;
          const room = rooms.get(roomId);
          if (!room) return;

          if (currentRole === "sender") {
            const target = targetId ? room.receivers.get(targetId) : null;
            if (target) send(target.ws, { type: "signal", peerId, data });
          } else if (currentRole === "receiver" && room.sender) {
            send(room.sender.ws, { type: "signal", peerId, data });
          }
          break;
        }

        case "leave-room": {
          leaveCurrentRoom();
          break;
        }

        case "cancel": {
          // An intentional abort, distinct from a plain disconnect, so the
          // other side can show "cancelled" instead of a generic drop. Does
          // its own room cleanup (rather than calling leaveCurrentRoom) so
          // the peer doesn't also get a follow-up "peer-left" for the same
          // departure.
          const { roomId } = msg;
          const room = rooms.get(roomId);
          if (room) {
            if (currentRole === "sender" && room.sender?.id === peerId) {
              room.sender = null;
              for (const receiver of room.receivers.values()) {
                send(receiver.ws, { type: "cancelled", by: "sender" });
              }
            } else if (currentRole === "receiver") {
              room.receivers.delete(peerId);
              if (room.sender) send(room.sender.ws, { type: "cancelled", by: "receiver" });
            }
            cleanupEmptyRoom(roomId);
          }
          currentRoomId = null;
          currentRole = null;
          break;
        }

        case "ping": {
          // App-level ping used by the frontend to measure round-trip
          // latency and to confirm the relay has actually finished waking
          // up from a free-tier cold start (not just that the TCP/HTTP
          // upgrade succeeded).
          send(ws, { type: "pong", ts: msg.ts });
          break;
        }

        default:
          send(ws, { type: "error", message: `Unknown message type: ${type}` });
      }
    });

    ws.on("close", leaveCurrentRoom);
    ws.on("error", leaveCurrentRoom);
  });

  const heartbeat = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) return ws.terminate();
      ws.isAlive = false;
      ws.ping();
    });
  }, 25000);

  wss.on("close", () => clearInterval(heartbeat));

  return { rooms };
}

module.exports = { attachSignaling };
