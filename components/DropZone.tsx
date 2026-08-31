"use client";

import { useCallback, useRef, useState } from "react";
import { UploadCloud } from "lucide-react";

export function DropZone({ onFile }: { onFile: (file: File) => void }) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragging(false);
      const file = event.dataTransfer.files?.[0];
      if (file) onFile(file);
    },
    [onFile],
  );

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-10 text-center transition-colors ${
        isDragging
          ? "border-cyan-500 bg-cyan-50"
          : "border-zinc-300 bg-zinc-50 hover:border-zinc-400"
      }`}
    >
      <UploadCloud className="h-10 w-10 text-emerald-600" />
      <p className="text-sm font-medium text-zinc-800">
        Drag & drop a file, or <span className="text-cyan-600">browse</span>
      </p>
      <p className="text-xs text-zinc-500">No size limit — streamed directly to your peer</p>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
        }}
      />
    </div>
  );
}
