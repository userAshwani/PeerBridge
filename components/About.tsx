import { Gauge } from "lucide-react";
import { HeroIllustration } from "@/components/HeroIllustration";

export function About() {
  return (
    <section className="bg-zinc-50" id="about">
      <div className="mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-14 px-6 py-16 sm:px-10 lg:grid-cols-2">
        <div className="order-2 lg:order-1">
          <HeroIllustration />
        </div>
        <div className="order-1 lg:order-2">
          <h3 className="text-3xl font-bold text-zinc-900">
            Skip The Upload, Go Straight Device To Device
          </h3>
          <div className="mt-6 flex gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 shadow-md">
              <Gauge className="h-5 w-5 text-white" />
            </div>
            <p className="text-sm leading-relaxed text-zinc-500">
              Every other file-sharing tool uploads your file to a server first, then
              hands out a download link — that round trip is where the size caps, the
              wait, and the paywalls all come from. PeerBridge opens a direct WebRTC
              connection between two browsers instead, so your file only ever makes
              one hop: straight to the person you&apos;re sending it to.
            </p>
          </div>
          <a
            href="#transfer"
            className="mt-6 inline-block text-sm font-bold uppercase tracking-wide text-brand-500 hover:text-brand-700"
          >
            Get started →
          </a>
        </div>
      </div>
    </section>
  );
}
