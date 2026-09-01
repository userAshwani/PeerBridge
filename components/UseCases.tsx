import { Image, FileText, Archive, Music, Video, Boxes } from "lucide-react";

const USE_CASES = [
  {
    icon: Image,
    title: "Photos & camera dumps",
    desc: "Send full-resolution photo albums and RAW files without a compression squeeze or an upload queue.",
  },
  {
    icon: Video,
    title: "Videos & footage",
    desc: "Move multi-gigabyte video exports, screen recordings, and project footage in one direct P2P stream.",
  },
  {
    icon: FileText,
    title: "Documents, PDFs & DOCX",
    desc: "Share contracts, resumes, and confidential paperwork peer-to-peer — nothing sits on a server to leak.",
  },
  {
    icon: Archive,
    title: "ZIP files & backups",
    desc: "Transfer project archives, codebases, and full backups without a hosting provider's size cap.",
  },
  {
    icon: Music,
    title: "Music & audio",
    desc: "Send lossless audio, podcasts, and sample packs at full quality, device to device.",
  },
  {
    icon: Boxes,
    title: "Literally any file type",
    desc: "PeerBridge streams raw bytes — no allowlist, no blocked extensions, no format conversion.",
  },
];

export function UseCases() {
  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-16 sm:px-10" id="use-cases">
      <div className="max-w-xl">
        <p className="text-xs font-semibold uppercase tracking-widest text-emerald-600">
          What you can send
        </p>
        <h2 className="mt-2 text-3xl font-bold text-zinc-900">
          Photos, videos, documents, or entire folders
        </h2>
        <p className="mt-2 text-base text-zinc-500">
          Whatever you need to move between two devices, PeerBridge transfers it
          directly, at full quality, with no server ever storing a copy.
        </p>
      </div>

      <div className="mt-10 grid grid-cols-1 divide-y divide-zinc-200 border-t border-zinc-200 sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-3">
        {USE_CASES.map(({ icon: Icon, title, desc }) => (
          <div key={title} className="flex gap-3 px-1 py-6 sm:px-6">
            <Icon className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            <div>
              <h3 className="text-sm font-semibold text-zinc-900">{title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-zinc-500">{desc}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
