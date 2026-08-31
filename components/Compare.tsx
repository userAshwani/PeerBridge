import { Check, X } from "lucide-react";

const ROWS: [string, string, string][] = [
  ["File size limit", "Unlimited — bounded only by your internet speed", "Usually 2–5GB free, GBs cost a monthly plan"],
  ["Cost", "Free, forever", "Free tier capped; large/fast transfers are paywalled"],
  ["Where your file lives", "Nowhere — streamed directly between browsers", "Uploaded to the provider's cloud storage first"],
  ["Account required", "No sign-up, ever", "Often required for larger files or history"],
  ["Link expiry", "No link to expire — the transfer is live, once", "Download links usually expire after days"],
  ["Transfer speed", "As fast as your direct connection allows", "Capped by the provider's upload/download limits"],
];

export function Compare() {
  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-16 sm:px-10" id="compare">
      <h2 className="text-center text-3xl font-bold text-zinc-900">
        PeerBridge vs. traditional cloud file transfer
      </h2>
      <p className="mx-auto mt-3 max-w-2xl text-center text-base text-zinc-500">
        Cloud upload services store a copy of your file to hand out download links —
        that&apos;s where their size caps and paywalls come from. PeerBridge skips storage
        entirely, so none of those limits apply.
      </p>

      <div className="mt-12 overflow-x-auto rounded-2xl border border-zinc-200 shadow-sm">
        <table className="w-full min-w-[640px] border-collapse text-left text-base">
          <thead>
            <tr className="border-b border-zinc-200">
              <th className="px-6 py-4 font-medium text-zinc-500">&nbsp;</th>
              <th className="bg-gradient-to-r from-emerald-50 to-cyan-50 px-6 py-4 font-semibold text-emerald-700">
                PeerBridge
              </th>
              <th className="px-6 py-4 font-medium text-zinc-500">Typical cloud uploader</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map(([label, ours, theirs]) => (
              <tr key={label} className="border-b border-zinc-100 last:border-0">
                <td className="px-6 py-5 align-top font-medium text-zinc-700">{label}</td>
                <td className="bg-emerald-50/30 px-6 py-5 align-top text-zinc-700">
                  <span className="flex items-start gap-2">
                    <Check className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                    {ours}
                  </span>
                </td>
                <td className="px-6 py-5 align-top text-zinc-500">
                  <span className="flex items-start gap-2">
                    <X className="mt-0.5 h-5 w-5 shrink-0 text-zinc-400" />
                    {theirs}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
