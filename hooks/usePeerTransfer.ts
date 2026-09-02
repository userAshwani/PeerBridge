"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  CompletedTransfer,
  IncomingBatch,
  PeerRole,
  PeerTransferSession,
  ReceiverFileProgress,
  TransferProgress,
  TransferStatus,
} from "@/lib/webrtc";
import { DroppedFile } from "@/lib/collect-files";

export interface UsePeerTransferResult {
  status: TransferStatus;
  progress: TransferProgress | null;
  /** Sender only: the receiver's own confirmed progress on the file it's
   * currently receiving — null until the first report arrives. */
  receiverProgress: ReceiverFileProgress | null;
  incomingBatch: IncomingBatch | null;
  completed: CompletedTransfer | null;
  errorMessage: string | null;
  noticeMessage: string | null;
  setFiles: (files: DroppedFile[]) => void;
  accept: () => void;
  reject: () => void;
  cancel: () => void;
}

export function usePeerTransfer(roomId: string | null, role: PeerRole): UsePeerTransferResult {
  const sessionRef = useRef<PeerTransferSession | null>(null);
  const [status, setStatus] = useState<TransferStatus>("idle");
  const [progress, setProgress] = useState<TransferProgress | null>(null);
  const [receiverProgress, setReceiverProgress] = useState<ReceiverFileProgress | null>(null);
  const [incomingBatch, setIncomingBatch] = useState<IncomingBatch | null>(null);
  const [completed, setCompleted] = useState<CompletedTransfer | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!roomId) return;

    const session = new PeerTransferSession(roomId, role);
    sessionRef.current = session;

    session.on("status", (s) => {
      setStatus(s);
      // A fresh status change means any previous notice no longer applies.
      if (s !== "closed" && s !== "cancelled") setNoticeMessage(null);
    });
    session.on("progress", setProgress);
    session.on("receiver-progress", setReceiverProgress);
    session.on("incoming-batch", setIncomingBatch);
    session.on("completed", setCompleted);
    session.on("error", ({ message }) => setErrorMessage(message));
    session.on("notice", ({ message }) => setNoticeMessage(message));

    session.connect();

    return () => {
      session.destroy();
      sessionRef.current = null;
    };
  }, [roomId, role]);

  const setFiles = useCallback((files: DroppedFile[]) => {
    sessionRef.current?.setFiles(files);
  }, []);

  const accept = useCallback(() => {
    void sessionRef.current?.accept();
  }, []);

  const reject = useCallback(() => {
    sessionRef.current?.reject();
  }, []);

  const cancel = useCallback(() => {
    sessionRef.current?.cancel();
  }, []);

  return {
    status,
    progress,
    receiverProgress,
    incomingBatch,
    completed,
    errorMessage,
    noticeMessage,
    setFiles,
    accept,
    reject,
    cancel,
  };
}
