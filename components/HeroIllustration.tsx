import { FileText, Image as ImageIcon, ShieldCheck, Video } from "lucide-react";

/**
 * Hand-built SVG + icon composition depicting two devices exchanging
 * data directly over an encrypted P2P link — stands in for a product
 * screenshot without needing external image assets.
 */
export function HeroIllustration() {
  return (
    <div className="relative mx-auto aspect-square w-full max-w-md">
      <div
        aria-hidden
        className="absolute inset-0 rounded-[2.5rem] bg-gradient-to-br from-emerald-100 via-cyan-50 to-violet-100"
      />
      <div aria-hidden className="absolute inset-0 rounded-[2.5rem] bg-dot-grid opacity-40" />

      <svg
        viewBox="0 0 400 400"
        className="relative h-full w-full"
        role="img"
        aria-label="Two devices exchanging an encrypted file directly, peer to peer"
      >
        <defs>
          <linearGradient id="deviceA" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#10b981" />
            <stop offset="100%" stopColor="#059669" />
          </linearGradient>
          <linearGradient id="deviceB" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#22d3ee" />
            <stop offset="100%" stopColor="#0891b2" />
          </linearGradient>
        </defs>

        {/* left device */}
        <rect x="36" y="120" width="92" height="160" rx="16" fill="url(#deviceA)" />
        <rect x="50" y="136" width="64" height="98" rx="4" fill="white" fillOpacity="0.25" />
        <circle cx="82" cy="252" r="5" fill="white" fillOpacity="0.6" />

        {/* right device */}
        <rect x="272" y="120" width="92" height="160" rx="16" fill="url(#deviceB)" />
        <rect x="286" y="136" width="64" height="98" rx="4" fill="white" fillOpacity="0.25" />
        <circle cx="318" cy="252" r="5" fill="white" fillOpacity="0.6" />

        {/* connection beam */}
        <line
          x1="128"
          y1="200"
          x2="272"
          y2="200"
          stroke="#10b981"
          strokeWidth="3"
          strokeDasharray="6 6"
          strokeLinecap="round"
          className="animate-flow"
          opacity="0.6"
        />
      </svg>

      {/* encrypted-link badge, centered on the beam */}
      <div className="absolute left-1/2 top-1/2 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-2xl bg-white shadow-lg ring-1 ring-black/5">
        <ShieldCheck className="h-7 w-7 text-emerald-600" />
      </div>

      {/* floating file-type chips */}
      <div className="animate-float-slow absolute left-[18%] top-[14%] flex h-11 w-11 items-center justify-center rounded-xl bg-white shadow-md ring-1 ring-black/5">
        <ImageIcon className="h-5 w-5 text-cyan-600" />
      </div>
      <div
        className="animate-float-slow absolute right-[16%] top-[20%] flex h-11 w-11 items-center justify-center rounded-xl bg-white shadow-md ring-1 ring-black/5"
        style={{ animationDelay: "1.2s" }}
      >
        <Video className="h-5 w-5 text-violet-600" />
      </div>
      <div
        className="animate-float-slow absolute bottom-[16%] left-[30%] flex h-11 w-11 items-center justify-center rounded-xl bg-white shadow-md ring-1 ring-black/5"
        style={{ animationDelay: "2.1s" }}
      >
        <FileText className="h-5 w-5 text-emerald-600" />
      </div>
    </div>
  );
}
