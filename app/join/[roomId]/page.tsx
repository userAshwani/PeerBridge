"use client";

import { use, useEffect, useRef } from "react";
import { CheckCircle2, XCircle, FileIcon, ShieldAlert, Download } from "lucide-react";
import { StatusPill } from "@/components/StatusPill";
import { ProgressBar } from "@/components/ProgressBar";
import { usePeerTransfer } from "@/hooks/usePeerTransfer";
import { formatBytes, formatSpeed } from "@/lib/format";
import { downloadBlob } from "@/lib/webrtc";

export default function JoinPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = use(params);
  const { status, progress, incomingFile, completed, errorMessage, accept, reject } =
    usePeerTransfer(roomId.toUpperCase(), "receiver");

  const autoDownloaded = useRef(false);
  useEffect(() => {
    if (completed?.verified && !autoDownloaded.current) {
      autoDownloaded.current = true;
      downloadBlob(completed.blob, completed.meta.name);
    }
  }, [completed]);

  return (
    <main className="flex flex-1 flex-col items-center bg-zinc-950 px-4 py-16 text-zinc-100">
      <h1 className="text-2xl font-bold">
        Joining <span className="font-mono text-emerald-400">{roomId.toUpperCase()}</span>
      </h1>

      <div className="mt-8 flex w-full max-w-md flex-col items-center gap-6">
        <StatusPill status={status} />

        {status === "waiting-for-peer" || status === "connecting-signaling" ? (
          <p className="text-center text-sm text-zinc-500">
            Waiting for the sender to appear. Keep this tab open.
          </p>
        ) : null}

        {status === "awaiting-accept" && incomingFile && (
          <div className="w-full rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
            <div className="flex items-center gap-3">
              <FileIcon className="h-8 w-8 text-cyan-400" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-zinc-100">{incomingFile.name}</p>
                <p className="text-xs text-zinc-500">
                  {formatBytes(incomingFile.size)} · {incomingFile.mime || "unknown type"}
                </p>
              </div>
            </div>
            <div className="mt-5 flex gap-3">
              <button
                onClick={accept}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-400 py-2.5 text-sm font-semibold text-zinc-950 hover:opacity-90"
              >
                <CheckCircle2 className="h-4 w-4" /> Accept
              </button>
              <button
                onClick={reject}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-zinc-700 py-2.5 text-sm font-semibold text-zinc-300 hover:border-red-400 hover:text-red-400"
              >
                <XCircle className="h-4 w-4" /> Decline
              </button>
            </div>
          </div>
        )}

        {status === "transferring" && progress && (
          <div className="w-full">
            <ProgressBar percent={progress.percent} />
            <div className="mt-2 flex justify-between text-xs text-zinc-500">
              <span>
                {formatBytes(progress.bytesTransferred)} / {formatBytes(progress.totalBytes)}
              </span>
              <span>{formatSpeed(progress.speedBps)}</span>
            </div>
          </div>
        )}

        {status === "verifying" && (
          <p className="text-sm text-cyan-400">Verifying SHA-256 integrity…</p>
        )}

        {completed && (
          <div className="w-full rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 text-center">
            {completed.verified ? (
              <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-400" />
            ) : (
              <ShieldAlert className="mx-auto h-10 w-10 text-red-400" />
            )}
            <p className="mt-3 text-sm font-medium text-zinc-100">
              {completed.verified ? "Transfer verified" : "Integrity check failed"}
            </p>
            <p className="text-xs text-zinc-500">{completed.meta.name}</p>
            <button
              onClick={() => downloadBlob(completed.blob, completed.meta.name)}
              className="mx-auto mt-4 flex items-center gap-2 rounded-lg bg-emerald-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:opacity-90"
            >
              <Download className="h-4 w-4" /> Save file
            </button>
          </div>
        )}

        {status === "rejected" && (
          <p className="text-sm text-zinc-400">You declined this transfer.</p>
        )}

        {errorMessage && <p className="text-sm text-red-400">{errorMessage}</p>}
      </div>
    </main>
  );
}
