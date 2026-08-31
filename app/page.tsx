"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Zap, ServerCrash, ArrowRight, FileIcon, RotateCcw } from "lucide-react";
import { DropZone } from "@/components/DropZone";
import { QRPanel } from "@/components/QRPanel";
import { StatusPill } from "@/components/StatusPill";
import { ProgressBar } from "@/components/ProgressBar";
import { FAQ } from "@/components/FAQ";
import { usePeerTransfer } from "@/hooks/usePeerTransfer";
import { generateRoomCode } from "@/lib/room-code";
import { formatBytes, formatSpeed } from "@/lib/format";

const FEATURES = [
  { icon: ShieldCheck, title: "End-to-end encrypted", desc: "DTLS-secured RTCDataChannel, mandated by the WebRTC spec." },
  { icon: ServerCrash, title: "Zero cloud storage", desc: "Files never touch a server — only your two browsers see the bytes." },
  { icon: Zap, title: "No size limits", desc: "Chunked streaming with backpressure handles multi-gigabyte files." },
];

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
      <section className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center px-4 py-16">
        <h1 className="text-center text-4xl font-extrabold tracking-tight sm:text-5xl">
          Peer<span className="text-emerald-600">Bridge</span>
        </h1>
        <p className="mt-4 max-w-xl text-center text-zinc-500">
          Send files directly between devices over an encrypted WebRTC connection.
          No uploads, no size limits, no account — nothing ever touches a server.
        </p>

        <div className="mt-10 w-full max-w-md">
          {!file && (
            <>
              <DropZone onFile={handleFile} />
              <div className="mt-8 flex items-center gap-3 text-xs text-zinc-400">
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
                  className="flex-1 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-center font-mono uppercase tracking-widest text-zinc-900 outline-none focus:border-cyan-500"
                />
                <button
                  type="submit"
                  className="flex items-center gap-1 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                >
                  Join <ArrowRight className="h-4 w-4" />
                </button>
              </form>
            </>
          )}

          {file && roomId && (
            <div className="flex flex-col items-center gap-6">
              <div className="flex w-full items-center justify-between rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                <div className="flex items-center gap-3 overflow-hidden">
                  <FileIcon className="h-5 w-5 shrink-0 text-cyan-600" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-zinc-800">{file.name}</p>
                    <p className="text-xs text-zinc-500">{formatBytes(file.size)}</p>
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
                  <div className="mt-2 flex justify-between text-xs text-zinc-500">
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
      </section>

      <section className="mx-auto grid w-full max-w-4xl grid-cols-1 gap-6 px-4 pb-16 sm:grid-cols-3">
        {FEATURES.map(({ icon: Icon, title, desc }) => (
          <div key={title} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5">
            <Icon className="h-6 w-6 text-emerald-600" />
            <h3 className="mt-3 text-sm font-semibold text-zinc-900">{title}</h3>
            <p className="mt-1 text-xs text-zinc-500">{desc}</p>
          </div>
        ))}
      </section>

      <FAQ />
    </main>
  );
}
