import Link from "next/link";
import { LOGO_URL, PARENT_SITE_URL, SITE_NAME } from "@/lib/constants";

export function SiteHeader() {
  return (
    <header className="w-full border-b border-zinc-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-3 sm:px-10">
        <Link href="/" className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={LOGO_URL}
            alt="Ashwani Tiwari"
            width={32}
            height={32}
            className="h-8 w-8 rounded-md"
          />
          <span className="text-lg font-bold tracking-tight text-zinc-900">
            {SITE_NAME.replace("Bridge", "")}
            <span className="text-emerald-600">Bridge</span>
          </span>
        </Link>
        <a
          href={PARENT_SITE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-medium text-zinc-500 transition-colors hover:text-emerald-600"
        >
          by Ashwani Tiwari →
        </a>
      </div>
    </header>
  );
}
