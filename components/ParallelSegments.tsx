import { SegmentProgress } from "@/lib/webrtc";

// One bar per real parallel connection, each filling with that
// connection's own actual progress — used only when a file was large
// enough to actually get split across multiple RTCPeerConnections. For
// everything else, PartsProgress's derived single-stream segments are what
// renders instead.
export function ParallelSegments({ label, segments }: { label: string; segments: SegmentProgress[] }) {
  if (segments.length === 0) return null;

  return (
    <div className="w-full">
      <div className="mb-1.5 flex items-center justify-between text-xs text-zinc-500">
        <span>{label}</span>
        <span className="font-mono">{segments.length} connections</span>
      </div>
      <div className="flex w-full gap-1">
        {segments.map((seg) => {
          const percent = seg.totalBytes ? Math.min(100, (seg.bytesTransferred / seg.totalBytes) * 100) : 0;
          return (
            <div
              key={seg.connId}
              className="h-2.5 flex-1 overflow-hidden rounded-full bg-zinc-200"
              title={`Connection ${seg.connId + 1}`}
            >
              <div
                className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-600 transition-all duration-200"
                style={{ width: `${percent}%` }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
