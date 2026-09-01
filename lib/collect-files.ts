// Turns a browser drag-and-drop or <input> selection into a flat list of
// { file, relativePath } — walking folder structure recursively via the
// File and Directory Entries API when a folder was dropped, so senders
// can share whole folders and receivers can reconstruct them.

export interface DroppedFile {
  file: File;
  relativePath: string;
}

export async function collectFilesFromDataTransfer(dataTransfer: DataTransfer): Promise<DroppedFile[]> {
  const items = dataTransfer.items;
  if (!items || items.length === 0) {
    return filesFromFileList(dataTransfer.files);
  }

  const entries: FileSystemEntry[] = [];
  for (let i = 0; i < items.length; i++) {
    const entry = items[i].webkitGetAsEntry?.();
    if (entry) entries.push(entry);
  }

  if (entries.length === 0) {
    return filesFromFileList(dataTransfer.files);
  }

  const results: DroppedFile[] = [];
  await Promise.all(entries.map((entry) => walkEntry(entry, results)));
  return results;
}

export function filesFromFileList(fileList: FileList): DroppedFile[] {
  return Array.from(fileList).map((file) => ({
    file,
    relativePath: file.webkitRelativePath || file.name,
  }));
}

function walkEntry(entry: FileSystemEntry, out: DroppedFile[]): Promise<void> {
  return new Promise((resolve, reject) => {
    if (entry.isFile) {
      (entry as FileSystemFileEntry).file((file) => {
        out.push({ file, relativePath: entry.fullPath.replace(/^\//, "") });
        resolve();
      }, reject);
      return;
    }

    if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      const readBatch = () => {
        reader.readEntries((batch) => {
          if (batch.length === 0) {
            resolve();
            return;
          }
          Promise.all(batch.map((child) => walkEntry(child, out)))
            .then(readBatch) // directory readers deliver in batches — keep reading until empty
            .catch(reject);
        }, reject);
      };
      readBatch();
      return;
    }

    resolve();
  });
}
