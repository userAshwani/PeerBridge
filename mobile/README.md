# PeerBridge (mobile)

React Native / Expo app implementing the same zero-cloud, peer-to-peer
file transfer as the web app at
[transfer.ashwanitiwari.com](https://transfer.ashwanitiwari.com) — same
signaling server, same room codes, same wire protocol, so a mobile user
and a web user can send files to each other directly. Full protocol
spec: [MOBILE-APP-SPEC.md](../transfer/MOBILE-APP-SPEC.md) in the main
repo — this app is a direct implementation of it.

Name/logo/branding intentionally left as Expo's defaults for now, per
instruction to finalize those later — nothing here is final except the
functionality.

---

## How to run this app — step by step

### 1. Fill in the real TURN credentials (do this first)

Open `src/lib/constants.ts` and replace the placeholders:

```ts
export const TURN_USERNAME = "REPLACE_ME";
export const TURN_CREDENTIAL = "REPLACE_ME";
```

with the real values from the self-hosted `coturn` relay — the same
one the web app uses. Find them on the VPS at `/etc/turnserver.conf`
(the `user=peerbridge:<password>` line), or in `TURN-SETUP.md` /
`DEPLOY.md` in the main repo. Same-Wi-Fi tests between two devices may
work without this, but any real cross-network transfer (different
NAT/carrier on each side — the common case on mobile) will silently
fail without it.

### 2. Build a standalone APK (recommended — no Android Studio needed)

This app **cannot run in plain Expo Go** — `react-native-webrtc` is a
native module, and Expo Go's pre-built binary doesn't include it. The
simplest way to get a real, installable app with no local Android
toolchain is Expo's cloud build service:

```bash
cd PeerBridge-mobile
npx eas-cli login
```

One-time — this prompts you to log in or sign up for a free Expo
account right there if you don't have one.

```bash
npx eas-cli build --profile preview --platform android
```

This uploads the project and builds a normal, standalone `.apk` (not
the Play Store's `.aab` format) entirely on Expo's servers. Takes
roughly 10–20 minutes on the free tier (can queue longer). When it
finishes, it prints a download link — also viewable anytime at
[expo.dev](https://expo.dev) under your account's **Builds**.

### 3. Install it on your phone

Download the `.apk` from that link directly on your Android phone (or
transfer it over), then open it to install. Android will ask to allow
**"install from unknown sources"** the first time, since this isn't
from the Play Store — allow it for this file.

### 4. Test it

Open the app, try **Send a file** on one device and **Receive a
file** (enter the code, or **Scan QR code**) on another — a second
phone, or the web app at transfer.ashwanitiwari.com in a browser both
work as the other side. Report back exactly what happens (opens fine
/ crashes / connects but transfer fails / etc.) — that first real test
is what actually confirms whether `react-native-webrtc`'s native
module works correctly on your device (see the risk noted below).

### Alternative: local dev build (if you have Android Studio installed)

For faster iterate-and-reload development instead of a full cloud
build each time:

```bash
npx expo install expo-dev-client
npx expo run:android
```

This builds a debug dev client locally and launches it on a connected
device/emulator. Once installed once, `npx expo start` then works
normally against it for fast refresh (Expo Go still won't load this
app — you need this dev client specifically).

---

## What's implemented (v1 scope)

- Full signaling protocol (room codes, reconnect-with-backoff,
  re-announce-on-reconnect) — interoperates with the web app's
  `server/signaling.js` unchanged, no server-side changes needed.
- Full binary wire protocol (9-byte self-describing chunk header,
  position-addressed writes via `expo-file-system`'s `FileHandle` seek
  support, SHA-256 verification) — byte-for-byte compatible with the
  web app's `lib/webrtc.ts`.
- Single file per transfer (not batches/folders — the web app's
  multi-file batching isn't implemented here yet, though the protocol
  itself already supports it if extended later).
- Single connection only — no parallel-connections "download in parts"
  feature (MOBILE-APP-SPEC.md §6 explicitly calls this optional; a web
  peer that *does* use it gracefully falls back to a single connection
  when talking to this app, so interop isn't affected).
- QR scanning to join (camera), plus manual code entry and the native
  Share sheet for sending a link.
- Picking a save folder on accept (Android's document picker /
  Storage Access Framework via `Directory.pickDirectoryAsync()`),
  falling back to the app's own document directory if skipped.
- Same stall/connection watchdogs as the current web app (give up with
  a clear diagnosis rather than hanging forever if ICE never
  completes; surface an error if "connected" never actually delivers
  data).

## What's explicitly not handled yet

- **Background transfers.** If the app is backgrounded mid-transfer,
  iOS in particular will suspend its network activity — there's no
  background task/service wired up to survive that yet. Keep the app
  foregrounded during a transfer for now (see MOBILE-APP-SPEC.md §9
  for the tradeoffs of adding this properly later).
- Multi-file/folder sending.
- The parallel-connections speed feature (see above — doesn't break
  interop, just not implemented on this side).
- Real device testing — everything above is verified by a clean
  TypeScript compile and a clean `expo-doctor` pass, not by actually
  running on a phone yet (see the run steps above — that's next).

## One real risk worth knowing about

`react-native-webrtc` is flagged by Expo's own dependency checker
(`npx expo-doctor`) as **untested on React Native's New Architecture**
— and this Expo SDK (57) no longer has a way to opt out of New
Architecture; it's mandatory now. This is a genuine, unverified risk
that needs a real build to confirm one way or the other — the WebRTC
data-channel logic itself is a faithful, type-checked port of the web
app's protocol, but whether `react-native-webrtc`'s native module
behaves correctly under New Architecture on an actual device is
exactly what step 4 above (the first real test) will tell us. If a
build crashes or behaves oddly specifically around WebRTC calls, this
is the first thing to suspect — search `react-native-webrtc`'s GitHub
issues for New Architecture reports.

---

## Project structure

```
PeerBridge-mobile/
  App.tsx                        Entry point: PaperProvider + NavigationContainer
  app.json                       Expo config — permissions, bundle IDs, plugins
  eas.json                       EAS Build profiles (development/preview/production)
  src/
    lib/
      constants.ts                Signaling/TURN URLs, brand color — TURN creds go here
      room-code.ts                6-char room code generator (same alphabet as web)
      format.ts                   formatBytes/formatSpeed/formatDuration (ported verbatim)
      sha256.ts                   SHA-256 via js-sha256, incremental streaming hash
      signaling-client.ts         WebSocket signaling client (ported from lib/signaling-client.ts)
      webrtc-session.ts           The core engine — PeerTransferSession, wire protocol,
                                   chunk encode/decode, all connection/stall watchdogs
      usePeerTransferSession.ts   React hook wrapping the engine (mirrors hooks/usePeerTransfer.ts)
      theme.ts                    React Native Paper theme (brand blue #0056D2)
    components/
      StatusChip.tsx              Status pill (React Native Paper Chip)
      TransferProgressView.tsx    Progress bar + speed/ETA (React Native Paper ProgressBar)
    screens/
      HomeScreen.tsx               Landing: Send vs Receive
      SendScreen.tsx                Pick file -> QR/room code/share -> progress
      JoinScreen.tsx                 Enter code/scan -> accept/decline -> progress
      ScanScreen.tsx                  Camera QR reader
    navigation/
      RootNavigator.tsx            React Navigation native-stack setup
```

## Stack

Expo SDK 57, TypeScript, React Navigation (native-stack), React Native
Paper (Material Design 3 — every visual component is a Paper component;
no hand-rolled custom-styled UI, only layout-positioning style props
where React Native structurally requires them), `react-native-webrtc`,
`expo-file-system`'s new `File`/`Directory`/`FileHandle` API,
`expo-camera` (QR scan), `expo-clipboard`, `react-native-qrcode-svg`,
`js-sha256`.
