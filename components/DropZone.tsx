"use client";

import { useCallback, useRef, useState } from "react";
import { FolderUp, Loader2, UploadCloud } from "lucide-react";
import { collectFilesFromDataTransfer, DroppedFile, filesFromFileList } from "@/lib/collect-files";

export function DropZone({
  onFiles,
  disabled = false,
  disabledMessage = "Connecting to the relay…",
}: {
  onFiles: (files: DroppedFile[]) => void;
  disabled?: boolean;
  disabledMessage?: string;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    async (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragging(false);
      if (disabled) return;
      const files = await collectFilesFromDataTransfer(event.dataTransfer);
      if (files.length > 0) onFiles(files);
    },
    [onFiles, disabled],
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
            ? "cursor-pointer scale-[1.01] border-brand-500 bg-brand-50"
            : "cursor-pointer border-zinc-300 bg-zinc-50 hover:border-brand-300 hover:bg-brand-50/40"
      }`}
    >
      <div
        className={`flex h-14 w-14 items-center justify-center rounded-2xl transition-colors ${
          disabled ? "bg-zinc-200" : "bg-gradient-to-br from-brand-400 to-brand-600 shadow-md"
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
            Drag & drop files or a folder, or <span className="text-brand-500">browse</span>
          </>
        )}
      </p>
      <p className="text-xs text-zinc-500">No size or count limit — streamed directly to your peer</p>

      {!disabled && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            folderInputRef.current?.click();
          }}
          className="mt-1 flex items-center gap-1.5 text-xs font-medium text-zinc-400 hover:text-brand-500"
        >
          <FolderUp className="h-3.5 w-3.5" /> or select a whole folder
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        multiple
        disabled={disabled}
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) onFiles(filesFromFileList(e.target.files));
          e.target.value = "";
        }}
      />
      <input
        ref={folderInputRef}
        type="file"
        multiple
        disabled={disabled}
        className="hidden"
        // @ts-expect-error non-standard but universally supported attribute for folder selection
        webkitdirectory=""
        directory=""
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) onFiles(filesFromFileList(e.target.files));
          e.target.value = "";
        }}
      />
    </div>
  );
}
