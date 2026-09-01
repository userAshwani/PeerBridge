import { Mail, MessageCircle, Globe } from "lucide-react";
import { CONTACT_EMAIL, CONTACT_URL, PARENT_SITE_URL } from "@/lib/constants";

const CHANNELS = [
  {
    icon: Mail,
    title: "Email",
    lines: [CONTACT_EMAIL],
    href: `mailto:${CONTACT_EMAIL}`,
  },
  {
    icon: MessageCircle,
    title: "Contact form",
    lines: ["ashwanitiwari.com/contact"],
    href: CONTACT_URL,
  },
  {
    icon: Globe,
    title: "Portfolio & work",
    lines: ["ashwanitiwari.com"],
    href: PARENT_SITE_URL,
  },
];

export function Contact() {
  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-16 sm:px-10" id="contact">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-brand-500">
          Contact us
        </p>
        <h2 className="mt-2 text-3xl font-bold text-zinc-900">
          Questions, bug reports, or feedback? Talk to me directly
        </h2>
        <p className="mt-2 text-base text-zinc-500">
          PeerBridge is built and maintained by one person — no support ticket queue,
          just a real inbox.
        </p>
      </div>

      <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-3">
        {CHANNELS.map(({ icon: Icon, title, lines, href }) => (
          <a
            key={title}
            href={href}
            target={href.startsWith("http") ? "_blank" : undefined}
            rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
            className="group flex flex-col items-center rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-sm transition-all hover:-translate-y-1 hover:shadow-xl"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 shadow-md transition-transform group-hover:scale-110">
              <Icon className="h-6 w-6 text-white" />
            </div>
            <h3 className="mt-4 text-base font-semibold text-zinc-900">{title}</h3>
            {lines.map((line) => (
              <p key={line} className="mt-1 text-sm text-zinc-500">
                {line}
              </p>
            ))}
          </a>
        ))}
      </div>
    </section>
  );
}
