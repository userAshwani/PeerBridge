"use client";

import { use, useEffect, useRef } from "react";
import { CheckCircle2, XCircle, FileIcon, ShieldAlert, Download, HardDrive } from "lucide-react";
import { StatusPill } from "@/components/StatusPill";
import { ProgressBar } from "@/components/ProgressBar";
import { usePeerTransfer } from "@/hooks/usePeerTransfer";
import { formatBytes, formatDuration, formatSpeed } from "@/lib/format";
import { downloadBlob } from "@/lib/webrtc";

const TERMINAL_STATUSES = ["completed", "cancelled", "closed", "error", "rejected"];

export default function JoinPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = use(params);
  const {
    status,
    progress,
    incomingFile,
    completed,
    errorMessage,
    noticeMessage,
    accept,
    reject,
    cancel,
  } = usePeerTransfer(roomId.toUpperCase(), "receiver");

  const autoDownloaded = useRef(false);
  useEffect(() => {
    // If the browser streamed the file straight to a user-picked disk
    // location, it's already saved — downloading again would be redundant.
    if (completed?.verified && !completed.savedToDisk && !autoDownloaded.current) {
      autoDownloaded.current = true;
      downloadBlob(completed.blob, completed.meta.name);
    }
  }, [completed]);

  const roomExpired = Boolean(errorMessage?.toLowerCase().includes("room not found"));

  return (
    <main className="flex flex-1 flex-col items-center bg-white px-6 py-16 text-zinc-900">
      <h1 className="text-3xl font-bold">
        Joining <span className="font-mono text-emerald-600">{roomId.toUpperCase()}</span>
      </h1>

      <div className="mt-8 flex w-full max-w-md flex-col items-center gap-6">
        <StatusPill status={status} />

        {(status === "waiting-for-peer" || status === "connecting-signaling") && !roomExpired ? (
          <p className="text-center text-sm text-zinc-500">
            Waiting for the sender to appear. Keep this tab open.
          </p>
        ) : null}

        {roomExpired && (
          <p className="text-center text-sm text-red-600">
            This room code doesn&apos;t exist or has expired — ask the sender for a fresh
            code and link.
          </p>
        )}

        {status === "reconnecting" && (
          <p className="text-center text-sm text-amber-600">
            Connection wobbled — trying to reconnect. Your transfer will resume from
            where it left off.
          </p>
        )}

        {status === "awaiting-accept" && incomingFile && (
          <div className="w-full rounded-2xl border border-zinc-200 bg-zinc-50 p-6">
            <div className="flex items-center gap-3">
              <FileIcon className="h-8 w-8 text-cyan-600" />
              <div className="min-w-0">
                <p className="truncate text-base font-medium text-zinc-900">{incomingFile.name}</p>
                <p className="text-sm text-zinc-500">
                  {formatBytes(incomingFile.size)} · {incomingFile.mime || "unknown type"}
                </p>
              </div>
            </div>
            <div className="mt-5 flex gap-3">
              <button
                onClick={accept}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-500 py-2.5 text-sm font-semibold text-white hover:opacity-90"
              >
                <CheckCircle2 className="h-4 w-4" /> Accept
              </button>
              <button
                onClick={reject}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-zinc-300 py-2.5 text-sm font-semibold text-zinc-600 hover:border-red-400 hover:text-red-500"
              >
                <XCircle className="h-4 w-4" /> Decline
              </button>
            </div>
            <p className="mt-3 text-center text-xs text-zinc-400">
              Accepting will ask where to save this file (Chrome/Edge), or download it to
              your default Downloads folder.
            </p>
          </div>
        )}

        {(status === "transferring" || status === "verifying") && progress && (
          <div className="w-full">
            <ProgressBar percent={progress.percent} />
            <div className="mt-2 flex justify-between text-sm text-zinc-500">
              <span>
                {formatBytes(progress.bytesTransferred)} / {formatBytes(progress.totalBytes)}
              </span>
              <span>{formatSpeed(progress.speedBps)}</span>
            </div>
            {status === "transferring" && (
              <p className="mt-1 text-center text-xs text-zinc-400">
                {formatDuration(progress.etaSeconds)}
              </p>
            )}
          </div>
        )}

        {status === "verifying" && (
          <p className="text-sm text-cyan-600">Verifying SHA-256 integrity…</p>
        )}

        {completed && (
          <div className="w-full rounded-2xl border border-zinc-200 bg-zinc-50 p-6 text-center">
            {completed.verified ? (
              <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
            ) : (
              <ShieldAlert className="mx-auto h-10 w-10 text-red-500" />
            )}
            <p className="mt-3 text-sm font-medium text-zinc-900">
              {completed.verified ? "Transfer verified" : "Integrity check failed"}
            </p>
            <p className="text-xs text-zinc-500">{completed.meta.name}</p>

            {completed.verified && completed.savedToDisk ? (
              <p className="mx-auto mt-4 flex items-center justify-center gap-2 text-sm font-medium text-emerald-600">
                <HardDrive className="h-4 w-4" /> Saved to your chosen location
              </p>
            ) : completed.verified ? (
              <button
                onClick={() => downloadBlob(completed.blob, completed.meta.name)}
                className="mx-auto mt-4 flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
              >
                <Download className="h-4 w-4" /> Save file
              </button>
            ) : null}
          </div>
        )}

        {status === "rejected" && (
          <p className="text-sm text-zinc-500">You declined this transfer.</p>
        )}

        {noticeMessage && <p className="text-sm text-zinc-500">{noticeMessage}</p>}
        {errorMessage && !roomExpired && <p className="text-sm text-red-600">{errorMessage}</p>}

        {!TERMINAL_STATUSES.includes(status) && !roomExpired && (
          <button
            onClick={cancel}
            className="flex items-center gap-1.5 text-sm font-medium text-zinc-400 hover:text-red-500"
          >
            <XCircle className="h-4 w-4" /> Cancel
          </button>
        )}
      </div>
    </main>
  );
}
