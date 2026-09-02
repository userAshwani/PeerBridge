"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Files, RotateCcw, XCircle } from "lucide-react";
import { DropZone } from "@/components/DropZone";
import { QRPanel } from "@/components/QRPanel";
import { StatusPill } from "@/components/StatusPill";
import { ProgressBar } from "@/components/ProgressBar";
import { PartsProgress } from "@/components/PartsProgress";
import { ParallelSegments } from "@/components/ParallelSegments";
import { MiniFooter } from "@/components/MiniFooter";
import { HeroIllustration } from "@/components/HeroIllustration";
import { TransferAnimation } from "@/components/TransferAnimation";
import { usePeerTransfer } from "@/hooks/usePeerTransfer";
import { generateRoomCode } from "@/lib/room-code";
import { formatBytes, formatDuration, formatSpeed } from "@/lib/format";
import { DroppedFile } from "@/lib/collect-files";

const TERMINAL_STATUSES = ["completed", "cancelled", "closed", "error", "rejected"];

export default function Home() {
  const router = useRouter();
  const [files, setFilesState] = useState<DroppedFile[]>([]);
  const [joinCode, setJoinCode] = useState("");
  const roomId = useMemo(() => (files.length > 0 ? generateRoomCode() : null), [files]);

  const {
    status,
    progress,
    receiverProgress,
    completed,
    errorMessage,
    noticeMessage,
    setFiles: pushFiles,
    cancel,
  } = usePeerTransfer(roomId, "sender");

  const handleFiles = (picked: DroppedFile[]) => {
    setFilesState(picked);
    // setFiles on the hook fires after the session mounts on the next render,
    // so hand the files straight to the session once it exists.
    queueMicrotask(() => pushFiles(picked));
  };

  const shareUrl =
    roomId && typeof window !== "undefined"
      ? `${window.location.origin}/join/${roomId}`
      : "";

  const reset = () => {
    if (roomId && !TERMINAL_STATUSES.includes(status)) cancel();
    setFilesState([]);
  };

  const totalSize = files.reduce((sum, { file }) => sum + file.size, 0);

  return (
    <main className="flex flex-1 flex-col bg-white text-zinc-900">
      <div className="mx-auto grid w-full max-w-6xl flex-1 grid-cols-1 lg:grid-cols-[26rem_1fr]">
        {/* THE MODULE — this is the entire product, nothing else on this page */}
        <div className="flex flex-col justify-center gap-6 px-6 py-12 sm:px-10 lg:py-16">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 sm:text-3xl">
              Send files, instantly
            </h1>
            <p className="mt-1.5 text-sm text-zinc-500">
              Direct, encrypted, no size limit. Nothing ever touches a server.
            </p>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl shadow-zinc-900/5">
            {files.length === 0 && (
              <>
                <DropZone onFiles={handleFiles} />
                <div className="mt-8 flex items-center gap-3 text-sm text-zinc-400">
                  <div className="h-px flex-1 bg-zinc-200" />
                  have a code?
                  <div className="h-px flex-1 bg-zinc-200" />
                </div>
                <form
                  className="mt-4 flex flex-col gap-2 sm:flex-row"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (joinCode.trim()) router.push(`/join/${joinCode.trim().toUpperCase()}`);
                  }}
                >
                  <input
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value)}
                    placeholder="ABC123"
                    maxLength={6}
                    className="min-w-0 flex-1 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-center font-mono text-base uppercase tracking-widest text-zinc-900 outline-none focus:border-brand-500"
                  />
                  <button
                    type="submit"
                    className="flex items-center justify-center gap-1 rounded-full bg-brand-600 px-6 py-3 text-sm font-bold uppercase tracking-wide text-white shadow-md shadow-brand-500/30 transition-colors hover:bg-brand-700"
                  >
                    Join <ArrowRight className="h-4 w-4" />
                  </button>
                </form>
              </>
            )}

            {files.length > 0 && roomId && (
              <div className="flex flex-col items-center gap-6">
                <div className="flex w-full items-center justify-between rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3.5">
                  <div className="flex items-center gap-3 overflow-hidden">
                    <Files className="h-5 w-5 shrink-0 text-brand-500" />
                    <div className="min-w-0">
                      <p className="truncate text-base font-medium text-zinc-800">
                        {files.length === 1 ? files[0].file.name : `${files.length} files`}
                      </p>
                      <p className="text-sm text-zinc-500">{formatBytes(totalSize)}</p>
                    </div>
                  </div>
                  <button onClick={reset} className="shrink-0 text-zinc-400 hover:text-zinc-900">
                    <RotateCcw className="h-4 w-4" />
                  </button>
                </div>

                <QRPanel roomId={roomId} shareUrl={shareUrl} />
                <TransferAnimation status={status} />
                <StatusPill status={status} />

                {status === "reconnecting" && (
                  <p className="text-center text-sm text-amber-600">
                    Connection wobbled — trying to reconnect. Your transfer will resume
                    from where it left off.
                  </p>
                )}

                {progress && (status === "transferring" || status === "verifying") && (
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

                    <div className="mt-4 flex flex-col gap-3">
                      {progress.segments && progress.segments.length > 1 ? (
                        <ParallelSegments label="Sending" segments={progress.segments} />
                      ) : (
                        <PartsProgress
                          label="Sending"
                          bytesTransferred={progress.currentFileBytesTransferred}
                          totalBytes={progress.currentFileTotalBytes}
                        />
                      )}
                      {receiverProgress && receiverProgress.currentFileIndex === progress.currentFileIndex && (
                        receiverProgress.segments && receiverProgress.segments.length > 1 ? (
                          <ParallelSegments label="Received by peer" segments={receiverProgress.segments} />
                        ) : (
                          <PartsProgress
                            label="Received by peer"
                            bytesTransferred={receiverProgress.currentFileBytesTransferred}
                            totalBytes={receiverProgress.currentFileTotalBytes}
                          />
                        )
                      )}
                    </div>
                  </div>
                )}

                {status === "completed" && completed === null && (
                  <p className="text-sm text-emerald-600">Transfer complete.</p>
                )}
                {noticeMessage && <p className="text-sm text-zinc-500">{noticeMessage}</p>}
                {errorMessage && <p className="text-sm text-red-600">{errorMessage}</p>}

                {!TERMINAL_STATUSES.includes(status) && (
                  <button
                    onClick={reset}
                    className="flex items-center gap-1.5 text-sm font-medium text-zinc-400 hover:text-red-500"
                  >
                    <XCircle className="h-4 w-4" /> Cancel transfer
                  </button>
                )}
              </div>
            )}
          </div>

          <Link
            href="/explore"
            className="text-sm font-medium text-brand-500 hover:text-brand-700"
          >
            How it works, pricing & FAQ →
          </Link>
        </div>

        {/* Branding panel — decorative, no functional UI. Solid light blue
            (never dark), with a soft glow behind a frosted glass card so
            the glassmorphism is actually visible — blur has nothing to
            show through against a flat white backdrop. */}
        <div className="relative hidden overflow-hidden bg-brand-50 lg:flex lg:min-h-[640px] lg:items-center lg:justify-center">
          <div
            aria-hidden
            className="pointer-events-none absolute -top-24 left-1/2 h-[32rem] w-[32rem] -translate-x-1/2 rounded-full bg-brand-200/60 blur-[100px]"
          />
          <div aria-hidden className="bg-dot-grid pointer-events-none absolute inset-0 opacity-[0.05]" />
          <div className="relative w-full max-w-md px-10">
            <HeroIllustration />
            <div className="mt-10 text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-brand-600">
                Zero-cloud &middot; peer-to-peer
              </p>
              <p className="mt-3 text-xl font-bold leading-snug text-zinc-900">
                Photos, videos, documents, entire folders —
                <br />
                straight from your device to theirs.
              </p>
            </div>
          </div>
        </div>
      </div>
      <MiniFooter />
    </main>
  );
}
