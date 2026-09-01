// TypeScript's DOM lib already ships FileSystemFileHandle / FileSystemWritableFileStream
// (behind "Available only in secure contexts" notes) but not the picker entry point yet —
// it's still an experimental, Chromium-only API. Declare just that piece.

interface SaveFilePickerOptions {
  suggestedName?: string;
  types?: { description?: string; accept: Record<string, string[]> }[];
}

interface DirectoryPickerOptions {
  mode?: "read" | "readwrite";
}

interface Window {
  showSaveFilePicker?(options?: SaveFilePickerOptions): Promise<FileSystemFileHandle>;
  showDirectoryPicker?(options?: DirectoryPickerOptions): Promise<FileSystemDirectoryHandle>;
}
