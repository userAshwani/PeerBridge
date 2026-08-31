import { UploadCloud, QrCode, DownloadCloud } from "lucide-react";

const STEPS = [
  {
    icon: UploadCloud,
    title: "Drop your file",
    desc: "Pick any file or folder on your device — no account, no sign-up, no waiting for an upload bar.",
    gradient: "from-emerald-500 to-teal-500",
  },
  {
    icon: QrCode,
    title: "Share the code or QR",
    desc: "A 6-character room code and QR code appear instantly. Scan it on the other device, or send the link.",
    gradient: "from-cyan-500 to-blue-500",
  },
  {
    icon: DownloadCloud,
    title: "Transfer starts instantly",
    desc: "The moment the receiver accepts, bytes stream directly between the two browsers over an encrypted connection.",
    gradient: "from-violet-500 to-fuchsia-500",
  },
];

export function HowItWorks() {
  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-16 sm:px-10" id="how-it-works">
      <h2 className="text-center text-3xl font-bold text-zinc-900">How it works</h2>
      <p className="mx-auto mt-3 max-w-2xl text-center text-base text-zinc-500">
        Three steps, no middleman. Your file never sits on a server waiting to be
        downloaded.
      </p>
      <div className="relative mt-14 grid grid-cols-1 gap-12 sm:grid-cols-3 sm:gap-6">
        <div
          aria-hidden
          className="absolute left-0 right-0 top-8 hidden h-px bg-gradient-to-r from-emerald-200 via-cyan-200 to-fuchsia-200 sm:block"
        />
        {STEPS.map(({ icon: Icon, title, desc, gradient }, i) => (
          <div key={title} className="relative flex flex-col items-center text-center">
            <div
              className={`flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br ${gradient} shadow-lg ring-4 ring-white`}
            >
              <Icon className="h-7 w-7 text-white" />
            </div>
            <span className="mt-4 text-xs font-semibold uppercase tracking-widest text-zinc-400">
              Step {i + 1}
            </span>
            <h3 className="mt-1 text-base font-semibold text-zinc-900">{title}</h3>
            <p className="mt-2 max-w-xs text-sm leading-relaxed text-zinc-500">{desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
