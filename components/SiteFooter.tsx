import { PARENT_SITE_URL, AUTHOR_NAME, CONTACT_URL, CONTACT_EMAIL } from "@/lib/constants";

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="w-full border-t border-zinc-200 bg-zinc-50">
      <div className="mx-auto flex w-full max-w-7xl flex-col items-center gap-3 px-6 py-8 text-center text-sm text-zinc-500 sm:flex-row sm:justify-between sm:px-10 sm:text-left">
        <div>
          <p>
            ©{" "}
            {year}{" "}
            <a
              href={PARENT_SITE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-zinc-700 hover:text-brand-500"
            >
              {AUTHOR_NAME}
            </a>
            . All rights reserved.
          </p>
          <p className="mt-1">
            A free tool from{" "}
            <a
              href={PARENT_SITE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-zinc-700 hover:text-brand-500"
            >
              ashwanitiwari.com
            </a>{" "}
            — Freelance Web, App, E-Commerce & CRM Developer in India.
          </p>
        </div>
        <div className="flex flex-col items-center gap-1 sm:items-end">
          <a href={CONTACT_URL} target="_blank" rel="noopener noreferrer" className="hover:text-brand-500">
            Questions or feedback? Get in touch
          </a>
          <a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-brand-500">
            {CONTACT_EMAIL}
          </a>
        </div>
      </div>
    </footer>
  );
}
