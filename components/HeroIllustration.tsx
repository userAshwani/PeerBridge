import { FileText, Image as ImageIcon, ShieldCheck, Video } from "lucide-react";

/**
 * Hand-built SVG + icon composition depicting two devices exchanging
 * data directly over an encrypted P2P link — a frosted-glass panel meant
 * to sit on the colored hero banner, standing in for a product
 * screenshot without needing external image assets.
 */
export function HeroIllustration() {
  return (
    <div className="relative mx-auto aspect-square w-full max-w-lg">
      <div
        aria-hidden
        className="absolute inset-0 rounded-[2.5rem] border border-white/15 bg-white/[0.06] backdrop-blur-xl"
      />

      <svg
        viewBox="0 0 400 400"
        className="relative h-full w-full"
        role="img"
        aria-label="Two devices exchanging an encrypted file directly, peer to peer"
      >
        {/* left device */}
        <rect x="36" y="120" width="92" height="160" rx="16" fill="#ffffff" />
        <rect x="50" y="136" width="64" height="98" rx="4" fill="#5368fd" fillOpacity="0.15" />
        <circle cx="82" cy="252" r="5" fill="#5368fd" fillOpacity="0.4" />

        {/* right device */}
        <rect x="272" y="120" width="92" height="160" rx="16" fill="#e7eaff" />
        <rect x="286" y="136" width="64" height="98" rx="4" fill="#5368fd" fillOpacity="0.15" />
        <circle cx="318" cy="252" r="5" fill="#5368fd" fillOpacity="0.4" />

        {/* connection beam */}
        <line
          x1="128"
          y1="200"
          x2="272"
          y2="200"
          stroke="#ffffff"
          strokeWidth="3"
          strokeDasharray="6 6"
          strokeLinecap="round"
          className="animate-flow"
          opacity="0.8"
        />
      </svg>

      {/* encrypted-link badge, centered on the beam */}
      <div className="absolute left-1/2 top-1/2 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-2xl bg-white shadow-lg">
        <ShieldCheck className="h-7 w-7 text-emerald-600" />
      </div>

      {/* floating file-type chips */}
      <div className="animate-float-slow absolute left-[18%] top-[14%] flex h-11 w-11 items-center justify-center rounded-xl bg-white shadow-md">
        <ImageIcon className="h-5 w-5 text-brand-500" />
      </div>
      <div
        className="animate-float-slow absolute right-[16%] top-[20%] flex h-11 w-11 items-center justify-center rounded-xl bg-white shadow-md"
        style={{ animationDelay: "1.2s" }}
      >
        <Video className="h-5 w-5 text-brand-700" />
      </div>
      <div
        className="animate-float-slow absolute bottom-[16%] left-[30%] flex h-11 w-11 items-center justify-center rounded-xl bg-white shadow-md"
        style={{ animationDelay: "2.1s" }}
      >
        <FileText className="h-5 w-5 text-brand-500" />
      </div>

      {/* decorative "it's live" chip */}
      <div
        className="animate-float-slow absolute bottom-6 right-6 flex items-center gap-2 rounded-xl bg-white/95 px-4 py-2.5 shadow-lg"
        style={{ animationDelay: "0.6s" }}
      >
        <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.7)]" />
        <p className="text-sm font-bold text-zinc-900">Direct & encrypted</p>
      </div>
    </div>
  );
}
