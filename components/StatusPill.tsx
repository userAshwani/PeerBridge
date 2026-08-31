import { TransferStatus } from "@/lib/webrtc";

const LABELS: Record<TransferStatus, string> = {
  idle: "Idle",
  "connecting-signaling": "Connecting…",
  "waiting-for-peer": "Waiting for peer",
  "establishing-connection": "Negotiating P2P link",
  connected: "Connected",
  "awaiting-accept": "Awaiting response",
  transferring: "Transferring",
  verifying: "Verifying integrity",
  completed: "Completed",
  rejected: "Declined",
  error: "Error",
  closed: "Closed",
};

const ACTIVE: TransferStatus[] = [
  "connecting-signaling",
  "waiting-for-peer",
  "establishing-connection",
  "transferring",
  "verifying",
];

export function StatusPill({ status }: { status: TransferStatus }) {
  const isActive = ACTIVE.includes(status);
  const isDone = status === "completed";
  const isBad = status === "error" || status === "rejected" || status === "closed";

  const dotClass = isDone
    ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]"
    : isBad
      ? "bg-red-400"
      : isActive
        ? "bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.9)] animate-pulse"
        : "bg-zinc-500";

  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/80 px-3 py-1 text-xs font-medium text-zinc-300">
      <span className={`h-2 w-2 rounded-full ${dotClass}`} />
      {LABELS[status]}
    </span>
  );
}
