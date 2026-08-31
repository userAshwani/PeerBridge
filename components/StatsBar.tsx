import { Infinity as InfinityIcon, CloudOff, ShieldCheck, Gift } from "lucide-react";

const STATS = [
  { icon: InfinityIcon, label: "No file size limit", gradient: "from-emerald-500 to-cyan-500" },
  { icon: Gift, label: "100% free, forever", gradient: "from-cyan-500 to-blue-500" },
  { icon: CloudOff, label: "0 GB stored on our servers", gradient: "from-violet-500 to-fuchsia-500" },
  { icon: ShieldCheck, label: "Encrypted peer-to-peer", gradient: "from-emerald-500 to-teal-500" },
];

export function StatsBar() {
  return (
    <div className="mx-auto grid w-full max-w-6xl grid-cols-2 gap-4 sm:grid-cols-4">
      {STATS.map(({ icon: Icon, label, gradient }) => (
        <div
          key={label}
          className="flex flex-col items-center gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-7 text-center shadow-sm transition-shadow hover:shadow-md"
        >
          <div
            className={`flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${gradient} shadow-md`}
          >
            <Icon className="h-5 w-5 text-white" />
          </div>
          <span className="text-sm font-medium text-zinc-700">{label}</span>
        </div>
      ))}
    </div>
  );
}
