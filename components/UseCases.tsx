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
      <h2 className="text-center text-3xl font-bold text-zinc-900">
        Send anything — photos, videos, documents, or entire folders
      </h2>
      <p className="mx-auto mt-3 max-w-2xl text-center text-base text-zinc-500">
        Whatever you need to move between two devices, PeerBridge transfers it directly,
        at full quality, with no server ever storing a copy.
      </p>
      <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {USE_CASES.map(({ icon: Icon, title, desc }) => (
          <div
            key={title}
            className="rounded-2xl border border-zinc-200 bg-white p-6 transition-shadow hover:shadow-md"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50">
              <Icon className="h-5 w-5 text-emerald-600" />
            </div>
            <h3 className="mt-4 text-base font-semibold text-zinc-900">{title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-zinc-500">{desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
