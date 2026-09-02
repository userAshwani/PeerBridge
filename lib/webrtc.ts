// PeerBridge WebRTC transfer engine.
//
// Wire protocol over the RTCDataChannel (role of each side fixed for the
// life of the channel — the sender always initiates), supporting a batch
// of one or more files (a folder drop flattens to a batch where each
// file's relativePath encodes its folder structure):
//   1. sender -> "batch-meta" (text/JSON) the full file list (name, size,
//                               mime, relativePath) up front
//   2. receiver -> "accept" | "reject" (text/JSON)
//   3. for each file in order:
//        sender -> "file-start" {index}
//        sender -> binary chunks (ArrayBuffer, <= CHUNK_SIZE bytes each)
//        sender -> "file-end" {index, sha256} — hash computed in parallel
//                   with that file's chunk loop
//   4. sender -> "batch-end" once every file is done
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
import { DroppedFile } from "./collect-files";

export const CHUNK_SIZE = 64 * 1024; // 64KB
const BUFFERED_AMOUNT_LOW_THRESHOLD = 1 * 1024 * 1024; // 1MB
const MAX_BUFFERED_AMOUNT = 8 * 1024 * 1024; // pause sending above this
const DISCONNECT_GRACE_MS = 6000; // tolerate brief ICE blips before restarting
const RECONNECT_GIVEUP_MS = 30000; // fully fail if not back within this long
const CONNECTED_STUCK_MS = 18000; // "connected" per ICE but no protocol progress

// STUN alone only resolves NAT type for "easy" NATs (full-cone, restricted-
// cone) — it cannot traverse symmetric NAT, which is common on cellular/
// carrier networks and many corporate firewalls. Two peers on different
// networks/countries hit this often enough that a TURN relay fallback is
// what actually makes cross-network transfers reliable; see DEPLOY.md.
// Configure via NEXT_PUBLIC_TURN_URL(S) / _USERNAME / _CREDENTIAL — these
// are build-time env vars (Next.js inlines NEXT_PUBLIC_* at build, not
// runtime), so changing them requires a redeploy.
function buildIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ];

  const turnUrls = process.env.NEXT_PUBLIC_TURN_URLS;
  const turnUsername = process.env.NEXT_PUBLIC_TURN_USERNAME;
  const turnCredential = process.env.NEXT_PUBLIC_TURN_CREDENTIAL;

  if (turnUrls && turnUsername && turnCredential) {
    const urls = turnUrls
      .split(",")
      .map((u) => u.trim())
      .filter(Boolean);
    if (urls.length > 0) {
      servers.push({ urls, username: turnUsername, credential: turnCredential });
    }
  }

  return servers;
}

export const ICE_SERVERS: RTCIceServer[] = buildIceServers();

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
  /** Folder path relative to the batch root; equals `name` for a flat file. */
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
}

export interface CompletedFileResult {
  meta: FileMeta;
  verified: boolean;
}

export interface CompletedTransfer {
  files: CompletedFileResult[];
  /** true if every file streamed straight to a user-picked disk location. */
  savedToDisk: boolean;
  /** Only set when not saved to disk — one Blob per file, same order as `files`. */
  blobs?: Blob[];
}

interface TransferEvents {
  status: TransferStatus;
  progress: TransferProgress;
  "incoming-batch": IncomingBatch;
  completed: CompletedTransfer;
  /** Fatal problems: connection failures, integrity mismatches, signaling errors. */
  error: { message: string };
  /** Benign, expected state changes: cancellation, the peer leaving cleanly. */
  notice: { message: string };
}

type DataChannelMessage =
  | { type: "batch-meta"; files: FileMeta[] }
  | { type: "accept" }
  | { type: "reject" }
  | { type: "file-start"; index: number }
  | { type: "file-end"; index: number; sha256: string }
  | { type: "batch-end" };

/** Per-file receive state. Created fresh on every "file-start" and passed
 * by reference to whatever needs it, rather than read back off shared
 * `this.*` fields later — those get reset the moment the NEXT file's
 * "file-start" arrives, which (since a write can take real wall-clock
 * time) can happen before the previous file's "file-end" has finished
 * closing/hashing it. Passing the slot itself sidesteps that race. */
interface ReceiveSlot {
  writeQueue: Promise<void>;
  writable: FileSystemWritableFileStream | null;
  fileHandle: FileSystemFileHandle | null;
  chunks: ArrayBuffer[];
}

export class PeerTransferSession extends Emitter<TransferEvents> {
  private signaling = new SignalingClient();
  private pc: RTCPeerConnection | null = null;
  private channel: RTCDataChannel | null = null;
  private remotePeerId: string | null = null;

  // ---- sender-side batch state -------------------------------------------
  private files: DroppedFile[] = [];

  // ---- receiver-side batch state -----------------------------------------
  private incomingFiles: FileMeta[] = [];
  private totalIncomingBytes = 0;
  private receivedBytesTotal = 0;
  private currentFileIndex = -1;
  private currentSlot: ReceiveSlot | null = null;
  private pendingFileFinishes: Promise<void>[] = [];
  private completedResults: CompletedFileResult[] = [];
  private completedBlobs: Blob[] = [];

  // Set on accept() when the receiver picked a save location — either a
  // whole directory (multi-file/folder batches) or a single file (the
  // common one-file case, which gets the nicer "save as" picker).
  private directoryHandle: FileSystemDirectoryHandle | null = null;
  private singleFileHandle: FileSystemFileHandle | null = null;

  private transferActive = false;
  private receiveLastSampleTime = 0;
  private receiveLastSampleBytes = 0;

  private status: TransferStatus = "idle";
  private disconnectGraceTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectGiveUpTimer: ReturnType<typeof setTimeout> | null = null;
  private connectedStuckTimer: ReturnType<typeof setTimeout> | null = null;
  private iceRestartInFlight = false;
  private intentionallyClosed = false;

  constructor(
    private readonly roomId: string,
    private readonly role: PeerRole,
  ) {
    super();
  }

  /** Sender only. Must be called before or right after connect(). */
  setFiles(files: DroppedFile[]): void {
    this.files = files;
    if (this.channel?.readyState === "open") this.sendBatchMeta();
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
   * Receiver only: accept an incoming batch after reviewing its file list.
   * On browsers that support it (Chromium-based), this prompts the user to
   * pick a save location — a single "Save As" for one file, or a folder
   * for multiple files/a folder batch — and streams straight to disk;
   * elsewhere it falls back to buffering in memory and triggering a
   * normal download per file once complete.
   */
  async accept(): Promise<void> {
    const isMulti =
      this.incomingFiles.length > 1 || this.incomingFiles.some((f) => f.relativePath.includes("/"));

    if (typeof window !== "undefined") {
      try {
        if (isMulti && window.showDirectoryPicker) {
          this.directoryHandle = await window.showDirectoryPicker({ mode: "readwrite" });
        } else if (!isMulti && window.showSaveFilePicker) {
          this.singleFileHandle = await window.showSaveFilePicker({
            suggestedName: this.incomingFiles[0]?.name,
          });
        }
      } catch {
        // User cancelled the picker, or the browser refused — fall back to
        // the in-memory path rather than blocking the transfer.
        this.directoryHandle = null;
        this.singleFileHandle = null;
      }
    }

    this.transferActive = true;
    this.setStatus("transferring");
    this.sendControl({ type: "accept" });
  }

  /** Receiver only: decline an incoming batch. */
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
    if (this.connectedStuckTimer) {
      clearTimeout(this.connectedStuckTimer);
      this.connectedStuckTimer = null;
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
      if (this.role === "sender" && this.files.length > 0) this.sendBatchMeta();
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
        case "batch-meta":
          this.incomingFiles = msg.files;
          this.totalIncomingBytes = msg.files.reduce((sum, f) => sum + f.size, 0);
          this.receivedBytesTotal = 0;
          this.receiveLastSampleTime = 0;
          this.receiveLastSampleBytes = 0;
          this.completedResults = [];
          this.completedBlobs = [];
          this.pendingFileFinishes = [];
          this.setStatus("awaiting-accept");
          this.emit("incoming-batch", { files: this.incomingFiles, totalBytes: this.totalIncomingBytes });
          break;
        case "accept":
          this.transferActive = true;
          if (this.files.length > 0) void this.sendBatch();
          break;
        case "reject":
          this.setStatus("rejected");
          break;
        case "file-start": {
          this.currentFileIndex = msg.index;
          const slot: ReceiveSlot = { writeQueue: Promise.resolve(), writable: null, fileHandle: null, chunks: [] };
          slot.writeQueue = this.prepareFileTarget(msg.index, slot);
          this.currentSlot = slot;
          break;
        }
        case "file-end": {
          // Capture the slot synchronously — by the time this async call
          // resolves, "file-start" for the next file may already have
          // replaced this.currentSlot with a new one.
          const slot = this.currentSlot;
          if (slot) this.pendingFileFinishes.push(this.finishCurrentFile(msg.index, msg.sha256, slot));
          break;
        }
        case "batch-end":
          // "batch-end" can arrive before the last file's async
          // close+verify has actually finished — wait for every
          // in-flight finishCurrentFile() before reporting completion.
          void Promise.all(this.pendingFileFinishes).then(() => this.finishBatch());
          break;
      }
      return;
    }

    const buffer = event.data as ArrayBuffer;
    this.receivedBytesTotal += buffer.byteLength;

    const slot = this.currentSlot;
    if (slot) {
      slot.writeQueue = slot.writeQueue.then(() => {
        if (slot.writable) return slot.writable.write(buffer);
        slot.chunks.push(buffer);
      });
    }

    // Defensive: guarantee the UI shows a progress bar even if the local
    // "accept" status update ever raced with the first chunk arriving.
    if (this.status !== "transferring") this.setStatus("transferring");

    const now = performance.now();
    if (this.receiveLastSampleTime === 0) {
      this.receiveLastSampleTime = now;
      this.receiveLastSampleBytes = this.receivedBytesTotal;
      this.reportProgress(this.receivedBytesTotal, this.totalIncomingBytes, 0);
    } else if (now - this.receiveLastSampleTime >= 200 || this.receivedBytesTotal >= this.totalIncomingBytes) {
      const speedBps =
        ((this.receivedBytesTotal - this.receiveLastSampleBytes) / (now - this.receiveLastSampleTime)) *
          1000 || 0;
      this.reportProgress(this.receivedBytesTotal, this.totalIncomingBytes, speedBps);
      this.receiveLastSampleTime = now;
      this.receiveLastSampleBytes = this.receivedBytesTotal;
    }
  }

  /** Creates (and creates parent folders for) the write target for one
   * incoming file, writing the result into `slot` rather than `this` so a
   * later file's setup can never clobber it. Runs as the head of
   * slot.writeQueue so chunks that arrive before this resolves still
   * queue up in the right order. */
  private async prepareFileTarget(index: number, slot: ReceiveSlot): Promise<void> {
    const meta = this.incomingFiles[index];
    if (!meta) return;

    try {
      if (this.directoryHandle) {
        const parts = meta.relativePath.split("/").filter(Boolean);
        let dir = this.directoryHandle;
        for (let i = 0; i < parts.length - 1; i++) {
          dir = await dir.getDirectoryHandle(parts[i], { create: true });
        }
        const fileName = parts[parts.length - 1] || meta.name;
        const fileHandle = await dir.getFileHandle(fileName, { create: true });
        slot.fileHandle = fileHandle;
        slot.writable = await fileHandle.createWritable();
      } else if (this.singleFileHandle && index === 0) {
        slot.fileHandle = this.singleFileHandle;
        slot.writable = await this.singleFileHandle.createWritable();
      }
    } catch {
      // Fall back to buffering this file in memory.
      slot.writable = null;
      slot.fileHandle = null;
    }
  }

  private async finishCurrentFile(index: number, expectedSha256: string, slot: ReceiveSlot): Promise<void> {
    await slot.writeQueue;
    const meta = this.incomingFiles[index];
    if (!meta) return;

    this.setStatus("verifying");
    let verified: boolean;

    if (slot.writable && slot.fileHandle) {
      await slot.writable.close();
      const savedFile = await slot.fileHandle.getFile();
      const buffer = await savedFile.arrayBuffer();
      const actualSha256 = await sha256Hex(buffer);
      verified = actualSha256 === expectedSha256;
    } else {
      const actualSha256 = await sha256Chunks(slot.chunks, meta.size);
      verified = actualSha256 === expectedSha256;
      this.completedBlobs.push(new Blob(slot.chunks, { type: meta.mime }));
    }

    this.completedResults.push({ meta, verified });

    if (!verified) {
      this.emit("error", {
        message: `Integrity check failed for "${meta.relativePath}" — it may not match what was sent.`,
      });
    }
  }

  private finishBatch(): void {
    const savedToDisk = Boolean(this.directoryHandle || this.singleFileHandle);
    this.setStatus("completed");
    this.emit("completed", {
      files: this.completedResults,
      savedToDisk,
      blobs: savedToDisk ? undefined : this.completedBlobs,
    });
  }

  private sendBatchMeta(): void {
    if (this.files.length === 0 || !this.channel) return;
    this.setStatus("awaiting-accept");
    const files: FileMeta[] = this.files.map(({ file, relativePath }) => ({
      name: file.name,
      relativePath,
      size: file.size,
      mime: file.type || "application/octet-stream",
    }));
    this.sendControl({ type: "batch-meta", files });
  }

  private sendControl(msg: DataChannelMessage): void {
    this.channel?.send(JSON.stringify(msg));
  }

  private async sendBatch(): Promise<void> {
    const channel = this.channel;
    if (!channel) return;

    this.setStatus("transferring");
    const totalBytes = this.files.reduce((sum, { file }) => sum + file.size, 0);
    let sentBytes = 0;

    for (let index = 0; index < this.files.length; index++) {
      if (this.intentionallyClosed) return;
      this.currentFileIndex = index;
      const { file } = this.files[index];

      this.sendControl({ type: "file-start", index });
      const hashPromise = sha256File(file);

      let offset = 0;
      let lastSampleTime = performance.now();
      let lastSampleBytes = sentBytes;

      while (offset < file.size) {
        if (this.intentionallyClosed) return;

        if (channel.readyState !== "open") {
          // Paused mid-flight by a reconnect — resumes from this same
          // offset once the channel (and ICE path) comes back.
          await new Promise((resolve) => setTimeout(resolve, 500));
          continue;
        }

        if (channel.bufferedAmount > MAX_BUFFERED_AMOUNT) {
          await this.waitForBufferedAmountLow(channel);
          continue;
        }

        const buffer = await file.slice(offset, offset + CHUNK_SIZE).arrayBuffer();
        try {
          channel.send(buffer);
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 300));
          continue;
        }
        offset += buffer.byteLength;

        const now = performance.now();
        const totalSoFar = sentBytes + offset;
        if (now - lastSampleTime >= 200 || offset === file.size) {
          const speedBps = ((totalSoFar - lastSampleBytes) / (now - lastSampleTime)) * 1000 || 0;
          this.reportProgress(totalSoFar, totalBytes, speedBps);
          lastSampleTime = now;
          lastSampleBytes = totalSoFar;
        }
      }

      sentBytes += file.size;
      this.setStatus("verifying");
      const sha256 = await hashPromise;
      this.sendControl({ type: "file-end", index, sha256 });
      this.setStatus("transferring");
    }

    this.sendControl({ type: "batch-end" });
    this.setStatus("completed");
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

  private currentFileName(): string {
    const list = this.role === "sender" ? this.files.map((f) => f.relativePath) : this.incomingFiles.map((f) => f.relativePath);
    return list[this.currentFileIndex] ?? "";
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
      currentFileIndex: this.currentFileIndex,
      currentFileName: this.currentFileName(),
      fileCount: this.role === "sender" ? this.files.length : this.incomingFiles.length,
    });
  }

  private setStatus(status: TransferStatus): void {
    if (status === "completed" || status === "cancelled" || status === "rejected") {
      this.transferActive = false;
    }

    // "connected" means ICE/DTLS came up — it does NOT guarantee the data
    // channel can actually deliver messages. On a symmetric-NAT/strict-
    // firewall network (common when sender and receiver are on different
    // networks or countries), the connection can nominate a candidate pair
    // that never delivers a single byte, leaving both sides silently
    // parked on "Connected" forever. Watch for exactly that: if nothing
    // moves the status past "connected" in time, surface a real error
    // instead of hanging.
    if (this.connectedStuckTimer) {
      clearTimeout(this.connectedStuckTimer);
      this.connectedStuckTimer = null;
    }
    if (status === "connected") {
      this.connectedStuckTimer = setTimeout(() => {
        this.connectedStuckTimer = null;
        if (this.status === "connected") {
          this.emit("error", {
            message:
              "Connected, but no data is arriving — this usually means a strict NAT " +
              "or firewall is blocking the direct link between these two networks. " +
              "Try both devices on the same Wi-Fi, or ask the site owner to add a " +
              "TURN relay server.",
          });
          this.setStatus("error");
        }
      }, CONNECTED_STUCK_MS);
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
