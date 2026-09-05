// PeerBridge mobile transfer engine — a port of the web app's
// lib/webrtc.ts, deliberately scoped down to the single-connection path
// (see MOBILE-APP-SPEC.md §6: parallel connections are optional and this
// client doesn't attempt them). It stays wire-compatible with a web peer
// that *does* use parallel connections for a large file: this client only
// ever answers signaling for connId 0, so a web sender's extra worker
// connections simply time out on its side and it falls back to sending
// everything over the primary connection — no special-casing needed here.
//
// Wire protocol (must match the web app exactly — see
// MOBILE-APP-SPEC.md §3-4):
//   Signaling (WebSocket): create-room/join-room/signal/cancel/leave-room.
//   Data channel control (JSON text frames): batch-meta -> accept/reject ->
//     per file: file-start -> binary chunks -> file-end -> ... -> batch-end.
//   Binary chunk framing: 1 byte connId + 8 byte float64 big-endian
//     position + raw payload (see encodeChunk/decodeChunk below).

import { RTCPeerConnection, RTCSessionDescription, RTCIceCandidate } from "react-native-webrtc";
import { File, Directory, Paths, FileMode } from "expo-file-system";
import { SignalingClient, RTCSignalData } from "./signaling-client";
import { createSha256Stream, sha256Hex } from "./sha256";
import { SIGNALING_URL, TURN_URLS, TURN_USERNAME, TURN_CREDENTIAL } from "./constants";

export const CHUNK_SIZE = 64 * 1024;
const CHUNK_HEADER_SIZE = 9;
const PAYLOAD_SIZE = CHUNK_SIZE - CHUNK_HEADER_SIZE;
const MAX_BUFFERED_AMOUNT = 8 * 1024 * 1024;
const BUFFERED_AMOUNT_LOW_THRESHOLD = 1 * 1024 * 1024;
const RECONNECT_GIVEUP_MS = 30000;
const CONNECTED_STUCK_MS = 18000;
// The receiver can't initiate a relay-forced retry itself (only the sender
// can offer) — give it extra patience past CONNECTED_STUCK_MS so it isn't
// the one to flash an error while the sender's retry (see setStatus) is
// still in flight.
const RECEIVER_STUCK_GRACE_MS = 20000;
const PEER_LEFT_GRACE_MS = 6000;
const TRANSFER_STALL_MS = 45000;

// Mirrors the web app's lib/webrtc.ts buildIceServers() exactly, including
// the public-relay fallback, so a build with no TURN_* env vars configured
// still works cross-network instead of silently failing.
function buildIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ];

  if (TURN_URLS && TURN_USERNAME && TURN_CREDENTIAL) {
    const urls = String(TURN_URLS)
      .split(",")
      .map((u: string) => u.trim())
      .filter(Boolean);
    if (urls.length > 0) {
      servers.push({ urls, username: TURN_USERNAME, credential: TURN_CREDENTIAL });
      return servers;
    }
  }

  // No dedicated TURN configured — fall back to Metered's "Open Relay
  // Project", a shared/rate-limited public TURN server with fixed,
  // intentionally public credentials. See DEPLOY.md in the main repo.
  servers.push(
    { urls: "stun:stun.relay.metered.ca:80" },
    {
      urls: [
        "turn:global.relay.metered.ca:80",
        "turn:global.relay.metered.ca:80?transport=tcp",
        "turn:global.relay.metered.ca:443",
        "turn:global.relay.metered.ca:443?transport=tcp",
        "turns:global.relay.metered.ca:443?transport=tcp",
      ],
      username: "openrelayproject",
      credential: "openrelayproject",
    },
  );

  return servers;
}
export const ICE_SERVERS = buildIceServers();

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
  relativePath: string;
  size: number;
  mime: string;
}

export interface IncomingBatch {
  files: FileMeta[];
  totalBytes: number;
}

export interface TransferProgress {
  bytesTransferred: number;
  totalBytes: number;
  percent: number;
  speedBps: number;
  etaSeconds: number | null;
  currentFileIndex: number;
  currentFileName: string;
  fileCount: number;
  currentFileBytesTransferred: number;
  currentFileTotalBytes: number;
}

export interface CompletedFileResult {
  meta: FileMeta;
  verified: boolean;
}

export interface CompletedTransfer {
  files: CompletedFileResult[];
  savedTo: string | null;
}

type DataChannelMessage =
  | { type: "batch-meta"; files: FileMeta[] }
  | { type: "accept" }
  | { type: "reject" }
  | { type: "file-start"; index: number; segments?: { connId: number; start: number; end: number }[] }
  | { type: "file-end"; index: number; sha256: string }
  | { type: "batch-end" }
  | { type: "receiver-progress"; index: number; bytesTransferred: number; totalBytes: number };

function encodeChunk(connId: number, position: number, payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(CHUNK_HEADER_SIZE + payload.byteLength);
  const view = new DataView(out.buffer);
  view.setUint8(0, connId);
  view.setFloat64(1, position);
  out.set(payload, CHUNK_HEADER_SIZE);
  return out;
}

function decodeChunk(buffer: Uint8Array): { connId: number; position: number; payload: Uint8Array } {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  return {
    connId: view.getUint8(0),
    position: view.getFloat64(1),
    payload: buffer.subarray(CHUNK_HEADER_SIZE),
  };
}

interface TransferEvents {
  status: TransferStatus;
  progress: TransferProgress;
  "incoming-batch": IncomingBatch;
  completed: CompletedTransfer;
  error: { message: string };
  notice: { message: string };
}

type Listener<T> = (payload: T) => void;

class Emitter<E> {
  private listeners: { [K in keyof E]?: Listener<E[K]>[] } = {};
  on<K extends keyof E>(event: K, listener: Listener<E[K]>): void {
    const map = this.listeners as Record<string, Listener<any>[]>;
    (map[event as string] ??= []).push(listener);
  }
  protected emit<K extends keyof E>(event: K, payload: E[K]): void {
    this.listeners[event]?.forEach((l) => l(payload));
  }
  removeAllListeners(): void {
    this.listeners = {};
  }
}

export class PeerTransferSession extends Emitter<TransferEvents> {
  private signaling = new SignalingClient(SIGNALING_URL);
  private pc: RTCPeerConnection | null = null;
  private channel: any = null; // react-native-webrtc's RTCDataChannel
  private remotePeerId: string | null = null;

  // sender state
  private sendFile: File | null = null;
  private sendFileMeta: FileMeta | null = null;

  // receiver state
  private incomingFiles: FileMeta[] = [];
  private totalIncomingBytes = 0;
  private receivedBytesTotal = 0;
  private fileStartCumulativeBytes = 0;
  private currentFileIndex = -1;
  private targetDirectory: Directory | null = null;
  private receiveHandle: ReturnType<File["open"]> | null = null;
  private receiveTargetFailed = false;
  private receiveFile: File | null = null;
  private receiveHasher: ReturnType<typeof createSha256Stream> | null = null;
  private fileEndSha256: string | null = null;
  private fileFinished = false;
  private pendingFileFinishes: Promise<void>[] = [];
  private completedResults: CompletedFileResult[] = [];

  private transferActive = false;
  private receiveLastSampleTime = 0;
  private receiveLastSampleBytes = 0;
  private candidateTypeCounts: Record<string, number> = {};

  private status: TransferStatus = "idle";
  private disconnectGraceTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectGiveUpTimer: ReturnType<typeof setTimeout> | null = null;
  private connectedStuckTimer: ReturnType<typeof setTimeout> | null = null;
  private peerLeftGraceTimer: ReturnType<typeof setTimeout> | null = null;
  private transferStallTimer: ReturnType<typeof setTimeout> | null = null;
  private iceRestartInFlight = false;
  private intentionallyClosed = false;
  /** Sender only: whether the one-shot relay-forced retry (see the
   * "connected but stuck" handling in setStatus) has already been tried
   * for this room session — never more than once, so a genuinely broken
   * TURN server can't cause an infinite reconnect loop. */
  private relayRetryAttempted = false;

  constructor(
    private readonly roomId: string,
    private readonly role: PeerRole,
  ) {
    super();
  }

  /** Sender only. Call before or right after connect(). */
  setFile(file: File): void {
    this.sendFile = file;
    this.sendFileMeta = {
      name: file.name,
      relativePath: file.name,
      size: file.size,
      mime: file.type || "application/octet-stream",
    };
    if (this.channel?.readyState === "open") this.sendBatchMeta();
  }

  /** Receiver only. Call before accept() — the directory chunks get
   * written into. Pass null to save into the app's own document
   * directory (Paths.document) instead of a user-picked destination. */
  setTargetDirectory(directory: Directory | null): void {
    this.targetDirectory = directory;
  }

  connect(): void {
    this.relayRetryAttempted = false;
    this.setStatus("connecting-signaling");
    this.signaling.on("open", () => {
      if (this.role === "sender") this.signaling.createRoom(this.roomId);
      else this.signaling.joinRoom(this.roomId);
    });

    this.signaling.on("room-created", () => this.setStatus("waiting-for-peer"));

    this.signaling.on("peer-joined", ({ peerId }) => {
      this.clearPeerLeftGrace();
      this.remotePeerId = peerId;
      void this.initiateAsSender();
    });

    this.signaling.on("room-joined", ({ senderId }) => {
      this.clearPeerLeftGrace();
      this.remotePeerId = senderId;
      this.setStatus("establishing-connection");
      this.preparePeerConnection();
    });

    this.signaling.on("signal", ({ data }) => void this.handleSignal(data));

    this.signaling.on("peer-left", () => {
      if (this.intentionallyClosed || this.peerLeftGraceTimer) return;
      this.peerLeftGraceTimer = setTimeout(() => {
        this.peerLeftGraceTimer = null;
        if (this.intentionallyClosed) return;
        this.teardownConnection();
        this.setStatus("closed");
        this.emit("notice", {
          message:
            this.role === "sender"
              ? "The receiver disconnected."
              : "The sender disconnected — this room code is no longer active.",
        });
      }, PEER_LEFT_GRACE_MS);
    });

    this.signaling.on("cancelled", ({ by }) => {
      this.teardownConnection();
      this.setStatus("cancelled");
      this.emit("notice", {
        message: by === "sender" ? "The sender cancelled the transfer." : "The receiver cancelled the transfer.",
      });
    });

    this.signaling.on("error", ({ message }) => {
      if (this.intentionallyClosed || ["cancelled", "completed", "rejected", "closed"].includes(this.status)) return;
      this.emit("error", { message });
    });

    this.signaling.connect();
  }

  async accept(): Promise<void> {
    this.transferActive = true;
    this.setStatus("transferring");
    this.armTransferStallWatchdog();
    this.sendControl({ type: "accept" });
  }

  reject(): void {
    this.sendControl({ type: "reject" });
    this.setStatus("rejected");
  }

  cancel(): void {
    this.intentionallyClosed = true;
    this.signaling.sendCancel(this.roomId);
    this.signaling.close();
    this.teardownConnection();
    this.setStatus("cancelled");
  }

  destroy(): void {
    this.intentionallyClosed = true;
    this.clearTimers();
    this.signaling.leaveRoom();
    this.signaling.close();
    this.channel?.close?.();
    this.pc?.close();
    this.channel = null;
    this.pc = null;
    this.removeAllListeners();
  }

  // ---- connection setup ---------------------------------------------

  private preparePeerConnection(forceRelay = false): RTCPeerConnection {
    this.clearTimers();
    const pc = new RTCPeerConnection({
      iceServers: ICE_SERVERS,
      // Skipping host/srflx candidates entirely forces TURN — used for the
      // one-shot retry when a "connected" state never actually delivers
      // data, which can happen when ICE nominates a direct/local candidate
      // pair that looks fine per connectivity checks but is silently
      // blocked (e.g. AP/client isolation on the same Wi-Fi network).
      ...(forceRelay ? { iceTransportPolicy: "relay" } : {}),
    } as any);
    this.pc = pc;
    this.candidateTypeCounts = {};

    (pc as any).onicecandidate = (event: any) => {
      if (!event.candidate) return;
      const type = event.candidate.type ?? "unknown";
      this.candidateTypeCounts[type] = (this.candidateTypeCounts[type] ?? 0) + 1;
      if (this.remotePeerId) {
        this.signaling.sendSignal(this.roomId, { candidate: event.candidate, connId: 0 }, this.remotePeerId);
      }
    };

    (pc as any).onconnectionstatechange = () => this.handleConnectionStateChange(pc);

    if (this.role === "receiver") {
      (pc as any).ondatachannel = (event: any) => this.attachChannel(event.channel);
    }

    this.armGiveUpTimer(pc);
    return pc;
  }

  private handleConnectionStateChange(pc: RTCPeerConnection): void {
    if (this.intentionallyClosed) return;
    const state = (pc as any).connectionState;

    if (state === "connected") {
      this.clearTimers();
      this.iceRestartInFlight = false;
      this.setStatus(this.transferActive ? "transferring" : "connected");
      return;
    }
    if (state === "disconnected") {
      this.setStatus("reconnecting");
      if (!this.disconnectGraceTimer) {
        this.disconnectGraceTimer = setTimeout(() => {
          this.disconnectGraceTimer = null;
          if ((pc as any).connectionState !== "connected") void this.attemptIceRestart(pc);
        }, 6000);
      }
      this.armGiveUpTimer(pc);
      return;
    }
    if (state === "failed") {
      this.setStatus("reconnecting");
      void this.attemptIceRestart(pc);
      this.armGiveUpTimer(pc);
    }
  }

  private armGiveUpTimer(pc: RTCPeerConnection): void {
    if (this.reconnectGiveUpTimer) return;
    this.reconnectGiveUpTimer = setTimeout(() => {
      this.reconnectGiveUpTimer = null;
      if ((pc as any).connectionState !== "connected") {
        const counts = this.candidateTypeCounts;
        const hasRelay = (counts.relay ?? 0) > 0;
        const hasAny = Object.keys(counts).length > 0;
        let diagnosis: string;
        if (!hasAny) {
          diagnosis = "No connection candidates were found at all — this network may be blocking outbound traffic entirely.";
        } else if (!hasRelay) {
          diagnosis = "A relay (TURN) server is required but couldn't be reached — this is a server-side configuration issue.";
        } else {
          diagnosis = "A relay path was found but the connection still didn't complete — try a different network.";
        }
        this.emit("error", { message: `Couldn't establish a connection. ${diagnosis}` });
        this.setStatus("error");
      }
    }, RECONNECT_GIVEUP_MS);
  }

  private async attemptIceRestart(pc: RTCPeerConnection): Promise<void> {
    if (this.role !== "sender" || !this.remotePeerId || this.iceRestartInFlight) return;
    this.iceRestartInFlight = true;
    try {
      const offer = await pc.createOffer({ iceRestart: true } as any);
      await pc.setLocalDescription(offer);
      this.signaling.sendSignal(this.roomId, { sdp: offer as any, connId: 0 }, this.remotePeerId);
    } catch {
      // best-effort
    } finally {
      this.iceRestartInFlight = false;
    }
  }

  private clearTimers(): void {
    if (this.disconnectGraceTimer) clearTimeout(this.disconnectGraceTimer);
    this.disconnectGraceTimer = null;
    if (this.reconnectGiveUpTimer) clearTimeout(this.reconnectGiveUpTimer);
    this.reconnectGiveUpTimer = null;
    if (this.connectedStuckTimer) clearTimeout(this.connectedStuckTimer);
    this.connectedStuckTimer = null;
    this.clearTransferStallWatchdog();
    this.clearPeerLeftGrace();
  }

  private clearPeerLeftGrace(): void {
    if (this.peerLeftGraceTimer) clearTimeout(this.peerLeftGraceTimer);
    this.peerLeftGraceTimer = null;
  }

  private armTransferStallWatchdog(): void {
    if (this.transferStallTimer) clearTimeout(this.transferStallTimer);
    this.transferStallTimer = setTimeout(() => {
      this.transferStallTimer = null;
      if (this.status === "transferring" && !this.intentionallyClosed) {
        this.emit("error", {
          message: `No data has moved in ${TRANSFER_STALL_MS / 1000} seconds, even though the connection is open.`,
        });
        this.setStatus("error");
      }
    }, TRANSFER_STALL_MS);
  }

  private clearTransferStallWatchdog(): void {
    if (this.transferStallTimer) clearTimeout(this.transferStallTimer);
    this.transferStallTimer = null;
  }

  private teardownConnection(): void {
    this.clearTimers();
    this.channel?.close?.();
    this.pc?.close();
    this.channel = null;
    this.pc = null;
  }

  private async initiateAsSender(forceRelay = false): Promise<void> {
    this.setStatus("establishing-connection");
    const pc = this.preparePeerConnection(forceRelay);
    const channel = pc.createDataChannel("file-transfer", { ordered: true });
    this.attachChannel(channel);

    const offer = await pc.createOffer({});
    await pc.setLocalDescription(offer);
    if (this.remotePeerId) {
      this.signaling.sendSignal(this.roomId, { sdp: offer as any, connId: 0 }, this.remotePeerId);
    }
  }

  private async handleSignal(data: RTCSignalData): Promise<void> {
    // Only ever answer signaling for the primary connection (connId 0) —
    // see the file header comment for why this is safe with a web peer
    // that does use parallel connections.
    if (data.connId !== 0) return;
    const pc = this.pc;
    if (!pc) return;

    if ("sdp" in data) {
      await pc.setRemoteDescription(new RTCSessionDescription(data.sdp as any));
      if (data.sdp.type === "offer") {
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        if (this.remotePeerId) {
          this.signaling.sendSignal(this.roomId, { sdp: answer as any, connId: 0 }, this.remotePeerId);
        }
      }
    } else if ("candidate" in data) {
      await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
    }
  }

  // ---- data channel ---------------------------------------------------

  private attachChannel(channel: any): void {
    this.channel = channel;
    channel.binaryType = "arraybuffer";
    channel.bufferedAmountLowThreshold = BUFFERED_AMOUNT_LOW_THRESHOLD;

    channel.onopen = () => {
      this.setStatus("connected");
      if (this.role === "sender" && this.sendFile) this.sendBatchMeta();
    };
    channel.onclose = () => {
      if (!this.intentionallyClosed && !["completed", "cancelled", "rejected"].includes(this.status)) {
        this.setStatus("closed");
      }
    };
    channel.onerror = () => {
      if (this.intentionallyClosed || ["cancelled", "completed", "rejected", "closed"].includes(this.status)) return;
      this.emit("error", { message: "Data channel error" });
    };
    channel.onmessage = (event: any) => this.handleChannelMessage(event);
  }

  private handleChannelMessage(event: any): void {
    if (typeof event.data === "string") {
      const msg: DataChannelMessage = JSON.parse(event.data);
      switch (msg.type) {
        case "batch-meta":
          this.incomingFiles = msg.files;
          this.totalIncomingBytes = msg.files.reduce((sum, f) => sum + f.size, 0);
          this.receivedBytesTotal = 0;
          this.receiveLastSampleTime = 0;
          this.receiveLastSampleBytes = 0;
          this.completedResults = [];
          this.pendingFileFinishes = [];
          this.setStatus("awaiting-accept");
          this.emit("incoming-batch", { files: this.incomingFiles, totalBytes: this.totalIncomingBytes });
          break;
        case "accept":
          this.transferActive = true;
          if (this.sendFile) void this.sendFileNow();
          break;
        case "reject":
          this.setStatus("rejected");
          break;
        case "file-start":
          this.currentFileIndex = msg.index;
          this.fileStartCumulativeBytes = this.receivedBytesTotal;
          this.fileEndSha256 = null;
          this.fileFinished = false;
          this.receiveTargetFailed = false;
          this.receiveHasher = createSha256Stream();
          void this.prepareReceiveTarget(msg.index);
          break;
        case "file-end":
          this.fileEndSha256 = msg.sha256;
          this.maybeFinishFile();
          break;
        case "batch-end":
          void Promise.all(this.pendingFileFinishes).then(() => this.finishBatch());
          break;
        case "receiver-progress":
          // Sender side only: independent proof real bytes are arriving at
          // the other end, even if the local send loop is still mid-
          // backpressure-wait on the next chunk — re-arm the stall
          // watchdog on it too (see TRANSFER_STALL_MS).
          this.armTransferStallWatchdog();
          break;
      }
      return;
    }

    this.handleIncomingChunk(new Uint8Array(event.data as ArrayBuffer));
  }

  private async prepareReceiveTarget(index: number): Promise<void> {
    const meta = this.incomingFiles[index];
    if (!meta) return;
    try {
      const file = this.targetDirectory
        ? this.targetDirectory.createFile(meta.name, meta.mime || null)
        : new File(Paths.document, meta.name);
      if (!this.targetDirectory) {
        if (file.exists) file.delete();
        file.create();
      }
      this.receiveFile = file;
      // WriteOnly, not ReadWrite: the receiver only ever writes, and
      // ReadWrite is documented as unsupported on SAF `content://` URIs
      // (i.e. exactly a user-picked save folder) — using it here made
      // every transfer into a picked folder fail immediately on the first
      // chunk. WriteOnly still supports seeking (unlike Append), which is
      // what position-addressed writes below need.
      this.receiveHandle = file.open(FileMode.WriteOnly);
    } catch (err) {
      this.receiveTargetFailed = true;
      this.emit("error", { message: `Couldn't create a file to save "${meta.name}": ${String(err)}` });
      this.setStatus("error");
    }
  }

  private handleIncomingChunk(rawBuffer: Uint8Array): void {
    // The destination file never opened — nothing would actually be saved,
    // so don't keep counting bytes as if a real transfer were in progress
    // (that previously just showed a misleading progress bar for a
    // transfer that was silently going nowhere).
    if (this.receiveTargetFailed) return;

    const { position, payload } = decodeChunk(rawBuffer);
    this.receivedBytesTotal += payload.byteLength;
    this.armTransferStallWatchdog();

    if (this.receiveHandle) {
      try {
        this.receiveHandle.offset = position;
        this.receiveHandle.writeBytes(payload);
        this.receiveHasher?.update(payload);
      } catch (err) {
        this.receiveTargetFailed = true;
        this.emit("error", { message: `Write failed: ${String(err)}` });
        this.setStatus("error");
        return;
      }
    }

    if (this.status !== "transferring") this.setStatus("transferring");
    this.maybeFinishFile();
    this.sampleAndReportProgress();
  }

  private maybeFinishFile(): void {
    if (this.fileFinished || this.fileEndSha256 === null) return;
    const currentFileBytesTransferred = this.receivedBytesTotal - this.fileStartCumulativeBytes;
    const currentFileTotalBytes = this.incomingFiles[this.currentFileIndex]?.size ?? 0;
    if (currentFileBytesTransferred < currentFileTotalBytes) return;

    this.fileFinished = true;
    this.pendingFileFinishes.push(this.finishCurrentFile(this.currentFileIndex, this.fileEndSha256));
  }

  private async finishCurrentFile(index: number, expectedSha256: string): Promise<void> {
    const meta = this.incomingFiles[index];
    const handle = this.receiveHandle;
    const hasher = this.receiveHasher;
    this.receiveHandle = null;
    if (!meta || !handle) return;

    this.setStatus("verifying");
    handle.close();
    const actualSha256 = hasher?.digest() ?? "";
    const verified = actualSha256 === expectedSha256;
    this.completedResults.push({ meta, verified });

    if (!verified) {
      this.emit("error", { message: `Integrity check failed for "${meta.name}" — it may not match what was sent.` });
    }
  }

  private finishBatch(): void {
    this.setStatus("completed");
    this.emit("completed", {
      files: this.completedResults,
      savedTo: this.receiveFile?.uri ?? null,
    });
  }

  private sendBatchMeta(): void {
    if (!this.sendFileMeta || !this.channel) return;
    this.setStatus("awaiting-accept");
    this.sendControl({ type: "batch-meta", files: [this.sendFileMeta] });
  }

  private sendControl(msg: DataChannelMessage): void {
    this.channel?.send(JSON.stringify(msg));
  }

  private async sendFileNow(): Promise<void> {
    const channel = this.channel;
    const file = this.sendFile;
    if (!channel || !file || !this.sendFileMeta) return;

    this.setStatus("transferring");
    this.armTransferStallWatchdog();
    this.sendControl({ type: "file-start", index: 0 });

    const hasher = createSha256Stream();
    const handle = file.open(FileMode.ReadOnly);
    let offset = 0;
    let lastSampleTime = Date.now();
    let lastSampleBytes = 0;
    const totalBytes = this.sendFileMeta.size;

    try {
      while (offset < totalBytes) {
        if (this.intentionallyClosed) return;

        if (channel.readyState !== "open") {
          await sleep(500);
          continue;
        }
        if (channel.bufferedAmount > MAX_BUFFERED_AMOUNT) {
          await waitForBufferedAmountLow(channel, () => this.armTransferStallWatchdog());
          continue;
        }

        const length = Math.min(PAYLOAD_SIZE, totalBytes - offset);
        const raw = handle.readBytes(length);
        hasher.update(raw);
        try {
          channel.send(encodeChunk(0, offset, raw).buffer);
        } catch {
          await sleep(300);
          continue;
        }
        offset += raw.byteLength;
        this.armTransferStallWatchdog();

        const now = Date.now();
        if (now - lastSampleTime >= 200 || offset === totalBytes) {
          const speedBps = ((offset - lastSampleBytes) / (now - lastSampleTime)) * 1000 || 0;
          this.reportProgress(offset, totalBytes, speedBps, offset, totalBytes);
          lastSampleTime = now;
          lastSampleBytes = offset;
        }
      }
    } finally {
      handle.close();
    }

    this.setStatus("verifying");
    this.sendControl({ type: "file-end", index: 0, sha256: hasher.digest() });
    this.setStatus("transferring");
    this.sendControl({ type: "batch-end" });
    this.setStatus("completed");
  }

  private sampleAndReportProgress(): void {
    const now = Date.now();
    const shouldSample =
      this.receiveLastSampleTime === 0 ||
      now - this.receiveLastSampleTime >= 200 ||
      this.receivedBytesTotal >= this.totalIncomingBytes;
    if (!shouldSample) return;

    const speedBps =
      this.receiveLastSampleTime === 0
        ? 0
        : ((this.receivedBytesTotal - this.receiveLastSampleBytes) / (now - this.receiveLastSampleTime)) * 1000 || 0;

    const currentFileBytesTransferred = this.receivedBytesTotal - this.fileStartCumulativeBytes;
    const currentFileTotalBytes = this.incomingFiles[this.currentFileIndex]?.size ?? 0;

    this.reportProgress(this.receivedBytesTotal, this.totalIncomingBytes, speedBps, currentFileBytesTransferred, currentFileTotalBytes);

    this.sendControl({
      type: "receiver-progress",
      index: this.currentFileIndex,
      bytesTransferred: currentFileBytesTransferred,
      totalBytes: currentFileTotalBytes,
    });

    this.receiveLastSampleTime = now;
    this.receiveLastSampleBytes = this.receivedBytesTotal;
  }

  private currentFileName(): string {
    if (this.role === "sender") return this.sendFileMeta?.name ?? "";
    return this.incomingFiles[this.currentFileIndex]?.name ?? "";
  }

  private reportProgress(
    bytesTransferred: number,
    totalBytes: number,
    speedBps = 0,
    currentFileBytesTransferred = 0,
    currentFileTotalBytes = 0,
  ): void {
    const remaining = totalBytes - bytesTransferred;
    const etaSeconds = speedBps > 0 ? remaining / speedBps : null;
    this.emit("progress", {
      bytesTransferred,
      totalBytes,
      percent: totalBytes ? (bytesTransferred / totalBytes) * 100 : 0,
      speedBps,
      etaSeconds,
      currentFileIndex: Math.max(this.currentFileIndex, 0),
      currentFileName: this.currentFileName(),
      fileCount: 1,
      currentFileBytesTransferred,
      currentFileTotalBytes,
    });
  }

  private setStatus(status: TransferStatus): void {
    if (status === "completed" || status === "cancelled" || status === "rejected") {
      this.transferActive = false;
    }

    if (this.connectedStuckTimer) clearTimeout(this.connectedStuckTimer);
    this.connectedStuckTimer = null;

    if (status === "connected") {
      // The receiver can't initiate the retry below itself (only the
      // sender can send a fresh offer) — give it extra time so it doesn't
      // flash an error while a sender-side retry is still in flight.
      const delay = this.role === "sender" ? CONNECTED_STUCK_MS : CONNECTED_STUCK_MS + RECEIVER_STUCK_GRACE_MS;
      this.connectedStuckTimer = setTimeout(() => {
        this.connectedStuckTimer = null;
        if (this.status !== "connected" || this.intentionallyClosed) return;

        // One-shot recovery attempt: a "connected" state that never
        // delivers data often means ICE nominated a direct/local candidate
        // pair that looks fine per connectivity checks but is silently
        // blocked end-to-end (AP/client isolation on shared Wi-Fi is a
        // common real cause) — forcing TURN-only on a fresh connection
        // routes around that specific broken path instead of just erroring.
        if (this.role === "sender" && !this.relayRetryAttempted && this.remotePeerId) {
          this.relayRetryAttempted = true;
          this.emit("notice", {
            message: "Direct connection isn't delivering data — retrying through a relay server.",
          });
          // Detach handlers before closing — close() fires state-change
          // events asynchronously, and without this those stale events
          // would land after initiateAsSender() below has already moved
          // status past "connected", wrongly stomping it back down.
          if (this.channel) {
            this.channel.onopen = null;
            this.channel.onclose = null;
            this.channel.onerror = null;
            this.channel.onmessage = null;
            this.channel.close();
          }
          if (this.pc) {
            (this.pc as any).onconnectionstatechange = null;
            (this.pc as any).onicecandidate = null;
            (this.pc as any).ondatachannel = null;
            this.pc.close();
          }
          this.channel = null;
          this.pc = null;
          void this.initiateAsSender(true);
          return;
        }

        this.emit("error", {
          message:
            "Connected, but no data is arriving — this usually means a strict NAT " +
            "or firewall is blocking the link between these two networks, and the " +
            "relay (TURN) server wasn't able to pick up the slack either.",
        });
        this.setStatus("error");
      }, delay);
    }

    this.status = status;
    this.emit("status", status);
  }

  getStatus(): TransferStatus {
    return this.status;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForBufferedAmountLow(channel: any, onLow: () => void): Promise<void> {
  return new Promise((resolve) => {
    const cleanup = () => {
      channel.removeEventListener("bufferedamountlow", handleLow);
      channel.removeEventListener("close", handleClose);
    };
    const handleLow = () => {
      cleanup();
      onLow();
      resolve();
    };
    const handleClose = () => {
      cleanup();
      resolve();
    };
    channel.addEventListener("bufferedamountlow", handleLow);
    channel.addEventListener("close", handleClose);
  });
}

export { sha256Hex };
