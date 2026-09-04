# PeerBridge mobile — context for an AI agent picking this up

This is a handoff document, not user-facing docs (see `README.md` for
"how to run/build"). Read this before making changes here — it exists
so a fresh agent session doesn't re-derive decisions that were already
made deliberately, or accidentally violate a hard constraint the owner
(Ashwani) stated explicitly.

## What this is

A React Native / Expo port of the web app at
[transfer.ashwanitiwari.com](https://transfer.ashwanitiwari.com) (repo
root, `../`) — same zero-cloud, peer-to-peer WebRTC file transfer, same
signaling server, same room codes, same binary wire protocol. A mobile
user and a web user must be able to send files to each other directly.
The full protocol spec this was built from: `../MOBILE-APP-SPEC.md`.

Lives at `mobile/` inside the `userAshwani/PeerBridge` repo (merged
here by explicit choice — a separate `PeerBridge-mobile` repo was
offered and declined). It has its own `package.json`/toolchain; the
root Next.js build does **not** install or check it (see "Repo
integration gotcha" below).

## Hard constraints — do not violate these

1. **UI must be React Native Paper (Material 3) components only.**
   Verbatim instruction: *"i dont want you to create app using custom
   code and css... make sure the components of mobile app it should
   looks cools and i dont want your any custom css there."* In
   practice: every visual/interactive element is a Paper component
   (`Card`, `Button`, `TextInput`, `Chip`, `ProgressBar`, `Banner`,
   `Avatar.Icon`, `Text`) driven by `src/lib/theme.ts`. `StyleSheet`
   usage is layout-only (flex/padding/gap/radius) — never ad-hoc
   colors or hand-drawn UI. The one legitimate exception is the QR
   scanner's white viewfinder frame overlay (`ScanScreen.tsx`) — no
   Paper equivalent exists for a camera-overlay frame; every
   scanner UI in any app draws this itself.
2. **Wire-protocol fidelity with the web app is non-negotiable.**
   Signaling messages (WebSocket JSON) and the binary chunk format
   (1 byte connId + 8 byte float64 position + payload, `CHUNK_HEADER_SIZE
   = 9`, `PAYLOAD_SIZE = CHUNK_SIZE - 9`) must stay byte-identical to
   `../lib/webrtc.ts`. When the web app's transfer engine changes,
   check whether the same fix applies here — see "Porting web fixes"
   below.
3. **Never hardcode secrets in source.** TURN credentials come from
   `EXPO_PUBLIC_TURN_URLS` / `_USERNAME` / `_CREDENTIAL` env vars
   (mirrors the web app's `NEXT_PUBLIC_TURN_*` pattern exactly —
   Expo inlines `EXPO_PUBLIC_*` at build time, same mechanism as
   Next's `NEXT_PUBLIC_*`). Real values live in `mobile/.env`
   (gitignored, exists only on Ashwani's machine) and as EAS project
   environment variables (so `eas build` picks them up in the cloud)
   — never in a committed file. This was a real mistake made and
   caught mid-session (a real password was briefly hardcoded in
   `constants.ts` before being moved out) — don't repeat it.
4. **Name/logo/branding are intentionally NOT finalized.** Expo's
   default app name/icon/slug are placeholders on purpose, per
   Ashwani: *"name and logo for this app... we can final at last."*
   Don't "fix" this unprompted.

## Current implementation status

**Done and working** (verified: `npx tsc --noEmit` clean, `npx
expo-doctor` 20/21, and a real device install/test by Ashwani):
- Full signaling protocol (room codes, reconnect-with-backoff).
- Full binary wire protocol with position-addressed writes via
  `expo-file-system`'s new `FileHandle` API (true seek support).
- Single file per transfer (not batches — web app's multi-file
  batching not ported).
- Single connection only (no parallel-connections "download in parts"
  — MOBILE-APP-SPEC.md §6 marks this optional; a web peer that does
  use it gracefully falls back to single-connection with this client).
- QR scan-to-join (camera), manual code entry, native share sheet.
- Folder picker on receive (Storage Access Framework via
  `Directory.pickDirectoryAsync()`), falls back to app's own document
  dir if skipped.
- The forced-relay auto-retry fix (ported from web commit `ce77d18`):
  when a "connected" state never delivers data (common cause: AP/
  client isolation on shared Wi-Fi), the sender tears down and
  retries once with `iceTransportPolicy: "relay"` forced.
- The stall-watchdog re-arm fix (ported from web commit `70decfc`):
  `TRANSFER_STALL_MS = 45000`, re-armed on `bufferedamountlow` and on
  receiving a `receiver-progress` control message, not just on
  completing a full chunk send — otherwise a slow-but-working relayed
  transfer false-triggers a stall error.
- Full theme derived from the brand blue (`BRAND_COLOR` in
  `constants.ts`) across every Paper color token — see "Design system"
  below for why this needed custom derivation, not just `primary`.

**Explicitly not done**:
- Background transfers (app must stay foregrounded — iOS suspends
  network activity when backgrounded, no background task wired up).
- Multi-file/folder batch sending.
- The parallel-connections speed feature.
- A signed **production** build (only `preview`/`development` EAS
  profiles have been used — `production` profile in `eas.json` builds
  an `.aab` for Play Store submission, untested).

**Unverified/real risk**: `react-native-webrtc` is flagged by
`expo-doctor` as untested on React Native's New Architecture, which
this Expo SDK (57) makes mandatory (no opt-out). This was never
resolved by code — it was resolved by Ashwani actually installing a
build and testing it (worked). If WebRTC behaves oddly after a future
Expo/react-native-webrtc upgrade, this is the first thing to suspect.

## Design system — why theme.ts exists

`react-native-paper`'s `MD3LightTheme` only lets you freely override
`colors.primary`. Every other token a `Card`/`Surface` actually paints
its background with — `primaryContainer`, `surfaceVariant`, every
`elevation.level0-5` — is a **literal hardcoded color** derived from
Material 3's default *purple* seed
(`node_modules/react-native-paper/src/styles/themes/v3/LightTheme.tsx`),
completely independent of `primary`. Overriding only `primary` (the
original theme.ts) produced blue icons/text sitting on mismatched
purple-tinted card surfaces — this was the literal cause of Ashwani's
"what the shit design" reaction to the first APK build.

The fix in `src/lib/theme.ts`: derive the *entire* palette from
`BRAND_COLOR` using the `color` package (a transitive dep of
`react-native-paper`, so already available — `@types/color` added as
a direct devDependency for TypeScript). `tint()`/`shade()` helpers mix
the brand color toward white/black at hand-tuned ratios approximating
what Google's Material Theme Builder would generate from a seed color.
If Ashwani ever wants a different brand color, changing `BRAND_COLOR`
in `constants.ts` alone regenerates the whole coherent palette — no
other file should need color changes.

## Build & credentials setup

- EAS account: `ashwani2000`. EAS project:
  `@ashwani2000/PeerBridge-mobile` (linked via `app.json`'s
  `extra.eas.projectId: 80af4af4-a436-4b9b-9b14-459e5212c5b5` — this
  is what makes `eas build` from `mobile/` resolve to the right cloud
  project regardless of which local directory you're in).
- Signing: a locally-generated upload keystore at
  `mobile/credentials/android-upload-keystore.jks` +
  `mobile/credentials.json` (both gitignored, exist only on Ashwani's
  machine — **losing them blocks future signed updates to the same
  app package**, back them up separately). Generated because
  `eas build --non-interactive` refuses to auto-generate a keystore
  interactively, and this environment's `eas build` (no proper TTY
  via the Bash tool, `winpty` didn't help either) can't answer
  interactive prompts — hence `eas.json`'s `preview` profile sets
  `android.credentialsSource: "local"` pointing at this file.
- TURN env vars are set on the EAS project for `development`,
  `preview`, and `production` environments (`eas env:create`,
  `visibility: sensitive` — note `EXPO_PUBLIC_*` vars can't use
  `visibility: secret`, EAS rejects that combination since the value
  ends up inlined in the compiled JS bundle regardless of dashboard
  visibility — same inherent client-side-visible tradeoff the web
  app's `NEXT_PUBLIC_*` vars already have).
- Standard build command: `eas build --profile preview --platform
  android --non-interactive` from `mobile/`.

## Repo integration gotcha (already fixed once — don't reintroduce)

Merging this app into the main repo broke the web app's VPS deploy the
first time: `next build`'s TypeScript check and built-in ESLint pass
scan every `.ts`/`.tsx` under the repo root by default, including
`mobile/`'s — whose dependencies (react-native, expo, ...) are never
installed by the root `npm install` the deploy runs. Fixed via:
- root `tsconfig.json`: `"exclude": ["node_modules", "mobile"]`
- root `eslint.config.mjs`: `"mobile/**"` added to `globalIgnores`

If either of those exclusions is ever removed, the web app's deploy
will break again the same way. Verified fixed by running the actual
`next build` locally, not just `tsc`/`eslint` separately.

## Porting web fixes

The web app (`../lib/webrtc.ts`) is the source of truth for transfer-
engine behavior. When it changes, check `git log -- lib/webrtc.ts` in
the repo root for anything affecting connection setup, stall
detection, or reconnect logic, and evaluate whether
`src/lib/webrtc-session.ts` here needs the same fix — it won't happen
automatically, and two fixes (`ce77d18`, `70decfc`) were already
missed on the initial port and had to be back-ported after a real
device test surfaced the bug. `src/lib/signaling-client.ts` similarly
mirrors `../lib/signaling-client.ts`.

## File map

```
mobile/
  App.tsx                        Entry: PaperProvider + NavigationContainer
  app.json / eas.json            Expo config / EAS build profiles
  src/lib/
    constants.ts                  Signaling/TURN URLs (env-var backed), brand color
    webrtc-session.ts             Core engine — PeerTransferSession, wire protocol
    signaling-client.ts           WebSocket signaling client
    theme.ts                      Full MD3 palette derived from BRAND_COLOR
    sha256.ts / format.ts / room-code.ts   Small ported utilities
    usePeerTransferSession.ts     React hook wrapping the engine
  src/components/
    StatusChip.tsx                Color-coded status pill (Paper Chip)
    TransferProgressView.tsx      Progress bar + speed/ETA (Paper ProgressBar)
  src/screens/
    HomeScreen.tsx / SendScreen.tsx / JoinScreen.tsx / ScanScreen.tsx
  src/navigation/RootNavigator.tsx
```
