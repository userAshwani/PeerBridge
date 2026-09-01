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

export type RTCSignalData =
  | { sdp: RTCSessionDescriptionInit }
  | { candidate: RTCIceCandidateInit };

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

export class SignalingClient extends Emitter<SignalingEvents> {
  private ws: WebSocket | null = null;

  connect(url: string = getSignalingUrl()): void {
    this.ws = new WebSocket(url);

    this.ws.onopen = () => this.emit("open", undefined);
    this.ws.onclose = () => this.emit("close", undefined);
    this.ws.onerror = () => this.emit("error", { message: "WebSocket error" });
    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        this.emit(msg.type, msg);
      } catch {
        this.emit("error", { message: "Malformed signaling message" });
      }
    };
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
    this.ws?.close();
    this.ws = null;
    this.removeAllListeners();
  }
}
