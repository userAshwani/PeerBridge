# Handoff: mobile app transfers are still unreliable

Written for a fresh Claude session to pick up cold. Ashwani reported
"still creating same problem" after the fix in `b08673d` (the most
recent mobile commit as of this writing) — **the exact symptom that
recurred was not confirmed before this document was written**, so don't
assume which of the symptoms below repeated; ask, or look for a fresh
screenshot/description, before re-diagnosing from scratch.

## What this app is

`mobile/` in this repo is a React Native/Expo (SDK 57) port of the web
app at `transfer.ashwanitiwari.com` (this repo's root — `lib/webrtc.ts`
is the reference implementation). Same signaling server
(`server/signaling.js`), same room-code system, same binary chunk wire
protocol. Mobile-side engine: `mobile/src/lib/webrtc-session.ts`. The web
app itself works reliably in production; the mobile port has not yet
reached the same reliability in real two-phone testing.

**Read `mobile/PROJECT-CONTEXT.md` and `mobile/TOFFEESHARE-ANALYSIS.md`
first** — they cover hard constraints (Paper-only UI, wire-protocol
parity requirement, no hardcoded secrets), the design-system fix, the
EAS build/credentials setup, and a detailed teardown of what a
similar app's `react-native-webrtc` fork does differently and why we
can't adopt it directly (New Architecture incompatibility).

## Everything already tried, in order (don't repeat these)

Each of these was a real, confirmed bug, found from an actual two-phone
test and fixed — not a guess:

1. **`b95a614`** — the file was handed to the transfer session via a
   `queueMicrotask` racing against a `useEffect` that creates the
   session; the race was lost on React Native (though not on web,
   where the identical pattern happens to work). Result: sender never
   sent `batch-meta`, both sides sat at "Connected" forever. Fixed by
   passing the file into the hook directly instead of pushing it in
   separately-timed.
2. **`a87472c`** — receiver opened the save file with
   `FileMode.ReadWrite`, which `expo-file-system` documents as
   unsupported on SAF `content://` URIs (a user-picked folder). Every
   save into a picked folder failed on the first chunk. Fixed by using
   `FileMode.WriteOnly` (the receiver never reads back).
3. **`e69b0a1`** — speed was ~20 KB/s vs. multi-MB/s on web. Root cause:
   a native seek + write call *per 64KB chunk*, into a SAF URI where
   writes are expensive. Fixed by receiving into local app storage in
   ~4MB batches, then bulk-copying out to the user's folder once at the
   end. Sender given the same treatment (4MB reads, sliced in JS).
   **Known remaining ceiling, not fixed**: `react-native-webrtc` itself
   base64-encodes every binary message across the JS bridge — see
   `TOFFEESHARE-ANALYSIS.md` for why that's a library-level limit, not
   ours, and why we can't adopt ToffeeShare's fork that works around it.
4. **`6c13382`** — "This room code doesn't exist or has expired" on the
   receiver while the sender sat on "Connecting…". Root cause: the
   signaling server (`server/signaling.js`) deletes a room the instant
   the sender's WebSocket closes, and Android closes that socket the
   instant the app backgrounds (screen timeout, switching apps). The web
   app already defends against this with a `visibilitychange` handler
   forcing `signaling.reconnectNow()`; mobile had `reconnectNow()`
   sitting unused with no `AppState` listener at all. Fixed by adding
   one. Also made the receiver retry "Room not found" for 90s instead of
   erroring immediately (a phone being backgrounded is not the same as a
   wrong code).
5. **`44b94de`** — the `AppState` listener added in `6c13382` introduced
   a new bug: `reconnectNow()` only skipped opening a new socket if one
   was already fully `OPEN`, not if one was still `CONNECTING`. The
   listener fires a real state transition right as a session starts,
   racing the very first `connect()` call. Result: two sockets, both
   sending `create-room` for the same id, server correctly rejecting the
   second — "Room already has a sender" **on a brand-new, never-used
   code**, i.e. the app racing against itself. Fixed by also checking
   `CONNECTING`. Also added `expo-keep-awake` for the duration of a
   transfer, since a 5-second screen timeout (shorter than almost any
   transfer) was independently killing sends and drops.
6. **`b08673d`** — three more things from the next test round:
   - A status change never cleared a previous error message, so an old
     "connected but no data" error stayed on screen underneath a later,
     unrelated "Closed" status (confusing — looked like two failures at
     once, was really a display bug).
   - **The most likely remaining root cause, addressed but not proven
     fixed**: the sender had *no timeout at all* once it believed
     `batch-meta` was sent — `channel.send()` succeeding locally is not
     proof of delivery, there's no ack for a single data-channel
     message. If that first control message is ever dropped, the sender
     was stuck on "Awaiting response" forever with nothing to act on.
     Added a resend-with-retry (every 4s, up to 5 times, `constants`
     `BATCH_META_RETRY_MS` / `BATCH_META_MAX_RETRIES` in
     `webrtc-session.ts`), with a real final error if the receiver never
     responds.
   - Reworked the save flow per explicit request: pick a folder once,
     ever (persisted in `mobile/src/lib/save-location.ts`), auto-save
     silently into a `PeerBridge` subfolder after that, "Open file" /
     "Open folder" buttons on the completed card.

## What's still unconfirmed / worth investigating next

The pattern across every test round: the connection *appears* to
establish (status reaches "connected"/"Awaiting response" on the
sender), but application data (the `batch-meta` control message, or
later, actual file chunks) intermittently never arrives at the other
side, or arrives partway and stalls. Everything fixed above was real and
worth fixing, but **none of it has been proven to be the last root
cause**, because there's no way to see *why* a data channel that reports
itself open sometimes doesn't deliver — this needs actual visibility
into what's happening at the WebRTC layer, not more guessing from
screenshots. Concretely, next steps in priority order:

1. **Add debug visibility.** Right now a failure just shows a final
   user-facing message with no way to know which of several possible
   causes it was. At minimum, log (temporarily, behind a dev flag) the
   ICE candidate types actually selected (`candidateTypeCounts` already
   exists in `webrtc-session.ts` for the give-up-timer diagnosis — it's
   not currently surfaced anywhere for the "batch-meta never arrived"
   case), `pc.connectionState`/`iceConnectionState` transitions, and
   `channel.readyState` at every retry attempt. Without this, every fix
   so far has been "plausible root cause found from a screenshot and a
   photograph of a phone," not confirmed from an actual trace.
2. **Test the exact same scenario twice in a row without changing
   anything**, to establish whether this is *consistently* broken (a
   real, deterministic bug) or *intermittently* broken (points much more
   strongly at the AP/client-isolation or a genuine WebRTC-layer race,
   both of which are environment-dependent, not code bugs to fix by
   inspection).
3. **Seriously weigh the New Architecture risk.** `expo-doctor` has
   flagged `react-native-webrtc` as untested on React Native's New
   Architecture on every single check this session — this Expo SDK
   makes New Architecture mandatory, no opt-out. If data channels
   silently failing to deliver messages under load turns out to be a
   New-Architecture-specific bug in `react-native-webrtc` itself, no
   amount of application-level retry logic fixes it reliably; it would
   need either a `react-native-webrtc` version bump (check their GitHub
   issues for New Architecture + data channel reports) or accepting the
   retry-based mitigations already in place as a permanent workaround.
4. **Only after (1) gives real data**: decide whether the retry logic in
   `b08673d` actually fixed the recurring symptom, or whether it's
   masking a deeper, still-unfixed delivery problem that will keep
   resurfacing in new shapes.

## Separate, unrelated issue: web app deploy failing

`.github/workflows/deploy.yml` ("Deploy to VPS") started failing with
`ssh: connect to host *** port ***: Connection timed out` on the run
right after `b08673d` was pushed — every prior deploy in the Actions
history succeeded. This is **not a code problem**: nothing in that
commit touches the deploy workflow, and a connection timeout means the
GitHub Actions runner couldn't reach the VPS's SSH port at all (not a
login/auth failure, which would give a different error). Needs checking
directly on the VPS side (Hostinger panel — is it running, has the
firewall or SSH port changed — see `DEPLOY.md` §8's note about Hostinger
VPS's two separate firewalls) or simply re-running the job in case it
was transient. Not yet confirmed resolved as of this writing.
