import { Mail, MessageCircle } from "lucide-react";
import { CONTACT_EMAIL, CONTACT_URL } from "@/lib/constants";

export function TopBar() {
  return (
    <div className="w-full bg-zinc-900 px-4 py-2 text-xs text-zinc-300 sm:px-10">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3">
        <a
          href={CONTACT_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-w-0 items-center gap-1.5 hover:text-white"
        >
          <MessageCircle className="h-3.5 w-3.5 shrink-0" />
          <span className="hidden sm:inline">Questions or feedback? Get in touch</span>
          <span className="sm:hidden">Feedback</span>
        </a>
        <a
          href={`mailto:${CONTACT_EMAIL}`}
          className="flex min-w-0 items-center gap-1.5 truncate hover:text-white"
        >
          <Mail className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{CONTACT_EMAIL}</span>
        </a>
      </div>
    </div>
  );
}
