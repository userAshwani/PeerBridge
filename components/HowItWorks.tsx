import { UploadCloud, QrCode, DownloadCloud } from "lucide-react";

const STEPS = [
  {
    icon: UploadCloud,
    title: "1. Drop your file",
    desc: "Pick any file or folder on your device — no account, no sign-up, no waiting for an upload bar.",
  },
  {
    icon: QrCode,
    title: "2. Share the code or QR",
    desc: "A 6-character room code and QR code appear instantly. Scan it on the other device, or send the link.",
  },
  {
    icon: DownloadCloud,
    title: "3. Transfer starts instantly",
    desc: "The moment the receiver accepts, bytes stream directly between the two browsers over an encrypted connection.",
  },
];

export function HowItWorks() {
  return (
    <section className="mx-auto w-full max-w-5xl px-4 py-16" id="how-it-works">
      <h2 className="text-center text-2xl font-bold text-zinc-900">How it works</h2>
      <p className="mx-auto mt-2 max-w-2xl text-center text-sm text-zinc-500">
        Three steps, no middleman. Your file never sits on a server waiting to be
        downloaded.
      </p>
      <div className="mt-10 grid grid-cols-1 gap-8 sm:grid-cols-3">
        {STEPS.map(({ icon: Icon, title, desc }) => (
          <div key={title} className="flex flex-col items-center text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-50 to-emerald-50">
              <Icon className="h-6 w-6 text-emerald-600" />
            </div>
            <h3 className="mt-4 text-sm font-semibold text-zinc-900">{title}</h3>
            <p className="mt-1.5 max-w-xs text-xs leading-relaxed text-zinc-500">{desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
