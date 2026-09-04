// Thin client for the /ws signaling endpoint (server/signaling.js in the
// main repo) — only handles room bookkeeping and SDP/ICE relay, never file
// bytes. Ported near-verbatim from the web app's lib/signaling-client.ts:
// React Native's global WebSocket is API-compatible with the browser's, so
// nothing here is platform-specific.

type Listener<T> = (payload: T) => void;

export interface SignalingEvents {
  open: undefined;
  close: undefined;
  error: { message: string };
  "room-created": { roomId: string; peerId: string };
  "room-joined": { roomId: string; peerId: string; senderId: string };
  "peer-joined": { peerId: string; role: "sender" | "receiver" };
  "peer-left": { peerId: string; role: "sender" | "receiver" };
  cancelled: { by: "sender" | "receiver" };
  signal: { peerId: string; data: RTCSignalData };
}

// connId 0 is always the primary (only) connection in this mobile client —
// no parallel-connections feature here (see MOBILE-APP-SPEC.md §6), but the
// field is still required by the shared wire format so the web app's
// server-side relay (which never inspects it) and any peer that *does*
// support parallel connections stay compatible.
export type RTCSignalData =
  | { sdp: RTCSessionDescriptionInit; connId: number }
  | { candidate: RTCIceCandidateInit; connId: number };

const MAX_RECONNECT_DELAY_MS = 8000;

export class SignalingClient {
  private ws: WebSocket | null = null;
  private url: string;
  private intentionalClose = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private listeners: { [K in keyof SignalingEvents]?: Listener<SignalingEvents[K]>[] } = {};

  constructor(url: string) {
    this.url = url;
  }

  on<K extends keyof SignalingEvents>(event: K, listener: Listener<SignalingEvents[K]>): void {
    const map = this.listeners as Record<string, Listener<any>[]>;
    (map[event as string] ??= []).push(listener);
  }

  private emit<K extends keyof SignalingEvents>(event: K, payload: SignalingEvents[K]): void {
    this.listeners[event]?.forEach((l) => l(payload));
  }

  removeAllListeners(): void {
    this.listeners = {};
  }

  connect(): void {
    this.intentionalClose = false;
    this.reconnectAttempt = 0;
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
    ws.onmessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data as string);
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
        { once: true } as AddEventListenerOptions,
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
