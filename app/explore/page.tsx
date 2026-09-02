import type { Metadata } from "next";
import { StatsBar } from "@/components/StatsBar";
import { Features } from "@/components/Features";
import { About } from "@/components/About";
import { HowItWorks } from "@/components/HowItWorks";
import { UseCases } from "@/components/UseCases";
import { Pricing } from "@/components/Pricing";
import { Compare } from "@/components/Compare";
import { FAQ } from "@/components/FAQ";
import { Contact } from "@/components/Contact";
import { CallToAction } from "@/components/CallToAction";
import { BuiltBy } from "@/components/BuiltBy";
import { SiteFooter } from "@/components/SiteFooter";

export const metadata: Metadata = {
  title: "Explore",
  description:
    "How PeerBridge works, what it can send, how it compares to cloud uploaders, pricing (it's free), and answers to security questions.",
  alternates: { canonical: "/explore" },
};

export default function ExplorePage() {
  return (
    <>
    <main className="flex flex-1 flex-col bg-white text-zinc-900">
      <div className="mx-auto w-full max-w-3xl px-6 pb-4 pt-16 text-center sm:px-10">
        <p className="text-xs font-semibold uppercase tracking-widest text-brand-500">Explore</p>
        <h1 className="mt-2 text-3xl font-bold text-zinc-900 sm:text-4xl">
          Everything about PeerBridge
        </h1>
        <p className="mt-3 text-base text-zinc-500">
          How it works, what it can send, how it compares to cloud uploaders, and
          why it&apos;s free — all in one place.
        </p>
      </div>

      <div className="px-6 pb-16 pt-8 sm:px-10">
        <StatsBar />
      </div>

      <Features />

      <About />

      <HowItWorks />

      <div className="bg-zinc-50">
        <UseCases />
      </div>

      <BuiltBy />

      <Pricing />

      <div className="bg-zinc-50">
        <Compare />
      </div>

      <FAQ />

      <div className="bg-zinc-50">
        <Contact />
      </div>

      <CallToAction />
    </main>
    <SiteFooter />
    </>
  );
}
