import { CheckCircle2, FileText, FolderCheck, FolderInput, FolderOutput, Loader2, ShieldCheck } from "lucide-react";
import { TransferStatus } from "@/lib/webrtc";

type Phase = "idle" | "active" | "verifying" | "done" | "paused";

function phaseFromStatus(status: TransferStatus): Phase {
  if (status === "completed") return "done";
  if (status === "transferring") return "active";
  if (status === "verifying") return "verifying";
  if (["reconnecting", "error", "cancelled", "closed", "rejected"].includes(status)) return "paused";
  return "idle";
}

const PACKET_DELAYS = [0, 0.5, 1];

/** Two devices linked by a beam — animates while a transfer is pending,
 * live, or being verified, so the wait doesn't read as a frozen page. */
export function TransferAnimation({ status }: { status: TransferStatus }) {
  const phase = phaseFromStatus(status);
  const showPackets = phase === "active" || phase === "verifying";

  return (
    <div className="relative mx-auto h-20 w-full max-w-[16rem]" aria-hidden>
      <div className="absolute left-[14%] right-[14%] top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-zinc-200" />

      <div
        className={`absolute left-[6%] top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-2xl bg-brand-500 shadow-md transition-opacity ${
          phase === "paused" ? "opacity-40" : ""
        } ${phase === "idle" ? "animate-pulse" : ""}`}
      >
        <FolderOutput className="h-6 w-6 text-white" />
      </div>
      <div
        className={`absolute right-[6%] top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-2xl bg-brand-700 shadow-md transition-opacity ${
          phase === "paused" ? "opacity-40" : ""
        } ${phase === "idle" ? "animate-pulse" : ""}`}
      >
        {phase === "done" ? (
          <FolderCheck className="h-6 w-6 text-white" />
        ) : (
          <FolderInput className="h-6 w-6 text-white" />
        )}
      </div>

      {showPackets &&
        PACKET_DELAYS.map((delay) => (
          <span
            key={delay}
            className="animate-packet absolute top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-md bg-white shadow-[0_0_6px_rgba(0,86,210,0.6)] ring-1 ring-brand-200"
            style={{ animationDelay: `${delay}s` }}
          >
            <FileText className="h-3 w-3 text-brand-600" />
          </span>
        ))}

      <div className="absolute left-1/2 top-1/2 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white shadow-lg ring-1 ring-black/5">
        {phase === "done" ? (
          <CheckCircle2 className="animate-pop h-5 w-5 text-emerald-600" />
        ) : phase === "verifying" ? (
          <Loader2 className="h-5 w-5 animate-spin text-brand-500" />
        ) : (
          <ShieldCheck className={`h-5 w-5 ${phase === "paused" ? "text-zinc-300" : "text-emerald-600"}`} />
        )}
      </div>
    </div>
  );
}
