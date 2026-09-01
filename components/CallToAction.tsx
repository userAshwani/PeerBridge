import { ArrowRight, MessageCircle } from "lucide-react";
import { CONTACT_URL } from "@/lib/constants";

export function CallToAction() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-brand-600 to-brand-800 px-6 py-16 text-center sm:px-10">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 left-1/2 h-72 w-[40rem] -translate-x-1/2 rounded-full bg-white/10 blur-3xl"
      />
      <div className="relative mx-auto max-w-2xl">
        <h2 className="text-3xl font-bold text-white">Got a file to send right now?</h2>
        <p className="mt-3 text-base text-brand-100">
          No account, no upload bar, no waiting — pick a file and you&apos;re already
          sharing a room code.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <a
            href="#transfer"
            className="flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-bold uppercase tracking-wide text-brand-600 shadow-md transition-transform hover:scale-[1.02]"
          >
            Start a transfer <ArrowRight className="h-4 w-4" />
          </a>
          <a
            href={CONTACT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-full border border-white/40 px-6 py-3 text-sm font-bold uppercase tracking-wide text-white transition-colors hover:bg-white/10"
          >
            <MessageCircle className="h-4 w-4" /> Talk to Ashwani
          </a>
        </div>
      </div>
    </section>
  );
}
