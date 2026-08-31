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
    <section className="mx-auto w-full max-w-6xl px-6 py-16 sm:px-10" id="how-it-works">
      <h2 className="text-center text-3xl font-bold text-zinc-900">How it works</h2>
      <p className="mx-auto mt-3 max-w-2xl text-center text-base text-zinc-500">
        Three steps, no middleman. Your file never sits on a server waiting to be
        downloaded.
      </p>
      <div className="mt-12 grid grid-cols-1 gap-10 sm:grid-cols-3">
        {STEPS.map(({ icon: Icon, title, desc }) => (
          <div key={title} className="flex flex-col items-center text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-50 to-emerald-50">
              <Icon className="h-7 w-7 text-emerald-600" />
            </div>
            <h3 className="mt-5 text-base font-semibold text-zinc-900">{title}</h3>
            <p className="mt-2 max-w-xs text-sm leading-relaxed text-zinc-500">{desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
