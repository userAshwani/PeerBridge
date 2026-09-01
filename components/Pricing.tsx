import { Check } from "lucide-react";

const INCLUDED = [
  "Unlimited file size",
  "Unlimited number of transfers",
  "Multi-file & folder batches",
  "End-to-end encryption",
  "SHA-256 integrity verification",
  "No account, ever",
];

export function Pricing() {
  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-16 sm:px-10" id="pricing">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-brand-500">Pricing</p>
        <h2 className="mt-2 text-3xl font-bold text-zinc-900">One plan. It&apos;s free.</h2>
        <p className="mt-2 text-base text-zinc-500">
          There&apos;s no storage to pay for when nothing is ever stored — so there&apos;s no
          paid tier, no per-GB fee, and nothing to upgrade to.
        </p>
      </div>

      <div className="mx-auto mt-10 max-w-sm rounded-2xl border-2 border-brand-500 bg-white p-8 text-center shadow-xl shadow-brand-500/10">
        <p className="text-sm font-semibold uppercase tracking-widest text-brand-500">Everyone</p>
        <p className="mt-3 text-5xl font-bold text-zinc-900">
          $0<span className="text-lg font-medium text-zinc-400"> / forever</span>
        </p>
        <ul className="mt-6 flex flex-col gap-3 text-left text-sm text-zinc-600">
          {INCLUDED.map((item) => (
            <li key={item} className="flex items-center gap-2.5">
              <Check className="h-4 w-4 shrink-0 text-brand-500" />
              {item}
            </li>
          ))}
        </ul>
        <a
          href="#transfer"
          className="mt-8 block rounded-full bg-gradient-to-r from-brand-500 to-brand-700 py-3 text-sm font-bold uppercase tracking-wide text-white shadow-md shadow-brand-500/30 transition-transform hover:scale-[1.02]"
        >
          Start sending
        </a>
      </div>
    </section>
  );
}
