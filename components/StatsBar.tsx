import { Infinity as InfinityIcon, CloudOff, ShieldCheck, Gift } from "lucide-react";

const STATS = [
  { icon: InfinityIcon, label: "No file size limit" },
  { icon: Gift, label: "100% free, forever" },
  { icon: CloudOff, label: "0 GB stored on our servers" },
  { icon: ShieldCheck, label: "Encrypted peer-to-peer" },
];

export function StatsBar() {
  return (
    <div className="mx-auto grid w-full max-w-6xl grid-cols-2 gap-px overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-200 sm:grid-cols-4">
      {STATS.map(({ icon: Icon, label }) => (
        <div
          key={label}
          className="flex flex-col items-center gap-2.5 bg-white px-4 py-6 text-center"
        >
          <Icon className="h-6 w-6 text-emerald-600" />
          <span className="text-sm font-medium text-zinc-700">{label}</span>
        </div>
      ))}
    </div>
  );
}
