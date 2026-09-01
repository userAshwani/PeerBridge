import { Mail, MessageCircle } from "lucide-react";
import { CONTACT_EMAIL, CONTACT_URL } from "@/lib/constants";

export function TopBar() {
  return (
    <div className="w-full bg-zinc-900 px-6 py-2 text-xs text-zinc-300 sm:px-10">
      <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-center gap-1.5 sm:flex-row sm:justify-end sm:gap-5">
        <a
          href={CONTACT_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 hover:text-white"
        >
          <MessageCircle className="h-3.5 w-3.5" /> Questions or feedback? Get in touch
        </a>
        <a href={`mailto:${CONTACT_EMAIL}`} className="flex items-center gap-1.5 hover:text-white">
          <Mail className="h-3.5 w-3.5" /> {CONTACT_EMAIL}
        </a>
      </div>
    </div>
  );
}
