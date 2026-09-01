"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Files, PlayCircle, RotateCcw, XCircle } from "lucide-react";
import { DropZone } from "@/components/DropZone";
import { QRPanel } from "@/components/QRPanel";
import { StatusPill } from "@/components/StatusPill";
import { ProgressBar } from "@/components/ProgressBar";
import { StatsBar } from "@/components/StatsBar";
import { Features } from "@/components/Features";
import { About } from "@/components/About";
import { HowItWorks } from "@/components/HowItWorks";
import { UseCases } from "@/components/UseCases";
import { Pricing } from "@/components/Pricing";
import { Compare } from "@/components/Compare";
import { FAQ } from "@/components/FAQ";
import { Contact } from "@/components/Contact";
import { CallToAction } from "@/components/CallToAction";
import { BuiltBy } from "@/components/BuiltBy";
import { RelayStatusBadge } from "@/components/RelayStatusBadge";
import { HeroIllustration } from "@/components/HeroIllustration";
import { TransferAnimation } from "@/components/TransferAnimation";
import { usePeerTransfer } from "@/hooks/usePeerTransfer";
import { useRelayStatus } from "@/hooks/useRelayStatus";
import { generateRoomCode } from "@/lib/room-code";
import { formatBytes, formatDuration, formatSpeed } from "@/lib/format";
import { DroppedFile } from "@/lib/collect-files";

const TERMINAL_STATUSES = ["completed", "cancelled", "closed", "error", "rejected"];

export default function Home() {
  const router = useRouter();
  const [files, setFilesState] = useState<DroppedFile[]>([]);
  const [joinCode, setJoinCode] = useState("");
  const roomId = useMemo(() => (files.length > 0 ? generateRoomCode() : null), [files]);
  const relay = useRelayStatus();
  const relayReady = relay.status === "connected";

  const {
    status,
    progress,
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
    <main id="top" className="flex flex-1 flex-col bg-white text-zinc-900">
      {/* HERO BANNER — full-bleed brand gradient, pure marketing */}
      <section className="relative overflow-hidden bg-gradient-to-br from-brand-600 via-brand-700 to-brand-900">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-32 left-1/2 h-[36rem] w-[60rem] -translate-x-1/2 rounded-full bg-white/10 blur-3xl"
        />
        <div
          aria-hidden
          className="bg-dot-grid pointer-events-none absolute inset-0 opacity-[0.08]"
        />

        <div className="relative mx-auto flex w-full max-w-5xl flex-col items-center px-6 pb-20 pt-16 text-center sm:px-10 sm:pb-28 sm:pt-20">
          <RelayStatusBadge status={relay.status} latencyMs={relay.latencyMs} />

          <h1 className="mt-6 text-4xl font-extrabold tracking-tight text-white sm:text-6xl">
            Send huge files instantly,
            <br className="hidden sm:block" /> device to device
          </h1>
          <p className="mt-5 max-w-xl text-lg text-brand-100">
            Photos, videos, documents, entire folders — any file, any number of them —
            streamed directly between two devices over an encrypted WebRTC connection.
            No cloud, no size cap, no signup.
          </p>

          <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row">
            <a
              href="#transfer"
              className="flex items-center gap-2 rounded-full bg-white px-7 py-3.5 text-sm font-bold uppercase tracking-wide text-brand-600 shadow-lg transition-transform hover:scale-[1.02]"
            >
              Start sending <ArrowRight className="h-4 w-4" />
            </a>
            <a
              href="#how-it-works"
              className="flex items-center gap-2 rounded-full border border-white/40 px-7 py-3.5 text-sm font-bold uppercase tracking-wide text-white transition-colors hover:bg-white/10"
            >
              <PlayCircle className="h-4 w-4" /> See how it works
            </a>
          </div>

          <div className="mt-14 w-full max-w-lg">
            <HeroIllustration />
          </div>
        </div>
      </section>

      {/* TRANSFER PANEL — the actual tool, full width, overlapping the banner */}
      <section id="transfer" className="relative -mt-12 px-6 pb-16 sm:-mt-16 sm:px-10">
        <div className="mx-auto max-w-2xl rounded-3xl border border-zinc-200 bg-white p-6 shadow-2xl shadow-brand-900/10 sm:p-10">
          {files.length === 0 && (
            <>
              <DropZone
                onFiles={handleFiles}
                disabled={!relayReady}
                disabledMessage={
                  relay.status === "waking"
                    ? "Waking secure P2P signaling relay…"
                    : "Reconnecting to relay…"
                }
              />
              <div className="mt-8 flex items-center gap-3 text-sm text-zinc-400">
                <div className="h-px flex-1 bg-zinc-200" />
                have a code?
                <div className="h-px flex-1 bg-zinc-200" />
              </div>
              <form
                className="mx-auto mt-4 flex max-w-sm gap-2"
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
                  className="flex-1 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-center font-mono text-base uppercase tracking-widest text-zinc-900 outline-none focus:border-brand-500"
                />
                <button
                  type="submit"
                  className="flex items-center gap-1 rounded-full bg-gradient-to-r from-brand-500 to-brand-700 px-6 py-3 text-sm font-bold uppercase tracking-wide text-white shadow-md shadow-brand-500/30 transition-transform hover:scale-[1.02] active:scale-[0.98]"
                >
                  Join <ArrowRight className="h-4 w-4" />
                </button>
              </form>
            </>
          )}

          {files.length > 0 && roomId && (
            <div className="mx-auto flex max-w-sm flex-col items-center gap-6">
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
      </section>

      <div className="px-6 pb-16 sm:px-10">
        <StatsBar />
      </div>

      <Features />

      <About />

      <HowItWorks />

      <div className="bg-zinc-50">
        <UseCases />
      </div>

      <BuiltBy />

      <Pricing />

      <div className="bg-zinc-50">
        <Compare />
      </div>

      <FAQ />

      <div className="bg-zinc-50">
        <Contact />
      </div>

      <CallToAction />
    </main>
  );
}
