import { Infinity as InfinityIcon, CloudOff, ShieldCheck, Gift } from "lucide-react";

const STATS = [
  { icon: InfinityIcon, label: "No file size limit", color: "text-brand-500" },
  { icon: Gift, label: "100% free, forever", color: "text-brand-500" },
  { icon: CloudOff, label: "0 GB stored on our servers", color: "text-brand-500" },
  { icon: ShieldCheck, label: "Encrypted peer-to-peer", color: "text-emerald-600" },
];

export function StatsBar() {
  return (
    <div className="mx-auto grid w-full max-w-6xl grid-cols-2 divide-y divide-zinc-200 border-y border-zinc-200 sm:grid-cols-4 sm:divide-x sm:divide-y-0">
      {STATS.map(({ icon: Icon, label, color }) => (
        <div key={label} className="flex items-center justify-center gap-2.5 px-4 py-6 text-center">
          <Icon className={`h-4 w-4 shrink-0 ${color}`} />
          <span className="text-sm font-medium text-zinc-600">{label}</span>
        </div>
      ))}
    </div>
  );
}
