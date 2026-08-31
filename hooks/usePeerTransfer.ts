"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  CompletedTransfer,
  FileMeta,
  PeerRole,
  PeerTransferSession,
  TransferProgress,
  TransferStatus,
} from "@/lib/webrtc";

export interface UsePeerTransferResult {
  status: TransferStatus;
  progress: TransferProgress | null;
  incomingFile: FileMeta | null;
  completed: CompletedTransfer | null;
  errorMessage: string | null;
  setFile: (file: File) => void;
  accept: () => void;
  reject: () => void;
}

export function usePeerTransfer(roomId: string | null, role: PeerRole): UsePeerTransferResult {
  const sessionRef = useRef<PeerTransferSession | null>(null);
  const [status, setStatus] = useState<TransferStatus>("idle");
  const [progress, setProgress] = useState<TransferProgress | null>(null);
  const [incomingFile, setIncomingFile] = useState<FileMeta | null>(null);
  const [completed, setCompleted] = useState<CompletedTransfer | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!roomId) return;

    const session = new PeerTransferSession(roomId, role);
    sessionRef.current = session;

    session.on("status", setStatus);
    session.on("progress", setProgress);
    session.on("incoming-file", setIncomingFile);
    session.on("completed", setCompleted);
    session.on("error", ({ message }) => setErrorMessage(message));

    session.connect();

    return () => {
      session.destroy();
      sessionRef.current = null;
    };
  }, [roomId, role]);

  const setFile = useCallback((file: File) => {
    sessionRef.current?.setFile(file);
  }, []);

  const accept = useCallback(() => {
    sessionRef.current?.accept();
  }, []);

  const reject = useCallback(() => {
    sessionRef.current?.reject();
  }, []);

  return { status, progress, incomingFile, completed, errorMessage, setFile, accept, reject };
}
