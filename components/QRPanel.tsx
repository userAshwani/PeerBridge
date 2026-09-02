"use client";

import { QRCodeSVG } from "qrcode.react";
import { Copy, Check, Share2 } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { LOGO_URL } from "@/lib/constants";

// navigator.share() only exists in the browser, and its availability never
// changes after load — useSyncExternalStore is the correct tool for exactly
// this "client-only feature check" case: it renders `false` (matching SSR)
// on the initial pass, then re-renders with the real value right after
// hydration, with no manual effect/setState needed.
const noopSubscribe = () => () => {};
const getCanShareSnapshot = () => typeof navigator !== "undefined" && typeof navigator.share === "function";
const getServerSnapshot = () => false;

export function QRPanel({ roomId, shareUrl }: { roomId: string; shareUrl: string }) {
  const [copied, setCopied] = useState(false);
  const canShare = useSyncExternalStore(noopSubscribe, getCanShareSnapshot, getServerSnapshot);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleShare = async () => {
    try {
      await navigator.share({
        title: "PeerBridge — send files",
        text: `Join my file transfer on PeerBridge — room code ${roomId}`,
        url: shareUrl,
      });
    } catch {
      // User cancelled the OS share sheet, or the browser refused for some
      // other reason — Copy link is still right there as a fallback.
    }
  };

  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="rounded-xl border border-zinc-200 bg-white p-3 shadow-inner">
        <QRCodeSVG
          value={shareUrl}
          size={160}
          bgColor="#ffffff"
          fgColor="#18181b"
          // "H" (30% error correction) is the ceiling for how much of the
          // code can be excavated for a logo and still scan reliably —
          // 40px on a 160px code (25%) is a deliberately-picked upper
          // bound within that: bigger reads clearly, but pushing past
          // this starts risking real-world scans (a worn phone camera,
          // low light) even though the math says more is technically
          // possible.
          level="H"
          imageSettings={{
            src: LOGO_URL,
            height: 40,
            width: 40,
            excavate: true,
          }}
        />
      </div>
      <div className="text-center">
        <p className="text-xs uppercase tracking-widest text-zinc-500">Room code</p>
        <p className="font-mono text-3xl font-bold tracking-[0.2em] text-brand-500">
          {roomId}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {canShare && (
          <button
            onClick={handleShare}
            className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-xs font-medium text-white shadow-sm shadow-brand-500/30 transition-colors hover:bg-brand-700"
          >
            <Share2 className="h-3.5 w-3.5" />
            Share
          </button>
        )}
        <button
          onClick={handleCopy}
          className="flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-xs font-medium text-zinc-700 transition-colors hover:border-brand-400 hover:text-brand-500"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>
    </div>
  );
}
