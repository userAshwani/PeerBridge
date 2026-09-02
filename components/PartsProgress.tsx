// A segmented, IDM-style progress indicator for the file currently in
// flight — each block represents one "part" of the file, filling in as
// bytes for that part are transferred. Purely a visual breakdown of the
// same byte-level progress already tracked; it doesn't imply (or require)
// the file actually being sent over multiple parallel connections.

const DEFAULT_PARTS = 10;

export function PartsProgress({
  label,
  bytesTransferred,
  totalBytes,
  parts = DEFAULT_PARTS,
}: {
  label: string;
  bytesTransferred: number;
  totalBytes: number;
  parts?: number;
}) {
  if (!totalBytes) return null;

  const partSize = totalBytes / parts;
  const completedParts = Math.min(parts, Math.floor(bytesTransferred / partSize));
  const currentPartFraction =
    completedParts < parts ? (bytesTransferred - completedParts * partSize) / partSize : 0;

  return (
    <div className="w-full">
      <div className="mb-1.5 flex items-center justify-between text-xs text-zinc-500">
        <span>{label}</span>
        <span className="font-mono">
          {Math.min(completedParts + (currentPartFraction > 0 ? 1 : 0), parts)}/{parts} parts
        </span>
      </div>
      <div className="flex w-full gap-1">
        {Array.from({ length: parts }).map((_, i) => {
          const isDone = i < completedParts;
          const isCurrent = i === completedParts && bytesTransferred < totalBytes;
          return (
            <div key={i} className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-200">
              <div
                className={`h-full rounded-full transition-all duration-200 ${
                  isDone ? "bg-gradient-to-r from-brand-400 to-brand-600" : "bg-brand-400"
                }`}
                style={{ width: isDone ? "100%" : isCurrent ? `${currentPartFraction * 100}%` : "0%" }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
