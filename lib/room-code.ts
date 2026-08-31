import { customAlphabet } from "nanoid";

// Excludes visually ambiguous characters (0/O, 1/I) for easy manual entry.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export const generateRoomCode = customAlphabet(ALPHABET, 6);
