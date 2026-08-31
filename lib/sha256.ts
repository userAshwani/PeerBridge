// SHA-256 integrity hashing via the browser's native Web Crypto API.
// SubtleCrypto has no incremental/streaming digest, so a full-file hash
// necessarily requires one contiguous read of the file — this is done
// once, in parallel with the chunked transfer, not on the send/receive
// hot path.

export async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return bufferToHex(digest);
}

export async function sha256File(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  return sha256Hex(buffer);
}

/** Concatenates received chunks into one buffer and hashes it. */
export async function sha256Chunks(chunks: ArrayBuffer[], totalSize: number): Promise<string> {
  const merged = new Uint8Array(totalSize);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(new Uint8Array(chunk), offset);
    offset += chunk.byteLength;
  }
  return sha256Hex(merged.buffer);
}

function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
