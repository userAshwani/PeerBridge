import {
  PARENT_SITE_URL,
  AUTHOR_NAME,
  CONTACT_URL,
  CONTACT_EMAIL,
  LOGO_URL,
  SITE_NAME,
} from "@/lib/constants";

const QUICK_LINKS = [
  { href: "#features", label: "Features" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
  { href: "#contact", label: "Contact" },
];

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="w-full border-t border-zinc-200 bg-white">
      <div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-10 px-6 py-14 sm:px-10 md:grid-cols-[2fr_1fr_1fr]">
        <div>
          <div className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={LOGO_URL} alt={AUTHOR_NAME} width={28} height={28} className="h-7 w-7 rounded-md" />
            <span className="text-base font-bold text-zinc-900">{SITE_NAME}</span>
          </div>
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-zinc-500">
            Zero-cloud, peer-to-peer file transfer. Files stream directly between two
            browsers over an encrypted WebRTC connection — nothing ever touches a
            server.
          </p>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-zinc-900">Quick Links</h3>
          <ul className="mt-4 flex flex-col gap-2.5 text-sm text-zinc-500">
            {QUICK_LINKS.map((link) => (
              <li key={link.href}>
                <a href={link.href} className="hover:text-brand-500">
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-zinc-900">Get In Touch</h3>
          <ul className="mt-4 flex flex-col gap-2.5 text-sm text-zinc-500">
            <li>
              <a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-brand-500">
                {CONTACT_EMAIL}
              </a>
            </li>
            <li>
              <a href={CONTACT_URL} target="_blank" rel="noopener noreferrer" className="hover:text-brand-500">
                ashwanitiwari.com/contact
              </a>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-zinc-200">
        <div className="mx-auto flex w-full max-w-7xl flex-col items-center gap-2 px-6 py-6 text-center text-xs text-zinc-500 sm:flex-row sm:justify-between sm:px-10 sm:text-left">
          <p>
            © {year}{" "}
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
          <p>
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
      </div>
    </footer>
  );
}
