export function ProgressBar({ percent }: { percent: number }) {
  const clamped = Math.min(100, Math.max(0, percent));
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200">
      <div
        className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)] transition-all duration-200 ease-out"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
