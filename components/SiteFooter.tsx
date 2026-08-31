import { PARENT_SITE_URL, AUTHOR_NAME } from "@/lib/constants";

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="w-full border-t border-zinc-200 bg-zinc-50">
      <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-2 px-4 py-8 text-center text-xs text-zinc-500 sm:flex-row sm:justify-between sm:text-left">
        <p>
          © {year}{" "}
          <a
            href={PARENT_SITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-zinc-700 hover:text-emerald-600"
          >
            {AUTHOR_NAME}
          </a>
          . All rights reserved.
        </p>
        <p>
          A free tool from{" "}
          <a
            href={PARENT_SITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-zinc-700 hover:text-emerald-600"
          >
            ashwanitiwari.com
          </a>{" "}
          — Freelance Web, App, E-Commerce & CRM Developer in India.
        </p>
      </div>
    </footer>
  );
}
