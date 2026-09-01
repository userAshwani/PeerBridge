"use client";

import { use, useEffect, useRef } from "react";
import { CheckCircle2, XCircle, Files, ShieldAlert, Download, HardDrive } from "lucide-react";
import { StatusPill } from "@/components/StatusPill";
import { ProgressBar } from "@/components/ProgressBar";
import { TransferAnimation } from "@/components/TransferAnimation";
import { usePeerTransfer } from "@/hooks/usePeerTransfer";
import { formatBytes, formatDuration, formatSpeed } from "@/lib/format";
import { downloadBlob } from "@/lib/webrtc";

const TERMINAL_STATUSES = ["completed", "cancelled", "closed", "error", "rejected"];
const PREVIEW_COUNT = 5;

export default function JoinPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = use(params);
  const {
    status,
    progress,
    incomingBatch,
    completed,
    errorMessage,
    noticeMessage,
    accept,
    reject,
    cancel,
  } = usePeerTransfer(roomId.toUpperCase(), "receiver");

  const autoDownloaded = useRef(false);
  useEffect(() => {
    // If the browser streamed the files straight to a user-picked disk
    // location, they're already saved — downloading again would be
    // redundant. Otherwise, auto-download every verified file once.
    if (completed && !completed.savedToDisk && completed.blobs && !autoDownloaded.current) {
      autoDownloaded.current = true;
      completed.files.forEach((result, i) => {
        if (result.verified && completed.blobs![i]) {
          downloadBlob(completed.blobs![i], result.meta.name);
        }
      });
    }
  }, [completed]);

  const roomExpired = Boolean(errorMessage?.toLowerCase().includes("room not found"));
  const verifiedCount = completed?.files.filter((f) => f.verified).length ?? 0;
  const allVerified = completed ? verifiedCount === completed.files.length : false;

  return (
    <main className="flex flex-1 flex-col items-center bg-white px-6 py-16 text-zinc-900">
      <h1 className="text-3xl font-bold">
        Joining <span className="font-mono text-brand-500">{roomId.toUpperCase()}</span>
      </h1>

      <div className="mt-8 flex w-full max-w-md flex-col items-center gap-6">
        {!roomExpired && <TransferAnimation status={status} />}
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

        {status === "awaiting-accept" && incomingBatch && (
          <div className="w-full rounded-2xl border border-zinc-200 bg-zinc-50 p-6">
            <div className="flex items-center gap-3">
              <Files className="h-8 w-8 text-brand-500" />
              <div className="min-w-0">
                <p className="truncate text-base font-medium text-zinc-900">
                  {incomingBatch.files.length === 1
                    ? incomingBatch.files[0].name
                    : `${incomingBatch.files.length} files`}
                </p>
                <p className="text-sm text-zinc-500">{formatBytes(incomingBatch.totalBytes)}</p>
              </div>
            </div>

            {incomingBatch.files.length > 1 && (
              <ul className="mt-3 max-h-32 space-y-1 overflow-y-auto rounded-lg bg-white p-2 text-left text-xs text-zinc-500">
                {incomingBatch.files.slice(0, PREVIEW_COUNT).map((f) => (
                  <li key={f.relativePath} className="truncate">
                    {f.relativePath}
                  </li>
                ))}
                {incomingBatch.files.length > PREVIEW_COUNT && (
                  <li>+{incomingBatch.files.length - PREVIEW_COUNT} more</li>
                )}
              </ul>
            )}

            <div className="mt-5 flex gap-3">
              <button
                onClick={accept}
                className="flex flex-1 items-center justify-center gap-2 rounded-full bg-brand-500 py-2.5 text-sm font-bold uppercase tracking-wide text-white hover:opacity-90"
              >
                <CheckCircle2 className="h-4 w-4" /> Accept
              </button>
              <button
                onClick={reject}
                className="flex flex-1 items-center justify-center gap-2 rounded-full border border-zinc-300 py-2.5 text-sm font-bold uppercase tracking-wide text-zinc-600 hover:border-red-400 hover:text-red-500"
              >
                <XCircle className="h-4 w-4" /> Decline
              </button>
            </div>
            <p className="mt-3 text-center text-xs text-zinc-400">
              Accepting will ask where to save{" "}
              {incomingBatch.files.length > 1 ? "these files" : "this file"} (Chrome/Edge), or
              download {incomingBatch.files.length > 1 ? "them" : "it"} to your default
              Downloads folder.
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
            {progress.fileCount > 1 && progress.currentFileName && (
              <p className="mt-1 truncate text-center text-xs text-zinc-500">
                File {progress.currentFileIndex + 1} of {progress.fileCount}:{" "}
                {progress.currentFileName}
              </p>
            )}
            {status === "transferring" && (
              <p className="mt-1 text-center text-xs text-zinc-400">
                {formatDuration(progress.etaSeconds)}
              </p>
            )}
          </div>
        )}

        {status === "verifying" && (
          <p className="text-sm text-brand-500">Verifying SHA-256 integrity…</p>
        )}

        {completed && (
          <div className="w-full rounded-2xl border border-zinc-200 bg-zinc-50 p-6 text-center">
            {allVerified ? (
              <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
            ) : (
              <ShieldAlert className="mx-auto h-10 w-10 text-red-500" />
            )}
            <p className="mt-3 text-sm font-medium text-zinc-900">
              {allVerified
                ? completed.files.length > 1
                  ? `All ${completed.files.length} files verified`
                  : "Transfer verified"
                : `${verifiedCount} of ${completed.files.length} files verified`}
            </p>
            {completed.files.length === 1 && (
              <p className="text-xs text-zinc-500">{completed.files[0].meta.name}</p>
            )}

            {completed.savedToDisk ? (
              <p className="mx-auto mt-4 flex items-center justify-center gap-2 text-sm font-medium text-emerald-600">
                <HardDrive className="h-4 w-4" /> Saved to your chosen location
              </p>
            ) : completed.blobs ? (
              <button
                onClick={() =>
                  completed.files.forEach((result, i) => {
                    if (result.verified && completed.blobs![i]) {
                      downloadBlob(completed.blobs![i], result.meta.name);
                    }
                  })
                }
                className="mx-auto mt-4 flex items-center gap-2 rounded-full bg-brand-500 px-5 py-2.5 text-sm font-bold uppercase tracking-wide text-white hover:opacity-90"
              >
                <Download className="h-4 w-4" />{" "}
                {completed.files.length > 1 ? "Save all files" : "Save file"}
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
