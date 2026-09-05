# What ToffeeShare's fork actually does, and why our app was failing

Written after reading the repo cloned at
`D:\DIGITALLY BIRD\2026\github\react-native-webrtc` (which is
`github.com/ToffeeShare/react-native-webrtc`, at commit `9faa2bd`).

The short version: **the two problems we're hitting are not the problem
their fork solves.** Their fork is a targeted performance change to the
*send* path. Our "room code doesn't exist" / stuck-on-Connecting bug is a
connection-lifecycle bug in our own code, with a known fix that was simply
never carried over from the web app. Both are worth fixing; they're
unrelated, and the lifecycle one is what's actually blocking us.

---

## 1. What that repo is (and isn't)

It is **not** the ToffeeShare app. It's their private fork of
`react-native-webrtc` — the *library* that gives React Native access to
WebRTC. The app that uses it isn't public.

The fork is `master` at 881 commits, **5 commits ahead of upstream and 241
behind**, last touched **November 2022**. Only one of those five commits
contains real code:

```
bb93e73  updates to directly transfer files from native code   (Jan 2022)
```

Four files changed. That commit is the whole story.

## 2. What that commit does

**The problem it solves.** In stock `react-native-webrtc`, sending binary
data over a data channel means this, per message, in JavaScript:

```js
// node_modules/react-native-webrtc/src/RTCDataChannel.ts
const base64data = base64.fromByteArray(data as Uint8Array);
WebRTCModule.dataChannelSend(this._peerConnectionId, this._reactTag, base64data, 'binary');
```

So for every 64KB chunk of a file: read it into JS, base64-encode it in JS
(making it ~87KB), hand that string across the React Native bridge, and
have native decode it again. The file's bytes pass through JavaScript
*twice*, inflated by a third, for every single chunk.

**What they changed.** They deleted that entirely and redefined the API so
JavaScript never touches the file at all:

```js
// their RTCDataChannel.js
send(filepath, position, length) {
  WebRTCModule.dataChannelSend(this._peerConnectionId, this._reactTag, filepath, position, length);
}
```

JS now says *"send bytes 640000–704000 of this file"*. Native does the
rest — it opens the file once, keeps the stream open across calls, seeks,
reads the slice, and pushes it straight into the data channel:

```java
// their PeerConnectionObserver.java
void dataChannelSend(String reactTag, String filepath, int position, int length) {
    if (this.inputStream == null || position == 0) {
        this.inputStream = getInputStream(filepath);
        inputStream.skip(position);
    }
    byte[] arrayBuffer = new byte[length];
    inputStream.read(arrayBuffer, 0, length);
    dcw.getDataChannel().send(new DataChannel.Buffer(ByteBuffer.wrap(arrayBuffer), true));
}
```

Zero file bytes cross the bridge. No base64. No per-chunk JS allocation.
That is why their sending is fast.

They also implemented `onBufferedAmountChange`, which upstream had left as
a literal `// TODO.` at the time — so before their fork, flow control on
Android didn't work at all.

## 3. What they did *not* change — an important detail

**Their receive path is untouched.** Incoming messages still get
base64-encoded natively, crossed over the bridge, and decoded in JS:

```java
// DataChannelWrapper.java — unchanged in the fork
data = Base64.encodeToString(bytes, Base64.NO_WRAP);
```

So their optimization is **send-only**. Receiving on mobile is as
bridge-bound for them as it is for us. Worth knowing before treating this
fork as a complete answer — it isn't one.

Also worth knowing: `onBufferedAmountChange` is no longer a
differentiator. Our installed version (`124.0.8`, ~2 months old) already
implements it. Of the fork's five commits, only the native send is
actually still ahead of upstream.

## 4. Why we can't just use their fork

- **It predates the New Architecture.** It targets `react-native-webrtc`
  ~106-beta from 2022, built on the old bridge. Our Expo SDK 57 *mandates*
  React Native's New Architecture (there's no opt-out anymore). Their
  native module wouldn't load.
- **It's 241 commits and ~4 years behind**, on WebRTC M94. Ours is on
  124.0.8. That's a large security and compatibility gap.
- **It's a breaking fork, not a superset.** They *replaced*
  `send(data)` with `send(filepath, position, length)`. Standard WebRTC
  data-channel usage — including sending our JSON control messages —
  no longer works with it.

The idea is worth adopting. The code isn't.

---

## 5. So why was *our* app failing?

Three separate causes, and the fork's approach only addresses one of them.

### 5a. "This room code doesn't exist or has expired" — the actual blocker

Nothing to do with WebRTC or the library. This is a room-lifecycle bug.

Our signaling server keeps rooms **purely in memory, tied to a live
WebSocket** (`server/signaling.js`):

```js
const cleanupEmptyRoom = (roomId) => {
  const room = rooms.get(roomId);
  if (room && !room.sender && room.receivers.size === 0) rooms.delete(roomId);
};
ws.on("close", leaveCurrentRoom);   // sender's socket closes -> room is deleted
```

So the room exists only while the sender's socket is open. On the web
that's fine — a browser tab stays alive. On a phone it is not: the moment
the sender's app goes to the background (screen times out, you pick up the
other phone, you switch to WhatsApp to share the link), Android suspends
it, the socket drops, and the server deletes the room. The receiver then
types a code for a room that no longer exists.

Meanwhile the sender sits on `"Connecting…"` because its reconnect backoff
timer was frozen while suspended.

**The web app already solves this**, and the fix was never ported to
mobile (`lib/webrtc.ts`):

```js
document.addEventListener("visibilitychange", this.handleVisibilityChange);
// -> if visible again, this.signaling.reconnectNow();
```

Our mobile client *has* `reconnectNow()` in `signaling-client.ts` — **and
nothing anywhere calls it.** There was no `AppState` listener at all. That
is the entire bug: the exact scenario the web app defends against is far
more aggressive on mobile, and we shipped without the defence.

### 5b. Speed

Two contributors, one ours and one theirs:

- **Ours (fixed):** the receiver was doing a seek + a blocking native write
  *per 64KB chunk*, straight into a SAF `content://` folder, where writes
  are far more expensive than to a local file. Now it writes to local
  storage in ~4MB batches and copies out once at the end. The sender
  likewise reads 4MB blocks instead of one native read per chunk.
- **Theirs (not fixed):** the base64-over-the-bridge cost described above.
  Fixing this on our side means our own native module — see §6.

### 5c. The transfer dying when the app is backgrounded

Same root cause as 5a, and it also affects an in-flight transfer, not just
the room. Android will suspend our JS. Nothing in the app currently asks
it not to. The real fix is an Android **foreground service** with an
ongoing notification — the same mechanism Chrome's downloads use.

---

## 6. Plan, in priority order

1. **Reconnect on foreground (done).** An `AppState` listener that forces
   `reconnectNow()` the instant the app becomes active, mirroring the web
   app's `visibilitychange` handler, plus re-announcing the room so the
   sender's room reappears immediately rather than after a backoff.
2. **Receiver retries "Room not found" (done).** Previously a dead end.
   The sender is often seconds away from being foregrounded again, so the
   receiver now retries for a while before giving up.
3. **Foreground service + progress notification (next).** Keeps the socket
   and the transfer alive with the screen off, and shows speed/ETA in the
   notification shade. This is the structural fix for both 5a and 5c.
4. **Native send path (optional, later).** Port ToffeeShare's *idea* — not
   their fork — as a small Expo module: pass `(uri, position, length)` to
   native, let native read and send. Worth doing only if speed is still
   unacceptable after the batching fixes, because it's a real native
   module to maintain, and it only helps the send direction anyway.
