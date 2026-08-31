// PeerBridge WebRTC transfer engine.
//
// Wire protocol over the RTCDataChannel (role of each side fixed for the
// life of the channel — the sender always initiates):
//   1. sender -> "meta"   (text/JSON)  file name/size/mime, sent as soon as
//                                       the channel opens
//   2. receiver -> "accept" | "reject" (text/JSON) user's response to the
//                                       incoming-file prompt
//   3. sender -> binary chunks (ArrayBuffer, <= CHUNK_SIZE bytes each)
//   4. sender -> "end"    (text/JSON)  carries the SHA-256 of the whole
//                                       file, computed in parallel with
//                                       the chunk loop so it's ready by
//                                       the time the last chunk is sent
//
// All file bytes stay in RTCDataChannel buffers / browser memory — the
// signaling server (lib/signaling-client.ts) only ever sees SDP/ICE.

import { Emitter } from "./emitter";
import { RTCSignalData, SignalingClient } from "./signaling-client";
import { sha256Chunks, sha256File } from "./sha256";

export const CHUNK_SIZE = 64 * 1024; // 64KB
const BUFFERED_AMOUNT_LOW_THRESHOLD = 1 * 1024 * 1024; // 1MB
const MAX_BUFFERED_AMOUNT = 8 * 1024 * 1024; // pause sending above this

export const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

export type PeerRole = "sender" | "receiver";

export type TransferStatus =
  | "idle"
  | "connecting-signaling"
  | "waiting-for-peer"
  | "establishing-connection"
  | "connected"
  | "awaiting-accept"
  | "transferring"
  | "verifying"
  | "completed"
  | "rejected"
  | "error"
  | "closed";

export interface FileMeta {
  name: string;
  size: number;
  mime: string;
}

export interface TransferProgress {
  bytesTransferred: number;
  totalBytes: number;
  percent: number;
  speedBps: number;
}

export interface CompletedTransfer {
  meta: FileMeta;
  blob: Blob;
  verified: boolean;
}

interface TransferEvents {
  status: TransferStatus;
  progress: TransferProgress;
  "incoming-file": FileMeta;
  completed: CompletedTransfer;
  error: { message: string };
}

type DataChannelMessage =
  | { type: "meta"; name: string; size: number; mime: string }
  | { type: "accept" }
  | { type: "reject" }
  | { type: "end"; sha256: string };

export class PeerTransferSession extends Emitter<TransferEvents> {
  private signaling = new SignalingClient();
  private pc: RTCPeerConnection | null = null;
  private channel: RTCDataChannel | null = null;
  private remotePeerId: string | null = null;

  private file: File | null = null;
  private incomingMeta: FileMeta | null = null;
  private receivedChunks: ArrayBuffer[] = [];
  private receivedBytes = 0;

  private status: TransferStatus = "idle";

  constructor(
    private readonly roomId: string,
    private readonly role: PeerRole,
  ) {
    super();
  }

  /** Sender only. Must be called before or right after connect(). */
  setFile(file: File): void {
    this.file = file;
    if (this.channel?.readyState === "open") this.sendMeta();
  }

  connect(): void {
    this.setStatus("connecting-signaling");
    this.signaling.on("open", () => {
      if (this.role === "sender") this.signaling.createRoom(this.roomId);
      else this.signaling.joinRoom(this.roomId);
    });

    this.signaling.on("room-created", () => this.setStatus("waiting-for-peer"));

    this.signaling.on("peer-joined", ({ peerId }) => {
      // Sender side: a receiver joined, initiate the RTCPeerConnection.
      this.remotePeerId = peerId;
      void this.initiateAsSender();
    });

    this.signaling.on("room-joined", ({ senderId }) => {
      // Receiver side: prepare to receive the offer via the "signal" event.
      this.remotePeerId = senderId;
      this.setStatus("establishing-connection");
      this.preparePeerConnection();
    });

    this.signaling.on("signal", ({ data }) => void this.handleSignal(data));

    this.signaling.on("peer-left", () => {
      this.setStatus("closed");
      this.emit("error", { message: "The other peer disconnected." });
    });

    this.signaling.on("error", ({ message }) => this.emit("error", { message }));

    this.signaling.connect();
  }

  /** Receiver only: accept an incoming file after reviewing its metadata. */
  accept(): void {
    this.sendControl({ type: "accept" });
  }

  /** Receiver only: decline an incoming file. */
  reject(): void {
    this.sendControl({ type: "reject" });
    this.setStatus("rejected");
  }

  destroy(): void {
    this.signaling.leaveRoom();
    this.signaling.close();
    this.channel?.close();
    this.pc?.close();
    this.channel = null;
    this.pc = null;
    this.removeAllListeners();
  }

  // ---- connection setup -------------------------------------------------

  private preparePeerConnection(): RTCPeerConnection {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.pc = pc;

    pc.onicecandidate = (event) => {
      if (event.candidate && this.remotePeerId) {
        this.signaling.sendSignal(
          this.roomId,
          { candidate: event.candidate.toJSON() },
          this.remotePeerId,
        );
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") this.setStatus("connected");
      if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
        this.emit("error", { message: `Connection ${pc.connectionState}` });
      }
    };

    if (this.role === "receiver") {
      pc.ondatachannel = (event) => this.attachChannel(event.channel);
    }

    return pc;
  }

  private async initiateAsSender(): Promise<void> {
    this.setStatus("establishing-connection");
    const pc = this.preparePeerConnection();
    const channel = pc.createDataChannel("file-transfer", { ordered: true });
    this.attachChannel(channel);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    if (this.remotePeerId) {
      this.signaling.sendSignal(this.roomId, { sdp: offer }, this.remotePeerId);
    }
  }

  private async handleSignal(data: RTCSignalData): Promise<void> {
    const pc = this.pc;
    if (!pc) return;

    if ("sdp" in data) {
      await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
      if (data.sdp.type === "offer") {
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        if (this.remotePeerId) {
          this.signaling.sendSignal(this.roomId, { sdp: answer }, this.remotePeerId);
        }
      }
    } else if ("candidate" in data) {
      await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
    }
  }

  // ---- data channel -------------------------------------------------------

  private attachChannel(channel: RTCDataChannel): void {
    this.channel = channel;
    channel.binaryType = "arraybuffer";
    channel.bufferedAmountLowThreshold = BUFFERED_AMOUNT_LOW_THRESHOLD;

    channel.onopen = () => {
      this.setStatus("connected");
      if (this.role === "sender" && this.file) this.sendMeta();
    };

    channel.onclose = () => this.setStatus("closed");
    channel.onerror = () => this.emit("error", { message: "Data channel error" });
    channel.onmessage = (event) => this.handleChannelMessage(event);
  }

  private handleChannelMessage(event: MessageEvent): void {
    if (typeof event.data === "string") {
      const msg: DataChannelMessage = JSON.parse(event.data);
      switch (msg.type) {
        case "meta":
          this.incomingMeta = { name: msg.name, size: msg.size, mime: msg.mime };
          this.receivedChunks = [];
          this.receivedBytes = 0;
          this.setStatus("awaiting-accept");
          this.emit("incoming-file", this.incomingMeta);
          break;
        case "accept":
          if (this.file) void this.sendFileChunks(this.file, this.channel!);
          break;
        case "reject":
          this.setStatus("rejected");
          break;
        case "end":
          void this.finalizeReceived(msg.sha256);
          break;
      }
      return;
    }

    const buffer = event.data as ArrayBuffer;
    this.receivedChunks.push(buffer);
    this.receivedBytes += buffer.byteLength;
    this.reportProgress(this.receivedBytes, this.incomingMeta?.size ?? 0);
  }

  private sendMeta(): void {
    if (!this.file || !this.channel) return;
    this.setStatus("awaiting-accept");
    this.sendControl({
      type: "meta",
      name: this.file.name,
      size: this.file.size,
      mime: this.file.type || "application/octet-stream",
    });
  }

  private sendControl(msg: DataChannelMessage): void {
    this.channel?.send(JSON.stringify(msg));
  }

  private async sendFileChunks(file: File, channel: RTCDataChannel): Promise<void> {
    this.setStatus("transferring");
    const hashPromise = sha256File(file);

    let offset = 0;
    let lastSampleTime = performance.now();
    let lastSampleBytes = 0;

    while (offset < file.size) {
      if (channel.bufferedAmount > MAX_BUFFERED_AMOUNT) {
        await this.waitForBufferedAmountLow(channel);
      }

      const buffer = await file.slice(offset, offset + CHUNK_SIZE).arrayBuffer();
      channel.send(buffer);
      offset += buffer.byteLength;

      const now = performance.now();
      if (now - lastSampleTime >= 200 || offset === file.size) {
        const speedBps = ((offset - lastSampleBytes) / (now - lastSampleTime)) * 1000 || 0;
        this.reportProgress(offset, file.size, speedBps);
        lastSampleTime = now;
        lastSampleBytes = offset;
      }
    }

    this.setStatus("verifying");
    const sha256 = await hashPromise;
    this.sendControl({ type: "end", sha256 });
    this.setStatus("completed");
  }

  private async finalizeReceived(expectedSha256: string): Promise<void> {
    if (!this.incomingMeta) return;
    this.setStatus("verifying");

    const actualSha256 = await sha256Chunks(this.receivedChunks, this.receivedBytes);
    const verified = actualSha256 === expectedSha256;
    const blob = new Blob(this.receivedChunks, { type: this.incomingMeta.mime });

    this.setStatus("completed");
    this.emit("completed", { meta: this.incomingMeta, blob, verified });

    if (!verified) {
      this.emit("error", {
        message: "Integrity check failed — the received file does not match its SHA-256 hash.",
      });
    }
  }

  private waitForBufferedAmountLow(channel: RTCDataChannel): Promise<void> {
    return new Promise((resolve) => {
      const handler = () => {
        channel.removeEventListener("bufferedamountlow", handler);
        resolve();
      };
      channel.addEventListener("bufferedamountlow", handler);
    });
  }

  private reportProgress(bytesTransferred: number, totalBytes: number, speedBps = 0): void {
    this.emit("progress", {
      bytesTransferred,
      totalBytes,
      percent: totalBytes ? (bytesTransferred / totalBytes) * 100 : 0,
      speedBps,
    });
  }

  private setStatus(status: TransferStatus): void {
    this.status = status;
    this.emit("status", status);
  }

  getStatus(): TransferStatus {
    return this.status;
  }
}

/** Triggers a browser "Save As" for a received Blob. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
