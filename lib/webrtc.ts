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
//        sender -> "file-start" {index, segments?} — segments present only
//                   for files large enough to split across parallel
//                   connections (see below)
//        sender -> binary chunks — each one is a small self-describing
//                   frame: [1 byte connId][8 bytes absolute file position
//                   (Float64)][raw chunk bytes], sent on whichever channel
//                   (primary or a parallel worker) owns that byte range.
//                   Framing the position into every chunk means the
//                   receiver can write it straight to the right place
//                   regardless of delivery order across channels, and a
//                   worker channel can safely hand its remaining bytes to
//                   the primary channel if it drops — nothing depends on
//                   which physical channel a chunk arrives on.
//        sender -> "file-end" {index, sha256} — hash computed in parallel
//                   with that file's chunk loop
//   4. sender -> "batch-end" once every file is done
//
// Parallel connections (the "download in parts" feature): for files at or
// above PARALLEL_MIN_FILE_SIZE, the sender additionally negotiates up to
// PARALLEL_CONNECTIONS - 1 extra RTCPeerConnections with the same peer
// (each is a fully independent transport with its own congestion window —
// unlike multiple RTCDataChannels on ONE RTCPeerConnection, which share one
// SCTP association and one congestion window, and so would give zero
// throughput benefit) and splits that file into that many contiguous byte
// ranges, one per connection, sent concurrently. This mirrors download
// accelerators like IDM, which get their speed by opening multiple
// connections to a server rather than one — the benefit here is the same
// mechanism, but isn't guaranteed the same payoff: two peers are usually
// bottlenecked by one side's raw link speed, which parallel connections
// between the same two endpoints can't exceed. It's most likely to help on
// exactly the kind of long-distance/high-latency link (e.g. relayed
// through TURN across countries) where a single connection's congestion
// window struggles to fill the available bandwidth.
//
// Room-level control (cancel, disconnect) travels over the signaling
// WebSocket instead, so it still works even before the data channel opens.
//
// All file bytes stay in RTCDataChannel buffers / browser memory (or are
// streamed straight to a user-picked disk location) — the signaling server
// (lib/signaling-client.ts) only ever sees SDP/ICE.

import { Emitter } from "./emitter";
import { RTCSignalData, SignalingClient } from "./signaling-client";
import { sha256File, sha256Hex } from "./sha256";
import { DroppedFile } from "./collect-files";

export const CHUNK_SIZE = 64 * 1024; // 64KB — the actual wire frame size, header included
const CHUNK_HEADER_SIZE = 9; // 1 byte connId + 8 byte float64 position, see encodeChunk
// The 9-byte position header rides inside the same 64KB frame budget that
// worked before it existed — reading full 64KB of *payload* and adding the
// header on top pushes every full-size frame to 65,545 bytes, past the
// hard message-size ceiling some WebRTC stacks still default to (65,536,
// a legacy pre-max-message-size-negotiation value). That silently failed
// every channel.send() for any chunk this size, retried forever, and never
// sent a byte — this constant is what actually gets read from the file.
const PAYLOAD_SIZE = CHUNK_SIZE - CHUNK_HEADER_SIZE;
const BUFFERED_AMOUNT_LOW_THRESHOLD = 1 * 1024 * 1024; // 1MB
const MAX_BUFFERED_AMOUNT = 8 * 1024 * 1024; // pause sending above this
const DISCONNECT_GRACE_MS = 6000; // tolerate brief ICE blips before restarting
const RECONNECT_GIVEUP_MS = 30000; // fully fail if not back within this long
const CONNECTED_STUCK_MS = 18000; // "connected" per ICE but no protocol progress
const PEER_LEFT_GRACE_MS = 6000; // tolerate a signaling blip before declaring the peer gone
const TRANSFER_STALL_MS = 15000; // status says "transferring" but no bytes have actually moved

// Parallel-connection ("download in parts") tuning. Each additional
// connection is a full extra ICE negotiation and, when a direct path isn't
// available, an extra TURN relay allocation — see DEPLOY.md's TURN section
// for the coturn port-range headroom this assumes. 4 total (primary + 3
// workers) balances a real shot at benefiting long-distance transfers
// against not hammering the relay when many users are transferring at
// once.
const PARALLEL_CONNECTIONS = 4;
const PARALLEL_MIN_FILE_SIZE = 4 * 1024 * 1024; // below this, one connection is already plenty
const WORKER_CONNECT_TIMEOUT_MS = 5000; // don't let a slow/blocked worker delay the transfer

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
      return servers;
    }
  }

  // No dedicated TURN configured — fall back to Metered's "Open Relay
  // Project" (openrelay.metered.ca), a TURN server Metered publishes with
  // fixed, intentionally public credentials for exactly this use. It's
  // shared/rate-limited with no uptime guarantee, not a substitute for a
  // dedicated free-tier account under load — but it means cross-network
  // transfers work out of the box instead of silently failing until
  // someone configures NEXT_PUBLIC_TURN_*. See DEPLOY.md.
  // Includes explicit ?transport=tcp / turns: (TLS) variants on top of
  // plain UDP — some networks (many corporate/mobile firewalls) block
  // outbound UDP entirely, and TLS-on-443 is the option most likely to
  // pass through those since it's indistinguishable from ordinary HTTPS.
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

/** One parallel connection's byte range within the file currently in
 * flight — connId 0 is always the primary connection. */
export interface FileSegment {
  connId: number;
  start: number;
  end: number;
}

export interface SegmentProgress {
  connId: number;
  bytesTransferred: number;
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
  /** Bytes transferred for just the file currently in flight — for a
   * per-file "parts" progress display, as opposed to `bytesTransferred`
   * above, which is a running total across the whole batch. */
  currentFileBytesTransferred: number;
  currentFileTotalBytes: number;
  /** Present only when the current file is large enough to be split
   * across parallel connections — one entry per connection, in real time. */
  segments?: SegmentProgress[];
}

/** Sender-side only: the receiver's own confirmed progress on the file it's
 * currently receiving, reported back over the data channel — distinct from
 * (and typically lagging slightly behind) the sender's own `progress` event,
 * which only reflects what's been handed to the RTCDataChannel locally, not
 * what the other side has actually received and written. */
export interface ReceiverFileProgress {
  currentFileIndex: number;
  currentFileBytesTransferred: number;
  currentFileTotalBytes: number;
  segments?: SegmentProgress[];
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
  "receiver-progress": ReceiverFileProgress;
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
  | { type: "file-start"; index: number; segments?: FileSegment[] }
  | { type: "file-end"; index: number; sha256: string }
  | { type: "batch-end" }
  | {
      type: "receiver-progress";
      index: number;
      bytesTransferred: number;
      totalBytes: number;
      segments?: SegmentProgress[];
    };

/** Every binary chunk is prefixed with 9 bytes: which connection sent it
 * (cosmetic — used only to attribute progress to the right segment in the
 * UI) and the chunk's absolute position in the file currently being
 * received (load-bearing — this is what makes writing it out correct
 * regardless of which physical channel it arrived on or what order chunks
 * from different channels interleave in). */
function encodeChunk(connId: number, position: number, payload: ArrayBuffer): ArrayBuffer {
  const out = new ArrayBuffer(9 + payload.byteLength);
  const view = new DataView(out);
  view.setUint8(0, connId);
  view.setFloat64(1, position);
  new Uint8Array(out, 9).set(new Uint8Array(payload));
  return out;
}

function decodeChunk(buffer: ArrayBuffer): { connId: number; position: number; payload: ArrayBuffer } {
  const view = new DataView(buffer);
  return {
    connId: view.getUint8(0),
    position: view.getFloat64(1),
    payload: buffer.slice(9),
  };
}

/** Per-file receive state. Created fresh on every "file-start" and passed
 * by reference to whatever needs it, rather than read back off shared
 * `this.*` fields later — those get reset the moment the NEXT file's
 * "file-start" arrives, which (since a write can take real wall-clock
 * time) can happen before the previous file's "file-end" has finished
 * closing/hashing it. Passing the slot itself sidesteps that race. */
interface ReceiveSlot {
  index: number;
  writeQueue: Promise<void>;
  writable: FileSystemWritableFileStream | null;
  fileHandle: FileSystemFileHandle | null;
  /** In-memory fallback when there's no writable disk target — pre-sized
   * to the file's full byte length and written at absolute positions, same
   * as the disk path, so one write path works whether split across
   * parallel connections or not. */
  buffer: Uint8Array | null;
  /** Set only when the sender split this file across parallel connections
   * — purely descriptive for the UI (segment byte ranges), not needed for
   * correctness since every chunk already carries its own position. */
  segments: FileSegment[] | null;
  /** Bytes received so far per connId — UI only. */
  segmentReceived: Map<number, number>;
  /** Set once "file-end" arrives; null until then. */
  fileEndSha256: string | null;
  /** Guards against finishing this file twice — the finish condition (all
   * bytes in + sha256 known) can become true from either "file-end"
   * arriving or the last chunk arriving, whichever happens second. */
  finished: boolean;
}

/** One additional parallel connection beyond the primary, used only for
 * splitting large files into concurrently-sent byte ranges. */
interface WorkerConn {
  connId: number;
  pc: RTCPeerConnection;
  channel: RTCDataChannel | null;
}

export class PeerTransferSession extends Emitter<TransferEvents> {
  private signaling = new SignalingClient();
  private pc: RTCPeerConnection | null = null;
  private channel: RTCDataChannel | null = null;
  private remotePeerId: string | null = null;

  // ---- parallel connections (connId 0 is always the primary above) ------
  private workerConns: Map<number, WorkerConn> = new Map();
  private workerNegotiationStarted = false;

  // ---- sender-side batch state -------------------------------------------
  private files: DroppedFile[] = [];

  // ---- receiver-side batch state -----------------------------------------
  private incomingFiles: FileMeta[] = [];
  private totalIncomingBytes = 0;
  private receivedBytesTotal = 0;
  /** `receivedBytesTotal` as of the current file's "file-start" — subtracting
   * this out gives bytes received for just the in-flight file. */
  private fileStartCumulativeBytes = 0;
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
  private candidateTypeCounts: Record<string, number> = {};

  private status: TransferStatus = "idle";
  private disconnectGraceTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectGiveUpTimer: ReturnType<typeof setTimeout> | null = null;
  private connectedStuckTimer: ReturnType<typeof setTimeout> | null = null;
  private peerLeftGraceTimer: ReturnType<typeof setTimeout> | null = null;
  private transferStallTimer: ReturnType<typeof setTimeout> | null = null;
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
      // Sender side: a receiver joined (or an existing one was
      // re-announced after this session's own signaling socket
      // reconnected) — either way, a peer we might have just given up on
      // is confirmed present, so cancel any pending "peer left" teardown.
      this.clearPeerLeftGrace();
      this.remotePeerId = peerId;
      void this.initiateAsSender();
    });

    this.signaling.on("room-joined", ({ senderId }) => {
      // Receiver side: prepare to receive the offer via the "signal" event.
      this.clearPeerLeftGrace();
      this.remotePeerId = senderId;
      this.setStatus("establishing-connection");
      this.preparePeerConnection();
    });

    this.signaling.on("signal", ({ data }) => void this.handleSignal(data));

    this.signaling.on("peer-left", () => {
      if (this.intentionallyClosed || this.peerLeftGraceTimer) return;
      // The signaling socket for either side can drop and reconnect on
      // its own (a free-tier host restarting mid-negotiation is a real,
      // observed cause) — server/signaling.js re-announces both sides to
      // each other once that reconnect rejoins the room. Give that a
      // short window before treating this as a real departure, so a
      // transient blip doesn't tear down a connection that's about to
      // heal itself.
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

    this.signaling.on("error", ({ message }) => this.emit("error", { message }));

    this.signaling.connect();

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", this.handleVisibilityChange);
    }
  }

  /**
   * Mobile browsers throttle or fully suspend background network activity
   * (e.g. the sender switches to WhatsApp to share the room code) — the
   * signaling socket can silently drop while backgrounded. Reconnecting is
   * already automatic, but forcing it the instant the tab is foregrounded
   * again (rather than waiting on a possibly-still-pending backoff timer)
   * closes that gap as much as is possible from a web page: nothing here
   * can prevent the OS from discarding the tab entirely under memory
   * pressure, which does lose all in-page state including the picked
   * files — that's outside what any web API can control.
   */
  private handleVisibilityChange = (): void => {
    if (document.visibilityState === "visible") {
      this.signaling.reconnectNow();
    }
  };

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
    this.armTransferStallWatchdog();
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
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", this.handleVisibilityChange);
    }
    this.signaling.leaveRoom();
    this.signaling.close();
    this.channel?.close();
    this.pc?.close();
    this.channel = null;
    this.pc = null;
    this.closeWorkerConnections();
    this.removeAllListeners();
  }

  private closeWorkerConnections(): void {
    for (const worker of this.workerConns.values()) {
      worker.channel?.close();
      worker.pc.close();
    }
    this.workerConns.clear();
    this.workerNegotiationStarted = false;
  }

  // ---- connection setup -------------------------------------------------

  private preparePeerConnection(): RTCPeerConnection {
    // A fresh pc means fresh negotiation — clear any timers tied to a
    // previous (now-abandoned) pc first, otherwise armGiveUpTimer()'s
    // "already armed" guard would skip arming one for this new attempt.
    this.clearTimers();
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.pc = pc;
    this.candidateTypeCounts = {};

    pc.onicecandidate = (event) => {
      if (!event.candidate) return;
      // Tally which ICE candidate types actually got gathered (host,
      // srflx via STUN, relay via TURN) — if "relay" never shows up here,
      // the TURN server isn't reachable from this network at all, which
      // is the single most useful fact for diagnosing a NAT failure.
      const type = event.candidate.type ?? "unknown";
      this.candidateTypeCounts[type] = (this.candidateTypeCounts[type] ?? 0) + 1;

      if (this.remotePeerId) {
        this.signaling.sendSignal(
          this.roomId,
          { candidate: event.candidate.toJSON(), connId: 0 },
          this.remotePeerId,
        );
      }
    };

    pc.onconnectionstatechange = () => this.handleConnectionStateChange(pc);
    pc.oniceconnectionstatechange = () => {
      // eslint-disable-next-line no-console
      console.debug(
        `[PeerBridge] ICE connection state: ${pc.iceConnectionState} (candidates so far: ${this.candidateSummary()})`,
      );
    };

    if (this.role === "receiver") {
      pc.ondatachannel = (event) => this.attachChannel(event.channel);
    }

    // Covers the case this connection never reaches "connected" *or*
    // "failed"/"disconnected" at all — some networks silently drop every
    // packet a candidate pair check sends, so the browser can sit in
    // "checking" indefinitely without ever reporting a state change to
    // react to. Without this, that hangs forever with no error shown.
    this.armGiveUpTimer(pc);

    return pc;
  }

  private candidateSummary(): string {
    const entries = Object.entries(this.candidateTypeCounts);
    if (entries.length === 0) return "none yet";
    return entries.map(([type, count]) => `${count} ${type}`).join(", ");
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
        const counts = this.candidateTypeCounts;
        const hasRelay = (counts.relay ?? 0) > 0;
        const hasAny = Object.keys(counts).length > 0;
        let diagnosis: string;
        if (!hasAny) {
          diagnosis =
            "No connection candidates were found at all on your side — this network is " +
            "blocking outbound UDP/TCP traffic entirely (common on some corporate/public " +
            "Wi-Fi). Try a different network, e.g. mobile data.";
        } else if (!hasRelay) {
          diagnosis =
            "A relay (TURN) server is required for this connection but couldn't be reached. " +
            "This is a server-side configuration issue, not something you can fix on your end.";
        } else {
          diagnosis =
            "A relay path was found but the connection still didn't complete — this can " +
            "happen with very restrictive firewalls on one or both sides.";
        }
        // eslint-disable-next-line no-console
        console.warn(
          `[PeerBridge] Giving up after ${RECONNECT_GIVEUP_MS / 1000}s. ` +
            `connectionState=${pc.connectionState} iceConnectionState=${pc.iceConnectionState} ` +
            `candidates=${this.candidateSummary()}`,
        );
        this.emit("error", {
          message: `Couldn't establish a connection. ${diagnosis}`,
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
      this.signaling.sendSignal(this.roomId, { sdp: offer, connId: 0 }, this.remotePeerId);
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
    this.clearPeerLeftGrace();
    this.clearTransferStallWatchdog();
  }

  private clearPeerLeftGrace(): void {
    if (this.peerLeftGraceTimer) {
      clearTimeout(this.peerLeftGraceTimer);
      this.peerLeftGraceTimer = null;
    }
  }

  /** Re-armed on every chunk actually sent or received. If it ever fires
   * while status is still "transferring", nothing has moved for
   * TRANSFER_STALL_MS despite the connection reporting as open — surfaces
   * that as a real error instead of an indefinite silent hang. Doesn't
   * fire on legitimately fast/small transfers: finishing moves status past
   * "transferring" well before the timer would ever go off. */
  private armTransferStallWatchdog(): void {
    if (this.transferStallTimer) clearTimeout(this.transferStallTimer);
    this.transferStallTimer = setTimeout(() => {
      this.transferStallTimer = null;
      if (this.status === "transferring" && !this.intentionallyClosed) {
        // eslint-disable-next-line no-console
        console.warn(
          `[PeerBridge] Transfer stalled: no bytes moved in ${TRANSFER_STALL_MS / 1000}s ` +
            `while status=transferring (channel=${this.channel?.readyState}).`,
        );
        this.emit("error", {
          message:
            `No data has moved in ${TRANSFER_STALL_MS / 1000} seconds, even though the ` +
            "connection is open. This usually means the data channel is silently " +
            "blocked by a strict firewall on one side — try again, ideally on a " +
            "different network.",
        });
        this.setStatus("error");
      }
    }, TRANSFER_STALL_MS);
  }

  private clearTransferStallWatchdog(): void {
    if (this.transferStallTimer) {
      clearTimeout(this.transferStallTimer);
      this.transferStallTimer = null;
    }
  }

  private teardownConnection(): void {
    this.clearTimers();
    this.channel?.close();
    this.pc?.close();
    this.channel = null;
    this.pc = null;
    this.closeWorkerConnections();
  }

  private async initiateAsSender(): Promise<void> {
    this.setStatus("establishing-connection");
    const pc = this.preparePeerConnection();
    const channel = pc.createDataChannel("file-transfer", { ordered: true });
    this.attachChannel(channel);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    if (this.remotePeerId) {
      this.signaling.sendSignal(this.roomId, { sdp: offer, connId: 0 }, this.remotePeerId);
    }
  }

  private async handleSignal(data: RTCSignalData): Promise<void> {
    const connId = data.connId;
    let pc: RTCPeerConnection | null;
    if (connId === 0) {
      pc = this.pc;
    } else {
      pc = this.workerConns.get(connId)?.pc ?? null;
      // A worker pc for a connId we don't recognize only ever means the
      // *receiver* is hearing about a new parallel connection the sender
      // just initiated — the sender always creates its own worker pcs
      // itself (in negotiateWorkerConnection) before sending anything, so
      // this lazy path is receiver-only.
      if (!pc && this.role === "receiver") pc = this.createWorkerPcForReceiver(connId);
    }
    if (!pc) return;

    if ("sdp" in data) {
      await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
      if (data.sdp.type === "offer") {
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        if (this.remotePeerId) {
          this.signaling.sendSignal(this.roomId, { sdp: answer, connId }, this.remotePeerId);
        }
      }
    } else if ("candidate" in data) {
      await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
    }
  }

  // ---- parallel worker connections ---------------------------------------

  /** Receiver only: lazily creates the RTCPeerConnection for a parallel
   * connection the sender just initiated (its offer is what triggers this,
   * via handleSignal above). Its data channel arrives via ondatachannel,
   * same shape as the primary but routed straight to handleIncomingChunk —
   * worker channels never carry JSON control messages, only binary chunks. */
  private createWorkerPcForReceiver(connId: number): RTCPeerConnection {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const worker: WorkerConn = { connId, pc, channel: null };
    this.workerConns.set(connId, worker);

    pc.onicecandidate = (event) => {
      if (!event.candidate || !this.remotePeerId) return;
      this.signaling.sendSignal(
        this.roomId,
        { candidate: event.candidate.toJSON(), connId },
        this.remotePeerId,
      );
    };
    pc.ondatachannel = (event) => {
      const channel = event.channel;
      channel.binaryType = "arraybuffer";
      worker.channel = channel;
      channel.onmessage = (e) => this.handleIncomingChunk(e.data as ArrayBuffer);
    };

    return pc;
  }

  /** Sender only: negotiates up to PARALLEL_CONNECTIONS - 1 additional
   * connections with the peer, for splitting large files across. Safe to
   * call more than once — only the first call does anything, and it's
   * cached for the rest of the batch (subsequent large files reuse
   * whichever workers came up, same principle IDM uses: "reuse available
   * connections without additional connect... stages"). Never throws or
   * blocks the transfer — a worker that fails or times out just means one
   * fewer parallel connection for this file, not a failed transfer. */
  private async ensureWorkerConnections(): Promise<void> {
    if (this.workerNegotiationStarted || this.role !== "sender" || !this.remotePeerId) return;
    this.workerNegotiationStarted = true;

    const connIds = Array.from({ length: PARALLEL_CONNECTIONS - 1 }, (_, i) => i + 1);
    await Promise.allSettled(connIds.map((connId) => this.negotiateWorkerConnection(connId)));
  }

  private negotiateWorkerConnection(connId: number): Promise<void> {
    return new Promise((resolve) => {
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      const channel = pc.createDataChannel(`file-transfer-${connId}`, { ordered: true });
      channel.binaryType = "arraybuffer";
      channel.bufferedAmountLowThreshold = BUFFERED_AMOUNT_LOW_THRESHOLD;
      const worker: WorkerConn = { connId, pc, channel };
      this.workerConns.set(connId, worker);

      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve();
      };
      const timeout = setTimeout(finish, WORKER_CONNECT_TIMEOUT_MS);

      channel.onopen = finish;
      // Never opening (or erroring first) just leaves this connId unused —
      // sendFileParallel only ever looks at channels that are actually open.
      channel.onerror = finish;

      pc.onicecandidate = (event) => {
        if (!event.candidate || !this.remotePeerId) return;
        this.signaling.sendSignal(
          this.roomId,
          { candidate: event.candidate.toJSON(), connId },
          this.remotePeerId,
        );
      };

      pc.createOffer()
        .then((offer) => pc.setLocalDescription(offer).then(() => offer))
        .then((offer) => {
          if (this.remotePeerId) {
            this.signaling.sendSignal(this.roomId, { sdp: offer, connId }, this.remotePeerId);
          }
        })
        .catch(finish);
    });
  }

  private computeSegments(fileSize: number, workerConnIds: number[]): FileSegment[] {
    const connIds = [0, ...workerConnIds];
    const n = connIds.length;
    const base = Math.floor(fileSize / n);
    const segments: FileSegment[] = [];
    let start = 0;
    for (let i = 0; i < n; i++) {
      const end = i === n - 1 ? fileSize : start + base;
      segments.push({ connId: connIds[i], start, end });
      start = end;
    }
    return segments;
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
    channel.onerror = () => {
      // Closing a channel/connection intentionally (our own cancel(), or
      // the other side's "cancelled"/teardown reaching us first) can still
      // fire this event in some browsers as a side effect of the abrupt
      // close — not a real transfer failure, so don't surface it as one.
      if (this.intentionallyClosed || ["cancelled", "completed", "rejected", "closed"].includes(this.status)) {
        return;
      }
      this.emit("error", { message: "Data channel error" });
    };
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
          this.fileStartCumulativeBytes = this.receivedBytesTotal;
          const slot: ReceiveSlot = {
            index: msg.index,
            writeQueue: Promise.resolve(),
            writable: null,
            fileHandle: null,
            buffer: null,
            segments: msg.segments ?? null,
            segmentReceived: new Map(),
            fileEndSha256: null,
            finished: false,
          };
          slot.writeQueue = this.prepareFileTarget(msg.index, slot);
          this.currentSlot = slot;
          break;
        }
        case "receiver-progress":
          // Sender side only: the receiver's own confirmed progress on the
          // file it's currently receiving.
          this.emit("receiver-progress", {
            currentFileIndex: msg.index,
            currentFileBytesTransferred: msg.bytesTransferred,
            currentFileTotalBytes: msg.totalBytes,
            segments: msg.segments,
          });
          break;
        case "file-end": {
          const slot = this.currentSlot;
          if (slot && slot.index === msg.index) {
            slot.fileEndSha256 = msg.sha256;
            this.maybeFinishFile(slot);
          }
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

    this.handleIncomingChunk(event.data as ArrayBuffer);
  }

  /** Shared by the primary channel and every worker channel — decodes the
   * chunk's self-describing header and writes it to the right place
   * regardless of which physical channel it arrived on. */
  private handleIncomingChunk(rawBuffer: ArrayBuffer): void {
    const { connId, position, payload } = decodeChunk(rawBuffer);
    this.receivedBytesTotal += payload.byteLength;
    this.armTransferStallWatchdog();

    const slot = this.currentSlot;
    if (slot) {
      slot.writeQueue = slot.writeQueue.then(() => this.writeAt(slot, position, payload));
      slot.segmentReceived.set(connId, (slot.segmentReceived.get(connId) ?? 0) + payload.byteLength);
    }

    // Defensive: guarantee the UI shows a progress bar even if the local
    // "accept" status update ever raced with the first chunk arriving.
    if (this.status !== "transferring") this.setStatus("transferring");

    if (slot) this.maybeFinishFile(slot);
    this.sampleAndReportProgress(slot);
  }

  private async writeAt(slot: ReceiveSlot, position: number, payload: ArrayBuffer): Promise<void> {
    if (slot.writable) {
      await slot.writable.write({ type: "write", position, data: payload });
    } else if (slot.buffer) {
      slot.buffer.set(new Uint8Array(payload), position);
    }
  }

  /** All bytes for the current file are in once the running total matches
   * its known size — true regardless of how many connections it was split
   * across, since every chunk writes to a distinct, non-overlapping
   * position. Finishing needs both that AND the sha256 from "file-end",
   * whichever of the two arrives second. */
  private maybeFinishFile(slot: ReceiveSlot): void {
    if (slot.finished || slot.fileEndSha256 === null) return;
    const currentFileBytesTransferred = this.receivedBytesTotal - this.fileStartCumulativeBytes;
    const currentFileTotalBytes = this.incomingFiles[slot.index]?.size ?? 0;
    if (currentFileBytesTransferred < currentFileTotalBytes) return;

    slot.finished = true;
    this.pendingFileFinishes.push(this.finishCurrentFile(slot.index, slot.fileEndSha256, slot));
  }

  private sampleAndReportProgress(slot: ReceiveSlot | null): void {
    const now = performance.now();
    const shouldSample =
      this.receiveLastSampleTime === 0 ||
      now - this.receiveLastSampleTime >= 200 ||
      this.receivedBytesTotal >= this.totalIncomingBytes;
    if (!shouldSample) return;

    const speedBps =
      this.receiveLastSampleTime === 0
        ? 0
        : ((this.receivedBytesTotal - this.receiveLastSampleBytes) /
            (now - this.receiveLastSampleTime)) *
            1000 || 0;

    const currentFileBytesTransferred = this.receivedBytesTotal - this.fileStartCumulativeBytes;
    const currentFileTotalBytes = this.incomingFiles[this.currentFileIndex]?.size ?? 0;
    const segments: SegmentProgress[] | undefined = slot?.segments?.map((seg) => ({
      connId: seg.connId,
      bytesTransferred: slot.segmentReceived.get(seg.connId) ?? 0,
      totalBytes: seg.end - seg.start,
    }));

    this.reportProgress(
      this.receivedBytesTotal,
      this.totalIncomingBytes,
      speedBps,
      currentFileBytesTransferred,
      currentFileTotalBytes,
      segments,
    );

    // Tells the sender how much of the current file has actually arrived
    // and been queued for writing on this end — distinct from the sender's
    // own view of its send progress, which only reflects what's been
    // handed to the RTCDataChannel locally, not confirmed received here.
    this.sendControl({
      type: "receiver-progress",
      index: this.currentFileIndex,
      bytesTransferred: currentFileBytesTransferred,
      totalBytes: currentFileTotalBytes,
      segments,
    });

    this.receiveLastSampleTime = now;
    this.receiveLastSampleBytes = this.receivedBytesTotal;
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

    if (!slot.writable) {
      // Pre-sized so out-of-order/parallel writes can land at their
      // absolute position, same as the disk path above.
      slot.buffer = new Uint8Array(meta.size);
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
    } else if (slot.buffer) {
      const actualSha256 = await sha256Hex(slot.buffer.buffer as ArrayBuffer);
      verified = actualSha256 === expectedSha256;
      this.completedBlobs.push(new Blob([slot.buffer.buffer as ArrayBuffer], { type: meta.mime }));
    } else {
      verified = false;
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
    this.armTransferStallWatchdog();
    const totalBytes = this.files.reduce((sum, { file }) => sum + file.size, 0);
    let sentBytes = 0;

    for (let index = 0; index < this.files.length; index++) {
      if (this.intentionallyClosed) return;
      this.currentFileIndex = index;
      const { file } = this.files[index];

      if (file.size >= PARALLEL_MIN_FILE_SIZE) {
        await this.ensureWorkerConnections();
      }

      const readyWorkerIds = Array.from(this.workerConns.values())
        .filter((w) => w.channel?.readyState === "open")
        .map((w) => w.connId);
      const segments =
        file.size >= PARALLEL_MIN_FILE_SIZE && readyWorkerIds.length > 0
          ? this.computeSegments(file.size, readyWorkerIds)
          : null;

      this.sendControl({ type: "file-start", index, segments: segments ?? undefined });
      const hashPromise = sha256File(file);

      if (segments) {
        await this.sendFileParallel(file, segments, sentBytes, totalBytes);
      } else {
        await this.sendFileSingle(file, channel, sentBytes, totalBytes);
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

  /** The original single-connection send path, used for files below
   * PARALLEL_MIN_FILE_SIZE or when no worker connections came up. */
  private async sendFileSingle(
    file: File,
    channel: RTCDataChannel,
    sentBytesBefore: number,
    totalBytes: number,
  ): Promise<void> {
    let offset = 0;
    let lastSampleTime = performance.now();
    let lastSampleBytes = sentBytesBefore;

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

      const raw = await file.slice(offset, offset + PAYLOAD_SIZE).arrayBuffer();
      try {
        channel.send(encodeChunk(0, offset, raw));
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 300));
        continue;
      }
      offset += raw.byteLength;
      this.armTransferStallWatchdog();

      const now = performance.now();
      const totalSoFar = sentBytesBefore + offset;
      if (now - lastSampleTime >= 200 || offset === file.size) {
        const speedBps = ((totalSoFar - lastSampleBytes) / (now - lastSampleTime)) * 1000 || 0;
        this.reportProgress(totalSoFar, totalBytes, speedBps, offset, file.size);
        lastSampleTime = now;
        lastSampleBytes = totalSoFar;
      }
    }
  }

  /** Splits the file across `segments` and sends each range concurrently
   * on its own connection. Every chunk carries its own absolute position
   * (see encodeChunk), so a segment whose dedicated channel isn't open —
   * never connected, or dropped mid-transfer — can safely hand its
   * remaining bytes to the primary channel instead of stalling. */
  private async sendFileParallel(
    file: File,
    segments: FileSegment[],
    sentBytesBefore: number,
    totalBytes: number,
  ): Promise<void> {
    const segmentOffsets = new Map<number, number>(segments.map((s) => [s.connId, 0]));
    let lastSampleTime = performance.now();
    let lastSampleBytes = sentBytesBefore;

    const reportCombined = (force = false) => {
      const now = performance.now();
      if (!force && now - lastSampleTime < 200) return;
      const fileBytesSoFar = segments.reduce((sum, s) => sum + (segmentOffsets.get(s.connId) ?? 0), 0);
      const totalSoFar = sentBytesBefore + fileBytesSoFar;
      const speedBps = ((totalSoFar - lastSampleBytes) / (now - lastSampleTime)) * 1000 || 0;
      this.reportProgress(
        totalSoFar,
        totalBytes,
        speedBps,
        fileBytesSoFar,
        file.size,
        segments.map((s) => ({
          connId: s.connId,
          bytesTransferred: segmentOffsets.get(s.connId) ?? 0,
          totalBytes: s.end - s.start,
        })),
      );
      lastSampleTime = now;
      lastSampleBytes = totalSoFar;
    };

    const sendSegment = async (segment: FileSegment): Promise<void> => {
      const dedicatedChannel =
        segment.connId === 0 ? this.channel : this.workerConns.get(segment.connId)?.channel ?? null;
      let offset = 0;
      const length = segment.end - segment.start;

      while (offset < length) {
        if (this.intentionallyClosed) return;

        const channel = dedicatedChannel?.readyState === "open" ? dedicatedChannel : this.channel;
        if (!channel || channel.readyState !== "open") {
          await new Promise((resolve) => setTimeout(resolve, 500));
          continue;
        }
        if (channel.bufferedAmount > MAX_BUFFERED_AMOUNT) {
          await this.waitForBufferedAmountLow(channel);
          continue;
        }

        const absoluteStart = segment.start + offset;
        const chunkEnd = Math.min(absoluteStart + PAYLOAD_SIZE, segment.end);
        const raw = await file.slice(absoluteStart, chunkEnd).arrayBuffer();
        try {
          channel.send(encodeChunk(segment.connId, absoluteStart, raw));
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 300));
          continue;
        }
        offset += raw.byteLength;
        segmentOffsets.set(segment.connId, offset);
        this.armTransferStallWatchdog();
        reportCombined();
      }
    };

    await Promise.all(segments.map(sendSegment));
    reportCombined(true);
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

  private reportProgress(
    bytesTransferred: number,
    totalBytes: number,
    speedBps = 0,
    currentFileBytesTransferred = 0,
    currentFileTotalBytes = 0,
    segments?: SegmentProgress[],
  ): void {
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
      currentFileBytesTransferred,
      currentFileTotalBytes,
      segments,
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
              "or firewall is blocking the direct link between these two networks and " +
              "the relay (TURN) server isn't picking up the slack. This is a server-side " +
              "configuration issue, not something you can fix on your end.",
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
