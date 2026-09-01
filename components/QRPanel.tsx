"use client";

import { QRCodeSVG } from "qrcode.react";
import { Copy, Check } from "lucide-react";
import { useState } from "react";

export function QRPanel({ roomId, shareUrl }: { roomId: string; shareUrl: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
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
      <button
        onClick={handleCopy}
        className="flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-xs font-medium text-zinc-700 transition-colors hover:border-brand-400 hover:text-brand-500"
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        {copied ? "Copied" : "Copy link"}
      </button>
    </div>
  );
}
