import { sha256 } from "js-sha256";

export function sha256Hex(bytes: Uint8Array): string {
  return sha256(bytes);
}

/** Incremental hasher — feed chunks as they're read/written in order, then
 * call digest() once at the end. Lets a large file be hashed without
 * holding two full copies in memory (one for chunking, one for hashing)
 * the way a single sha256(wholeFile) call would need. */
export function createSha256Stream() {
  const hasher = sha256.create();
  return {
    update(bytes: Uint8Array): void {
      hasher.update(bytes);
    },
    digest(): string {
      return hasher.hex();
    },
  };
}
