// Same alphabet as the web app's lib/room-code.ts — excludes visually
// ambiguous characters (0/O, 1/I) for easy manual entry, and matters for
// interop: a mobile-generated code must be enterable on the web app and
// vice versa.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateRoomCode(length = 6): string {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return code;
}
