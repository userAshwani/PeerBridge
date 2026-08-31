"use client";

import { useCallback, useRef, useState } from "react";
import { Loader2, UploadCloud } from "lucide-react";

export function DropZone({
  onFile,
  disabled = false,
  disabledMessage = "Connecting to the relay…",
}: {
  onFile: (file: File) => void;
  disabled?: boolean;
  disabledMessage?: string;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragging(false);
      if (disabled) return;
      const file = event.dataTransfer.files?.[0];
      if (file) onFile(file);
    },
    [onFile, disabled],
  );

  return (
    <div
      role="button"
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      onClick={() => !disabled && inputRef.current?.click()}
      onKeyDown={(e) => !disabled && e.key === "Enter" && inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      className={`flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-10 text-center transition-all ${
        disabled
          ? "cursor-not-allowed border-zinc-200 bg-zinc-50 opacity-60"
          : isDragging
            ? "cursor-pointer scale-[1.01] border-cyan-500 bg-cyan-50"
            : "cursor-pointer border-zinc-300 bg-zinc-50 hover:border-emerald-400 hover:bg-emerald-50/40"
      }`}
    >
      <div
        className={`flex h-14 w-14 items-center justify-center rounded-2xl transition-colors ${
          disabled ? "bg-zinc-200" : "bg-gradient-to-br from-emerald-500 to-cyan-500 shadow-md"
        }`}
      >
        {disabled ? (
          <Loader2 className="h-7 w-7 animate-spin text-zinc-400" />
        ) : (
          <UploadCloud className="h-7 w-7 text-white" />
        )}
      </div>
      <p className="text-sm font-medium text-zinc-800">
        {disabled ? (
          disabledMessage
        ) : (
          <>
            Drag & drop a file, or <span className="text-cyan-600">browse</span>
          </>
        )}
      </p>
      <p className="text-xs text-zinc-500">No size limit — streamed directly to your peer</p>
      <input
        ref={inputRef}
        type="file"
        disabled={disabled}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
        }}
      />
    </div>
  );
}
