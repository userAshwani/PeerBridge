# Feature ideas — what could make this beat ToffeeShare

Brief by design. Each idea: what it is, why it grows usage, one honest
feasibility note.

## 1. In-app chat (your idea — this is the big one)

WhatsApp-style text chat between the two connected devices, sent over the
same WebRTC data channel already used for files — so it's already
end-to-end encrypted in transit (DTLS/SRTP), same as the file bytes,
with zero server involvement.

The part that makes it different from a normal chat app: **messages are
never stored anywhere except the two devices**, encrypted at rest,
readable only by the account that received them. Concretely: each
message gets written to a local file, encrypted with a key derived from
the user's own login (so only that account can decrypt it — not even
someone with raw file access to the phone can open it without the app
and that login), not a plain database row a server could ever see.

Why it matters for growth: turns the app from "a tool you open once to
send a file" into "an app you keep open and return to" — chat is what
makes people come back daily. Feasible with what's already built (data
channel is already there); the new work is local encrypted storage and
an actual message-history UI.

## 2. Login (email or phone OTP)

Needed for chat to make sense at all — you need to know *who* sent a
message, and to have a persistent identity to reconnect to instead of
generating a new room code every single time.

Trade-off worth being upfront about: this moves the app from "zero
account, zero server storage, fully anonymous" to "the server knows your
email/phone exists" — a real shift from the current privacy pitch. Keep
it minimal: identity only, never chat content or file content.

## 3. Saved contacts / recent people

Once there's a login, "people I've shared with before" becomes possible
— tap a saved contact instead of scanning a QR code every time. This is
the single biggest everyday-usability win once accounts exist, and it's
also the thing that makes people actually re-open the app instead of
using it once and forgetting it.

## 4. Fully offline mode (same Wi-Fi / hotspot, zero internet)

If both phones are on the same network, a direct connection needs no
internet at all beyond the very first handshake. Marketed honestly
("works with no data, no Wi-Fi router even — just your phone's
hotspot"), this is a real pitch ToffeeShare's own positioning doesn't
obviously make. Needs work on how the initial handshake happens without
your signaling server when there's genuinely no internet.

## 5. Resume a broken transfer

The wire protocol already tags every chunk with its exact byte position
— the missing piece is remembering how much of a file arrived across an
app restart (not just a quick background/foreground blip), so a transfer
that gets fully killed picks up where it left off instead of restarting
from zero. Natural extension of work already in the app, not new
architecture.

## 6. Send to multiple people at once (broadcast)

One room, several people scan the same code, everyone gets the file.
Real, visible feature. The server's room model already tracks a list of
receivers per room, so the grouping logic half-exists already — the new
part is sending to more than one data channel at once.

## 7. "Share to PeerBridge" from any app

Show up in Android's native share sheet, so sending a photo from the
Gallery app or a PDF from a browser goes straight to PeerBridge without
opening the app first. Small to build, meaningfully lowers the friction
that decides whether someone actually uses a tool regularly.

## 8. Self-destructing / one-time codes as a marketed feature

Rooms already die the moment either side leaves — making that a visible,
stated property ("this link and any messages on it are gone the second
you close it, forever, nowhere logged") turns an implementation detail
into a selling point for privacy-conscious users.

## 9. Desktop app

Worth confirming what ToffeeShare actually ships today before treating
this as an opening — but if their product is web/mobile only, a real
Windows/Mac app (same signaling server, same protocol) is a gap to fill.

---

## What I'd build first

Foreground service (already in progress, separate from this list — it's
required just to be reliable, not a differentiator) → login + chat
(items 1–3, the actual growth engine) → pick one more from the rest.
Not all nine at once.
