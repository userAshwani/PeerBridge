import { PARENT_SITE_URL, AUTHOR_NAME } from "@/lib/constants";

export function BuiltBy() {
  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-16 sm:px-10">
      <div className="flex flex-col items-start gap-6 rounded-2xl border border-zinc-200 bg-zinc-50 p-8 sm:flex-row sm:items-center sm:p-10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo.png"
          alt={AUTHOR_NAME}
          width={56}
          height={56}
          className="h-14 w-14 shrink-0 rounded-xl"
        />
        <div>
          <p className="text-base leading-relaxed text-zinc-700">
            &ldquo;I kept running into the same wall sending large client files —
            paid tiers, expiring links, or an upload bar for something that could
            just go device to device. PeerBridge is the tool I wanted to exist,
            built the way I&apos;d want it: no account, no server holding your
            files, nothing to buy.&rdquo;
          </p>
          <p className="mt-3 text-sm font-medium text-zinc-500">
            —{" "}
            <a
              href={PARENT_SITE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-zinc-900 hover:text-emerald-600"
            >
              {AUTHOR_NAME}
            </a>
            , freelance web & app developer
          </p>
        </div>
      </div>
    </section>
  );
}
