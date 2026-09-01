import Link from "next/link";
import { LOGO_URL, PARENT_SITE_URL, SITE_NAME } from "@/lib/constants";

const NAV_LINKS = [
  { href: "#features", label: "Features" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
  { href: "#contact", label: "Contact" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-zinc-200 bg-white/80 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-3 sm:px-10">
        <Link href="/" className="flex shrink-0 items-center gap-2.5">
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
            <span className="text-brand-500">Bridge</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-7 lg:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-zinc-600 transition-colors hover:text-brand-500"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <a
          href={PARENT_SITE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-sm font-medium text-zinc-500 transition-colors hover:text-brand-500"
        >
          by Ashwani Tiwari →
        </a>
      </div>
    </header>
  );
}
