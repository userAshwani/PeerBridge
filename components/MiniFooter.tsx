import { AUTHOR_NAME, PARENT_SITE_URL, SITE_NAME } from "@/lib/constants";

// A single-line footer for pages that want just enough attribution to not
// look unfinished, without SiteFooter's full Quick Links/Get In Touch
// columns — used on the homepage, which is deliberately just the one
// module and nothing else.
export function MiniFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="w-full border-t border-zinc-200 bg-white px-6 py-4 text-center text-xs text-zinc-500 sm:px-10">
      © {year} {SITE_NAME} — a free tool from{" "}
      <a
        href={PARENT_SITE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-zinc-700 hover:text-brand-500"
      >
        {AUTHOR_NAME}
      </a>
    </footer>
  );
}
