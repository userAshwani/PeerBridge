import { Loader2, Wifi, WifiOff } from "lucide-react";
import { RelayStatus } from "@/hooks/useRelayStatus";

const COPY: Record<RelayStatus, string> = {
  waking: "Waking secure P2P signaling relay… please wait a few seconds",
  connected: "P2P Relay Active",
  reconnecting: "Relay Disconnected — Reconnecting…",
};

export function RelayStatusBadge({
  status,
  latencyMs,
}: {
  status: RelayStatus;
  latencyMs: number | null;
}) {
  const styles: Record<RelayStatus, string> = {
    waking: "border-amber-200 bg-amber-50 text-amber-700",
    connected: "border-emerald-200 bg-emerald-50 text-emerald-700",
    reconnecting: "border-red-200 bg-red-50 text-red-700",
  };

  return (
    <div
      role="status"
      className={`inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-medium ${styles[status]}`}
    >
      {status === "waking" && <Loader2 className="h-4 w-4 animate-spin" />}
      {status === "connected" && <Wifi className="h-4 w-4" />}
      {status === "reconnecting" && <WifiOff className="h-4 w-4 animate-pulse" />}
      <span>
        {COPY[status]}
        {status === "connected" && latencyMs !== null && (
          <span className="ml-1 font-mono text-xs opacity-70">· {latencyMs}ms</span>
        )}
      </span>
    </div>
  );
}
