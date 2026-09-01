import { ShieldCheck, CloudOff, Infinity as InfinityIcon, Layers, QrCode, FileCheck2 } from "lucide-react";

const FEATURES = [
  {
    icon: ShieldCheck,
    title: "End-to-end encrypted",
    desc: "DTLS encryption is mandatory on every WebRTC RTCDataChannel by spec — there's no unencrypted mode to accidentally leave on.",
  },
  {
    icon: CloudOff,
    title: "Zero cloud storage",
    desc: "Your files stream straight from one browser's memory to the other's. Nothing is ever written to a server, anywhere.",
  },
  {
    icon: InfinityIcon,
    title: "No file size limit",
    desc: "64KB chunks with backpressure-aware flow control mean transfer is bounded by your connection, not an artificial quota.",
  },
  {
    icon: Layers,
    title: "Multiple files & folders",
    desc: "Drop in a whole batch or an entire folder — structure preserved — and send it all in one go, not one upload at a time.",
  },
  {
    icon: QrCode,
    title: "Instant QR pairing",
    desc: "A 6-character code and a QR code appear the moment you pick a file. Scan it on the other device and you're connected.",
  },
  {
    icon: FileCheck2,
    title: "SHA-256 verified",
    desc: "Every file is hashed with the browser's native Web Crypto API on both ends, so you know it arrived byte-for-byte intact.",
  },
];

export function Features() {
  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-16 sm:px-10" id="features">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-brand-500">
          Under the hood
        </p>
        <h2 className="mt-2 text-3xl font-bold text-zinc-900">
          A powerful set of features, none of them locked behind a plan
        </h2>
      </div>

      <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map(({ icon: Icon, title, desc }) => (
          <div
            key={title}
            className="group rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm transition-all hover:-translate-y-1 hover:shadow-xl"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 shadow-md transition-transform group-hover:scale-110">
              <Icon className="h-6 w-6 text-white" />
            </div>
            <h3 className="mt-4 text-base font-semibold text-zinc-900">{title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-zinc-500">{desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
