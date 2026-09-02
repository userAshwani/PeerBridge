"use client";

import { QRCodeSVG } from "qrcode.react";
import { Copy, Check, Share2 } from "lucide-react";
import { useEffect, useState } from "react";

export function QRPanel({ roomId, shareUrl }: { roomId: string; shareUrl: string }) {
  const [copied, setCopied] = useState(false);
  // Checked in an effect (not inline) so the server-rendered markup always
  // matches the client's first render — navigator.share isn't available
  // during SSR, and checking it inline would mismatch and warn/flash.
  const [canShare, setCanShare] = useState(false);

  useEffect(() => {
    setCanShare(typeof navigator.share === "function");
  }, []);

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
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-zinc-200 bg-gradient-to-b from-zinc-50 to-white p-6 shadow-sm">
      <div className="rounded-xl border border-zinc-200 bg-white p-3 shadow-inner">
        <QRCodeSVG value={shareUrl} size={160} bgColor="#ffffff" fgColor="#18181b" />
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
            className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-brand-500 to-brand-700 px-4 py-2 text-xs font-medium text-white shadow-sm shadow-brand-500/30 transition-transform hover:scale-[1.02] active:scale-[0.98]"
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
