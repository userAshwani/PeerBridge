// Remembers the folder the user picked to save into, so they're only ever
// asked once — not on every single transfer. expo-file-system's directory
// picker already takes a *persistable* SAF permission grant under the hood
// (FilePickerContract.kt: takePersistableUriPermission), so the picked
// URI stays valid across app restarts; all that's missing is remembering
// which URI it was, which is what this file does, in a tiny local prefs
// file (no extra dependency like AsyncStorage needed for one string).

import { Directory, File, Paths } from "expo-file-system";

const PREFS_FILE_NAME = "save-location.json";

function prefsFile(): File {
  return new File(Paths.document, PREFS_FILE_NAME);
}

/** Returns the previously-picked save folder, or null if none has been
 * picked yet, or if the permission grant has since been revoked (e.g. the
 * user cleared the app's storage access in Android settings, or moved/
 * deleted the folder itself). */
export function getSavedDirectory(): Directory | null {
  const file = prefsFile();
  if (!file.exists) return null;
  try {
    const { uri } = JSON.parse(file.textSync()) as { uri: string };
    const dir = new Directory(uri);
    if (!dir.exists) return null;
    return dir;
  } catch {
    return null;
  }
}

export function setSavedDirectory(dir: Directory): void {
  const file = prefsFile();
  if (!file.exists) file.create();
  file.write(JSON.stringify({ uri: dir.uri }));
}

export function forgetSavedDirectory(): void {
  const file = prefsFile();
  if (file.exists) file.delete();
}
