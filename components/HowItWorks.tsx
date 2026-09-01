const STEPS = [
  {
    title: "Drop your file",
    desc: "Pick any file or folder on your device — no account, no sign-up, no waiting for an upload bar.",
  },
  {
    title: "Share the code or QR",
    desc: "A 6-character room code and QR code appear instantly. Scan it on the other device, or send the link.",
  },
  {
    title: "Transfer starts instantly",
    desc: "The moment the receiver accepts, bytes stream directly between the two browsers over an encrypted connection.",
  },
];

export function HowItWorks() {
  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-16 sm:px-10" id="how-it-works">
      <div className="max-w-xl">
        <p className="text-xs font-semibold uppercase tracking-widest text-emerald-600">
          How it works
        </p>
        <h2 className="mt-2 text-3xl font-bold text-zinc-900">
          Three steps, no middleman
        </h2>
        <p className="mt-2 text-base text-zinc-500">
          Your file never sits on a server waiting to be downloaded.
        </p>
      </div>

      <ol className="mt-12 grid grid-cols-1 gap-x-8 gap-y-10 sm:grid-cols-3">
        {STEPS.map(({ title, desc }, i) => (
          <li key={title} className="border-t-2 border-zinc-900 pt-4">
            <span className="text-sm font-mono text-zinc-400">0{i + 1}</span>
            <h3 className="mt-2 text-base font-semibold text-zinc-900">{title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-zinc-500">{desc}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
