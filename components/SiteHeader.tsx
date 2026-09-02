"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Menu, X, Mail } from "lucide-react";
import { LOGO_URL, PARENT_SITE_URL, SITE_NAME, CONTACT_EMAIL, CONTACT_URL } from "@/lib/constants";

const NAV_LINKS = [
  { href: "/explore#features", label: "Features" },
  { href: "/explore#how-it-works", label: "How it works" },
  { href: "/explore#pricing", label: "Pricing" },
  { href: "/explore#faq", label: "FAQ" },
  { href: "/explore#contact", label: "Contact" },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);

  // Escape closes the drawer; locking body scroll while it's open keeps
  // the page behind it from scrolling on both touch and wheel input.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  return (
    <>
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

          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
            aria-expanded={open}
            className="flex items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:border-brand-300 hover:text-brand-500"
          >
            <Menu className="h-4 w-4" />
            Menu
          </button>
        </div>
      </header>

      {/* Backdrop */}
      <div
        aria-hidden={!open}
        onClick={() => setOpen(false)}
        className={`fixed inset-0 z-50 bg-zinc-900/40 transition-opacity ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      {/* Sidebar drawer */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Site navigation"
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-xs flex-col bg-white shadow-2xl transition-transform duration-200 ease-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4">
          <span className="text-sm font-semibold uppercase tracking-widest text-zinc-500">
            Menu
          </span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
            className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-4 py-6">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="rounded-lg px-3 py-2.5 text-base font-medium text-zinc-700 transition-colors hover:bg-brand-50 hover:text-brand-600"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="border-t border-zinc-200 px-6 py-5">
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="flex items-center gap-2 text-sm text-zinc-500 hover:text-brand-500"
          >
            <Mail className="h-4 w-4" /> {CONTACT_EMAIL}
          </a>
          <a
            href={CONTACT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 block text-sm text-zinc-500 hover:text-brand-500"
          >
            ashwanitiwari.com/contact
          </a>
          <a
            href={PARENT_SITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 block text-sm font-medium text-zinc-700 hover:text-brand-500"
          >
            by Ashwani Tiwari →
          </a>
        </div>
      </aside>
    </>
  );
}
