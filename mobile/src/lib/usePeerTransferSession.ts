import { useEffect, useRef, useState } from "react";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import type { File, Directory } from "expo-file-system";
import {
  CompletedTransfer,
  IncomingBatch,
  PeerRole,
  PeerTransferSession,
  TransferProgress,
  TransferStatus,
} from "./webrtc-session";

export interface UsePeerTransferSessionResult {
  status: TransferStatus;
  progress: TransferProgress | null;
  incomingBatch: IncomingBatch | null;
  completed: CompletedTransfer | null;
  errorMessage: string | null;
  noticeMessage: string | null;
  setFile: (file: File) => void;
  /** Copies the finished file out to a folder the user picks. Only
   * meaningful once the transfer has completed — see PeerTransferSession.exportTo. */
  exportTo: (dir: Directory) => Promise<string>;
  receivedFile: () => File | null;
  accept: () => void;
  reject: () => void;
  cancel: () => void;
}

export function usePeerTransferSession(
  roomId: string | null,
  role: PeerRole,
  // Sender only: the file to send, registered on the session the instant
  // it's created (see below) rather than pushed in afterward — pushing it
  // in via a separately-timed call (a queueMicrotask right after the
  // roomId-triggering setState, guessing it'll land after this effect
  // creates the session) is racy on React Native: nothing guarantees this
  // effect runs before that microtask drains, and when it loses the race
  // the file is silently never registered, so the channel opens but no
  // batch-meta is ever sent — the "connected on both sides, then nothing"
  // symptom this file's comment used to way to punt on.
  initialFile?: File | null,
): UsePeerTransferSessionResult {
  const sessionRef = useRef<PeerTransferSession | null>(null);
  const [status, setStatus] = useState<TransferStatus>("idle");
  const [progress, setProgress] = useState<TransferProgress | null>(null);
  const [incomingBatch, setIncomingBatch] = useState<IncomingBatch | null>(null);
  const [completed, setCompleted] = useState<CompletedTransfer | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!roomId) return;

    const session = new PeerTransferSession(roomId, role);
    sessionRef.current = session;
    if (role === "sender" && initialFile) session.setFile(initialFile);

    session.on("status", (s) => {
      setStatus(s);
      if (s !== "closed" && s !== "cancelled") setNoticeMessage(null);
      // A status change means whatever produced the last error is over —
      // without this, a stale error from an earlier failed attempt (e.g.
      // the "connected but no data" watchdog) stayed on screen forever,
      // stacked underneath a completely different, later status like
      // "Closed", making it look like both were happening at once.
      if (s !== "error") setErrorMessage(null);
    });
    session.on("progress", setProgress);
    session.on("incoming-batch", setIncomingBatch);
    session.on("completed", setCompleted);
    session.on("error", ({ message }) => setErrorMessage(message));
    session.on("notice", ({ message }) => setNoticeMessage(message));

    // Keeps the screen (and with it, the app itself — Android suspends a
    // screen-off app the same as a backgrounded one) from idling out mid-
    // transfer. This is a real, common failure mode, not an edge case: a
    // 5-second screen timeout is shorter than almost any transfer, and it
    // was hitting both the sender (killing an in-progress send after 45s
    // of silence) and the receiver ("the sender disconnected") in exactly
    // the way reported. Not a substitute for a proper Android foreground
    // service — this doesn't help once the user actually switches to a
    // different app — but it fixes the far more common "phone just went
    // to sleep on its own" case for free, with an official, actively
    // maintained Expo module.
    const keepAwakeTag = `peerbridge-transfer-${roomId}`;
    void activateKeepAwakeAsync(keepAwakeTag);

    session.connect();

    return () => {
      session.destroy();
      sessionRef.current = null;
      deactivateKeepAwake(keepAwakeTag);
    };
  }, [roomId, role, initialFile]);

  return {
    status,
    progress,
    incomingBatch,
    completed,
    errorMessage,
    noticeMessage,
    setFile: (file) => sessionRef.current?.setFile(file),
    exportTo: async (dir) => {
      const session = sessionRef.current;
      if (!session) throw new Error("There's no received file to save yet.");
      return session.exportTo(dir);
    },
    receivedFile: () => sessionRef.current?.getReceivedFile() ?? null,
    accept: () => void sessionRef.current?.accept(),
    reject: () => sessionRef.current?.reject(),
    cancel: () => sessionRef.current?.cancel(),
  };
}
