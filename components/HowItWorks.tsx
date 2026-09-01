import { UploadCloud, QrCode, ShieldCheck } from "lucide-react";

const STEPS = [
  {
    icon: UploadCloud,
    title: "Drop Your File",
    desc: "Pick any file or folder on your device — no account, no sign-up, no waiting for an upload bar.",
  },
  {
    icon: QrCode,
    title: "Share The Code",
    desc: "A 6-character room code and QR code appear instantly. Scan it on the other device, or send the link.",
  },
  {
    icon: ShieldCheck,
    title: "Transfer & Verify",
    desc: "The moment the receiver accepts, bytes stream directly between the two browsers and get SHA-256 verified.",
  },
];

export function HowItWorks() {
  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-16 sm:px-10" id="how-it-works">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-brand-500">
          Working progress
        </p>
        <h2 className="mt-2 text-3xl font-bold text-zinc-900">
          How Does PeerBridge Processing Work
        </h2>
      </div>

      <div className="relative mt-14 rounded-3xl border border-zinc-200 bg-zinc-50 p-8 sm:p-10">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-3">
          {STEPS.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-md">
                <Icon className="h-7 w-7 text-brand-500" />
              </div>
              <h3 className="mt-5 text-base font-semibold text-zinc-900">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-500">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
