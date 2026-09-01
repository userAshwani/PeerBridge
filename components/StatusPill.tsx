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
  reconnecting: "Reconnecting…",
  cancelled: "Cancelled",
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

const WARNING: TransferStatus[] = ["reconnecting"];

export function StatusPill({ status }: { status: TransferStatus }) {
  const isActive = ACTIVE.includes(status);
  const isWarning = WARNING.includes(status);
  const isDone = status === "completed";
  const isBad = status === "error" || status === "rejected" || status === "closed" || status === "cancelled";

  const dotClass = isDone
    ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]"
    : isBad
      ? "bg-red-500"
      : isWarning
        ? "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)] animate-pulse"
        : isActive
          ? "bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.6)] animate-pulse"
          : "bg-zinc-400";

  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-medium text-zinc-600">
      <span className={`h-2 w-2 rounded-full ${dotClass}`} />
      {LABELS[status]}
    </span>
  );
}
