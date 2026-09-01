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
// Room-level control (cancel, disconnect) travels over the signaling
// WebSocket instead, so it still works even before the data channel opens.
//
// All file bytes stay in RTCDataChannel buffers / browser memory (or are
// streamed straight to a user-picked disk location) — the signaling server
// (lib/signaling-client.ts) only ever sees SDP/ICE.

import { Emitter } from "./emitter";
import { RTCSignalData, SignalingClient } from "./signaling-client";
import { sha256Chunks, sha256File, sha256Hex } from "./sha256";

export const CHUNK_SIZE = 64 * 1024; // 64KB
const BUFFERED_AMOUNT_LOW_THRESHOLD = 1 * 1024 * 1024; // 1MB
const MAX_BUFFERED_AMOUNT = 8 * 1024 * 1024; // pause sending above this
const DISCONNECT_GRACE_MS = 6000; // tolerate brief ICE blips before restarting
const RECONNECT_GIVEUP_MS = 30000; // fully fail if not back within this long

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
  | "reconnecting"
  | "cancelled"
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
  etaSeconds: number | null;
}

export interface CompletedTransfer {
  meta: FileMeta;
  blob: Blob | File;
  verified: boolean;
  /** true if this was streamed straight to a user-picked disk location. */
  savedToDisk: boolean;
}

interface TransferEvents {
  status: TransferStatus;
  progress: TransferProgress;
  "incoming-file": FileMeta;
  completed: CompletedTransfer;
  /** Fatal problems: connection failures, integrity mismatches, signaling errors. */
  error: { message: string };
  /** Benign, expected state changes: cancellation, the peer leaving cleanly. */
  notice: { message: string };
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
  private transferActive = false;
  private receiveLastSampleTime = 0;
  private receiveLastSampleBytes = 0;

  // Set when the receiver picked a save location via the File System
  // Access API — chunks are streamed straight to disk instead of buffered.
  private fileHandle: FileSystemFileHandle | null = null;
  private writable: FileSystemWritableFileStream | null = null;
  private writeQueue: Promise<void> = Promise.resolve();

  private status: TransferStatus = "idle";
  private disconnectGraceTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectGiveUpTimer: ReturnType<typeof setTimeout> | null = null;
  private iceRestartInFlight = false;
  private intentionallyClosed = false;

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
      if (this.intentionallyClosed) return;
      this.teardownConnection();
      this.setStatus("closed");
      this.emit("notice", {
        message:
          this.role === "sender"
            ? "The receiver disconnected."
            : "The sender disconnected — this room code is no longer active.",
      });
    });

    this.signaling.on("cancelled", ({ by }) => {
      this.teardownConnection();
      this.setStatus("cancelled");
      this.emit("notice", {
        message: by === "sender" ? "The sender cancelled the transfer." : "The receiver cancelled the transfer.",
      });
    });

    this.signaling.on("error", ({ message }) => this.emit("error", { message }));

    this.signaling.connect();
  }

  /**
   * Receiver only: accept an incoming file after reviewing its metadata.
   * On browsers that support it (Chromium-based), this prompts the user to
   * pick a save location and streams the file straight to disk; elsewhere
   * it falls back to buffering in memory and triggering a normal download
   * once complete.
   */
  async accept(): Promise<void> {
    if (typeof window !== "undefined" && window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: this.incomingMeta?.name,
        });
        this.fileHandle = handle;
        this.writable = await handle.createWritable();
      } catch {
        // User cancelled the picker, or the browser refused — fall back to
        // the in-memory path rather than blocking the transfer.
        this.fileHandle = null;
        this.writable = null;
      }
    }

    this.transferActive = true;
    this.setStatus("transferring");
    this.sendControl({ type: "accept" });
  }

  /** Receiver only: decline an incoming file. */
  reject(): void {
    this.sendControl({ type: "reject" });
    this.setStatus("rejected");
  }

  /** Either role: abort an in-progress or pending transfer for both sides. */
  cancel(): void {
    this.intentionallyClosed = true;
    this.signaling.sendCancel(this.roomId);
    this.teardownConnection();
    this.setStatus("cancelled");
  }

  destroy(): void {
    this.intentionallyClosed = true;
    this.clearTimers();
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

    pc.onconnectionstatechange = () => this.handleConnectionStateChange(pc);

    if (this.role === "receiver") {
      pc.ondatachannel = (event) => this.attachChannel(event.channel);
    }

    return pc;
  }

  private handleConnectionStateChange(pc: RTCPeerConnection): void {
    if (this.intentionallyClosed) return;

    if (pc.connectionState === "connected") {
      this.clearTimers();
      this.iceRestartInFlight = false;
      this.setStatus(this.transferActive ? "transferring" : "connected");
      return;
    }

    if (pc.connectionState === "disconnected") {
      // Transient ICE blips are common and often self-heal within a few
      // seconds — don't panic the user immediately.
      this.setStatus("reconnecting");
      if (!this.disconnectGraceTimer) {
        this.disconnectGraceTimer = setTimeout(() => {
          this.disconnectGraceTimer = null;
          if (pc.connectionState !== "connected") void this.attemptIceRestart(pc);
        }, DISCONNECT_GRACE_MS);
      }
      this.armGiveUpTimer(pc);
      return;
    }

    if (pc.connectionState === "failed") {
      this.setStatus("reconnecting");
      void this.attemptIceRestart(pc);
      this.armGiveUpTimer(pc);
    }
  }

  private armGiveUpTimer(pc: RTCPeerConnection): void {
    if (this.reconnectGiveUpTimer) return;
    this.reconnectGiveUpTimer = setTimeout(() => {
      this.reconnectGiveUpTimer = null;
      if (pc.connectionState !== "connected") {
        this.emit("error", {
          message:
            "Connection lost and couldn't be re-established — this can happen on strict " +
            "NAT/firewall networks. Try again, ideally with both devices on the same Wi-Fi.",
        });
        this.setStatus("error");
      }
    }, RECONNECT_GIVEUP_MS);
  }

  private async attemptIceRestart(pc: RTCPeerConnection): Promise<void> {
    if (this.role !== "sender" || !this.remotePeerId || this.iceRestartInFlight) return;
    this.iceRestartInFlight = true;
    try {
      const offer = await pc.createOffer({ iceRestart: true });
      await pc.setLocalDescription(offer);
      this.signaling.sendSignal(this.roomId, { sdp: offer }, this.remotePeerId);
    } catch {
      // Best-effort — if the signaling socket is also down this silently
      // no-ops and the give-up timer eventually surfaces a hard error.
    } finally {
      this.iceRestartInFlight = false;
    }
  }

  private clearTimers(): void {
    if (this.disconnectGraceTimer) {
      clearTimeout(this.disconnectGraceTimer);
      this.disconnectGraceTimer = null;
    }
    if (this.reconnectGiveUpTimer) {
      clearTimeout(this.reconnectGiveUpTimer);
      this.reconnectGiveUpTimer = null;
    }
  }

  private teardownConnection(): void {
    this.clearTimers();
    this.channel?.close();
    this.pc?.close();
    this.channel = null;
    this.pc = null;
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

    channel.onclose = () => {
      if (!this.intentionallyClosed && !["completed", "cancelled", "rejected"].includes(this.status)) {
        this.setStatus("closed");
      }
    };
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
          this.receiveLastSampleTime = 0;
          this.receiveLastSampleBytes = 0;
          this.setStatus("awaiting-accept");
          this.emit("incoming-file", this.incomingMeta);
          break;
        case "accept":
          this.transferActive = true;
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
    this.receivedBytes += buffer.byteLength;

    if (this.writable) {
      const writable = this.writable;
      this.writeQueue = this.writeQueue.then(() => writable.write(buffer));
    } else {
      this.receivedChunks.push(buffer);
    }

    // Defensive: guarantee the UI shows a progress bar even if the local
    // "accept" status update ever raced with the first chunk arriving.
    if (this.status !== "transferring") this.setStatus("transferring");

    const totalBytes = this.incomingMeta?.size ?? 0;
    const now = performance.now();
    if (this.receiveLastSampleTime === 0) {
      // First chunk of this transfer — establish a baseline, no rate yet.
      this.receiveLastSampleTime = now;
      this.receiveLastSampleBytes = this.receivedBytes;
      this.reportProgress(this.receivedBytes, totalBytes, 0);
    } else if (now - this.receiveLastSampleTime >= 200 || this.receivedBytes >= totalBytes) {
      const speedBps =
        ((this.receivedBytes - this.receiveLastSampleBytes) / (now - this.receiveLastSampleTime)) *
          1000 || 0;
      this.reportProgress(this.receivedBytes, totalBytes, speedBps);
      this.receiveLastSampleTime = now;
      this.receiveLastSampleBytes = this.receivedBytes;
    }
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
      if (this.intentionallyClosed) return;

      if (channel.readyState !== "open") {
        // Paused mid-flight by a reconnect — the while loop just waits;
        // it resumes sending from the same offset once the channel (and
        // the underlying ICE path) come back, so no bytes are re-sent.
        await new Promise((resolve) => setTimeout(resolve, 500));
        continue;
      }

      if (channel.bufferedAmount > MAX_BUFFERED_AMOUNT) {
        await this.waitForBufferedAmountLow(channel);
        continue; // re-check readyState/intentionallyClosed before sending
      }

      const buffer = await file.slice(offset, offset + CHUNK_SIZE).arrayBuffer();
      try {
        channel.send(buffer);
      } catch {
        // Channel hiccupped between our checks and the actual send (e.g.
        // it closed at the last instant) — brief wait, then retry the
        // same offset rather than dropping the chunk.
        await new Promise((resolve) => setTimeout(resolve, 300));
        continue;
      }
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

    let verified: boolean;
    let result: Blob | File;
    const savedToDisk = Boolean(this.writable && this.fileHandle);

    if (this.writable && this.fileHandle) {
      await this.writeQueue;
      await this.writable.close();
      const savedFile = await this.fileHandle.getFile();
      const buffer = await savedFile.arrayBuffer();
      const actualSha256 = await sha256Hex(buffer);
      verified = actualSha256 === expectedSha256;
      result = savedFile;
    } else {
      const actualSha256 = await sha256Chunks(this.receivedChunks, this.receivedBytes);
      verified = actualSha256 === expectedSha256;
      result = new Blob(this.receivedChunks, { type: this.incomingMeta.mime });
    }

    this.setStatus("completed");
    this.emit("completed", { meta: this.incomingMeta, blob: result, verified, savedToDisk });

    if (!verified) {
      this.emit("error", {
        message: "Integrity check failed — the received file does not match its SHA-256 hash.",
      });
    }
  }

  private waitForBufferedAmountLow(channel: RTCDataChannel): Promise<void> {
    return new Promise((resolve) => {
      const cleanup = () => {
        channel.removeEventListener("bufferedamountlow", onLow);
        channel.removeEventListener("close", onClose);
      };
      // Also wake on "close" — otherwise a channel that dies while its
      // buffer is still full would leave this promise (and the send loop
      // awaiting it) unresolved forever.
      const onLow = () => {
        cleanup();
        resolve();
      };
      const onClose = () => {
        cleanup();
        resolve();
      };
      channel.addEventListener("bufferedamountlow", onLow);
      channel.addEventListener("close", onClose);
    });
  }

  private reportProgress(bytesTransferred: number, totalBytes: number, speedBps = 0): void {
    const remaining = totalBytes - bytesTransferred;
    const etaSeconds = speedBps > 0 ? remaining / speedBps : null;
    this.emit("progress", {
      bytesTransferred,
      totalBytes,
      percent: totalBytes ? (bytesTransferred / totalBytes) * 100 : 0,
      speedBps,
      etaSeconds,
    });
  }

  private setStatus(status: TransferStatus): void {
    if (status === "completed" || status === "cancelled" || status === "rejected") {
      this.transferActive = false;
    }
    this.status = status;
    this.emit("status", status);
  }

  getStatus(): TransferStatus {
    return this.status;
  }
}

/** Triggers a browser "Save As" for a received Blob (fallback path only —
 * skipped when the file was already streamed to disk via accept()). */
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
