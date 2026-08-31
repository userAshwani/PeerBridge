"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, FileIcon, RotateCcw, Sparkles } from "lucide-react";
import { DropZone } from "@/components/DropZone";
import { QRPanel } from "@/components/QRPanel";
import { StatusPill } from "@/components/StatusPill";
import { ProgressBar } from "@/components/ProgressBar";
import { StatsBar } from "@/components/StatsBar";
import { HowItWorks } from "@/components/HowItWorks";
import { UseCases } from "@/components/UseCases";
import { Compare } from "@/components/Compare";
import { FAQ } from "@/components/FAQ";
import { usePeerTransfer } from "@/hooks/usePeerTransfer";
import { generateRoomCode } from "@/lib/room-code";
import { formatBytes, formatSpeed } from "@/lib/format";

export default function Home() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const roomId = useMemo(() => (file ? generateRoomCode() : null), [file]);

  const { status, progress, completed, errorMessage, setFile: pushFile } = usePeerTransfer(
    roomId,
    "sender",
  );

  const handleFile = (f: File) => {
    setFile(f);
    // setFile on the hook fires after the session mounts on the next render,
    // so hand the File straight to the session once it exists.
    queueMicrotask(() => pushFile(f));
  };

  const shareUrl =
    roomId && typeof window !== "undefined"
      ? `${window.location.origin}/join/${roomId}`
      : "";

  const reset = () => {
    setFile(null);
  };

  return (
    <main className="flex flex-1 flex-col bg-white text-zinc-900">
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-32 left-1/2 h-96 w-[48rem] -translate-x-1/2 rounded-full bg-gradient-to-r from-cyan-200/40 to-emerald-200/40 blur-3xl"
        />
        <div className="relative mx-auto flex w-full max-w-4xl flex-col items-center px-6 pb-16 pt-16 sm:px-10 sm:pt-20">
          <span className="mb-5 inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3.5 py-1.5 text-sm font-medium text-emerald-700">
            <Sparkles className="h-4 w-4" />
            No signup · No size limit · 100% free forever
          </span>

          <h1 className="text-center text-4xl font-extrabold tracking-tight sm:text-6xl">
            Send huge files instantly —{" "}
            <span className="text-emerald-600">no cloud, no limits</span>
          </h1>
          <p className="mt-5 max-w-2xl text-center text-lg text-zinc-500">
            PeerBridge sends photos, videos, documents, and any other file directly
            between two devices over an encrypted WebRTC connection. Unlike cloud
            uploaders, nothing is ever stored on a server — so there&apos;s no size cap,
            no paywall, and no privacy trade-off.
          </p>

          <div className="mt-10 w-full max-w-md">
            {!file && (
              <>
                <DropZone onFile={handleFile} />
                <div className="mt-8 flex items-center gap-3 text-sm text-zinc-400">
                  <div className="h-px flex-1 bg-zinc-200" />
                  have a code?
                  <div className="h-px flex-1 bg-zinc-200" />
                </div>
                <form
                  className="mt-4 flex gap-2"
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
                    className="flex-1 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-center font-mono text-base uppercase tracking-widest text-zinc-900 outline-none focus:border-cyan-500"
                  />
                  <button
                    type="submit"
                    className="flex items-center gap-1 rounded-lg bg-emerald-500 px-5 py-3 text-base font-semibold text-white transition-opacity hover:opacity-90"
                  >
                    Join <ArrowRight className="h-4 w-4" />
                  </button>
                </form>
              </>
            )}

            {file && roomId && (
              <div className="flex flex-col items-center gap-6">
                <div className="flex w-full items-center justify-between rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3.5">
                  <div className="flex items-center gap-3 overflow-hidden">
                    <FileIcon className="h-5 w-5 shrink-0 text-cyan-600" />
                    <div className="min-w-0">
                      <p className="truncate text-base font-medium text-zinc-800">{file.name}</p>
                      <p className="text-sm text-zinc-500">{formatBytes(file.size)}</p>
                    </div>
                  </div>
                  <button onClick={reset} className="shrink-0 text-zinc-400 hover:text-zinc-900">
                    <RotateCcw className="h-4 w-4" />
                  </button>
                </div>

                <QRPanel roomId={roomId} shareUrl={shareUrl} />
                <StatusPill status={status} />

                {progress && status === "transferring" && (
                  <div className="w-full">
                    <ProgressBar percent={progress.percent} />
                    <div className="mt-2 flex justify-between text-sm text-zinc-500">
                      <span>
                        {formatBytes(progress.bytesTransferred)} / {formatBytes(progress.totalBytes)}
                      </span>
                      <span>{formatSpeed(progress.speedBps)}</span>
                    </div>
                  </div>
                )}

                {status === "completed" && completed === null && (
                  <p className="text-sm text-emerald-600">Transfer complete.</p>
                )}
                {errorMessage && <p className="text-sm text-red-600">{errorMessage}</p>}
              </div>
            )}
          </div>
        </div>
      </section>

      <div className="px-6 pb-16 sm:px-10">
        <StatsBar />
      </div>

      <div className="border-t border-zinc-100">
        <HowItWorks />
      </div>

      <div className="border-t border-zinc-100 bg-zinc-50/50">
        <UseCases />
      </div>

      <div className="border-t border-zinc-100">
        <Compare />
      </div>

      <div className="border-t border-zinc-100 bg-zinc-50/50">
        <FAQ />
      </div>
    </main>
  );
}
