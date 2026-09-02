// Thin browser client for the /ws signaling endpoint in server/signaling.js.
// Only handles room bookkeeping and SDP/ICE relay — never file bytes.

import { Emitter } from "./emitter";

export interface SignalingEvents {
  open: void;
  close: void;
  error: { message: string };
  "room-created": { roomId: string; peerId: string };
  "room-joined": { roomId: string; peerId: string; senderId: string };
  "peer-joined": { peerId: string; role: "sender" | "receiver" };
  "peer-left": { peerId: string; role: "sender" | "receiver" };
  cancelled: { by: "sender" | "receiver" };
  signal: { peerId: string; data: RTCSignalData };
}

// connId distinguishes which RTCPeerConnection a given SDP/candidate
// belongs to when a transfer uses more than one in parallel (connId 0 is
// always the primary connection, used for every transfer; 1+ are the
// additional parallel connections used only for large files) — this
// server never inspects it, just relays it opaquely.
export type RTCSignalData =
  | { sdp: RTCSessionDescriptionInit; connId: number }
  | { candidate: RTCIceCandidateInit; connId: number };

/**
 * Resolves the signaling WebSocket URL. Defaults to same-origin `/ws`
 * (the single-process server.js deployment). Set NEXT_PUBLIC_SIGNALING_URL
 * (e.g. "wss://peerbridge-ws.onrender.com/ws") when the frontend and the
 * signaling backend are deployed separately — see DEPLOY.md.
 */
export function getSignalingUrl(): string {
  if (typeof window === "undefined") return "";
  const configured = process.env.NEXT_PUBLIC_SIGNALING_URL;
  if (configured) return configured;
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws`;
}

const MAX_RECONNECT_DELAY_MS = 8000;

export class SignalingClient extends Emitter<SignalingEvents> {
  private ws: WebSocket | null = null;
  private url = "";
  private intentionalClose = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;

  /**
   * Opens the signaling socket and keeps it open: an unexpected drop (a
   * free-tier host restarting/cold-sleeping mid-negotiation is a real,
   * observed cause — not just NAT traversal) triggers a backoff reconnect
   * rather than leaving the session stuck. Reconnecting re-emits "open",
   * which re-triggers whatever create-room/join-room the caller already
   * wired up to that event — no separate resume logic needed.
   */
  connect(url: string = getSignalingUrl()): void {
    this.intentionalClose = false;
    this.reconnectAttempt = 0;
    this.url = url;
    this.openSocket();
  }

  private openSocket(): void {
    const ws = new WebSocket(this.url);
    this.ws = ws;

    ws.onopen = () => {
      this.reconnectAttempt = 0;
      this.emit("open", undefined);
    };
    ws.onclose = () => {
      this.emit("close", undefined);
      if (!this.intentionalClose) this.scheduleReconnect();
    };
    ws.onerror = () => this.emit("error", { message: "WebSocket error" });
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        this.emit(msg.type, msg);
      } catch {
        this.emit("error", { message: "Malformed signaling message" });
      }
    };
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    const delay = Math.min(1000 * 2 ** this.reconnectAttempt, MAX_RECONNECT_DELAY_MS);
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.intentionalClose) this.openSocket();
    }, delay);
  }

  isOpen(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Forces an immediate reconnect attempt, bypassing any pending backoff
   * delay. Meant to be called when the page regains foreground/visibility
   * on mobile: the OS throttles background timers and network activity, so
   * the socket can silently drop while backgrounded (e.g. the user switches
   * to WhatsApp to share the room code) and the normal backoff timer may
   * not fire again until the tab is already active — this short-circuits
   * that wait instead of leaving the session looking stalled.
   */
  reconnectNow(): void {
    if (this.intentionalClose || this.isOpen()) return;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.openSocket();
  }

  private send(payload: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    } else {
      this.ws?.addEventListener(
        "open",
        () => this.ws?.send(JSON.stringify(payload)),
        { once: true },
      );
    }
  }

  createRoom(roomId: string): void {
    this.send({ type: "create-room", roomId });
  }

  joinRoom(roomId: string): void {
    this.send({ type: "join-room", roomId });
  }

  sendSignal(roomId: string, data: RTCSignalData, targetId?: string): void {
    this.send({ type: "signal", roomId, targetId, data });
  }

  sendCancel(roomId: string): void {
    this.send({ type: "cancel", roomId });
  }

  leaveRoom(): void {
    this.send({ type: "leave-room" });
  }

  close(): void {
    this.intentionalClose = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
    this.removeAllListeners();
  }
}
