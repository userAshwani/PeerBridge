import { useEffect, useRef, useState } from "react";
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
  setTargetDirectory: (dir: Directory | null) => void;
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
    });
    session.on("progress", setProgress);
    session.on("incoming-batch", setIncomingBatch);
    session.on("completed", setCompleted);
    session.on("error", ({ message }) => setErrorMessage(message));
    session.on("notice", ({ message }) => setNoticeMessage(message));

    session.connect();

    return () => {
      session.destroy();
      sessionRef.current = null;
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
    setTargetDirectory: (dir) => sessionRef.current?.setTargetDirectory(dir),
    accept: () => void sessionRef.current?.accept(),
    reject: () => sessionRef.current?.reject(),
    cancel: () => sessionRef.current?.cancel(),
  };
}
