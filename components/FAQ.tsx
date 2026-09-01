import { ShieldQuestion } from "lucide-react";

const FAQ_ITEMS = [
  {
    q: "Do my files ever touch a server?",
    a: "No. PeerBridge only uses its server to exchange connection metadata (SDP offers/answers and ICE candidates) over WebSocket so two browsers can find each other. Once the WebRTC RTCDataChannel opens, every byte of your file streams directly from the sender's browser memory to the receiver's — the server never sees, stores, or proxies file content.",
  },
  {
    q: "Is the transfer encrypted?",
    a: "Yes. WebRTC mandates DTLS encryption on every RTCDataChannel by specification — there is no unencrypted mode. Your file is encrypted in transit between peers automatically, with no extra configuration.",
  },
  {
    q: "What happens if I close the tab mid-transfer?",
    a: "The transfer stops immediately. Because nothing is ever stored server-side, there is no partial upload sitting on a server to resume from or clean up — closing the tab is equivalent to unplugging a direct cable.",
  },
  {
    q: "How do you verify the file wasn't corrupted?",
    a: "The sender computes a SHA-256 hash of the file using the browser's native Web Crypto API and sends it after the last chunk. The receiver hashes the reassembled file the same way and compares the two — if they don't match, you're warned before trusting the download.",
  },
  {
    q: "Is there a file size limit?",
    a: "No artificial limit is imposed by PeerBridge. Files are streamed in 64KB chunks with backpressure-aware flow control, so transfer is bounded by your browser's available memory and your connection speed, not by any server-side quota.",
  },
  {
    q: "Why do I need a STUN server if nothing is uploaded?",
    a: "STUN servers only help two browsers discover their public IP/port so they can connect directly (NAT traversal) — they never see your file data, only the request 'what does the internet see as my address'.",
  },
];

export function FAQ() {
  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-16 sm:px-10" id="faq">
      <div className="grid grid-cols-1 gap-12 lg:grid-cols-2">
        <div className="hidden flex-col items-center justify-center rounded-3xl border border-zinc-200 bg-zinc-50 p-10 lg:flex">
          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 shadow-lg">
            <ShieldQuestion className="h-12 w-12 text-white" />
          </div>
          <p className="mt-6 max-w-xs text-center text-sm leading-relaxed text-zinc-500">
            Still unsure how the encryption or the zero-storage design actually
            works? Every answer here is technical and specific — no marketing
            fluff.
          </p>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-brand-500">
            Ask questions
          </p>
          <h2 className="mt-2 text-3xl font-bold text-zinc-900">
            Frequently Asked Questions
          </h2>

          <div className="mt-8 flex flex-col gap-3">
            {FAQ_ITEMS.map((item, i) => (
              <details
                key={item.q}
                className="group rounded-xl border border-zinc-200 bg-white p-5 shadow-sm transition-shadow open:border-brand-300/60 open:shadow-md"
              >
                <summary className="cursor-pointer list-none text-base font-medium text-zinc-800 marker:content-none">
                  <span className="flex items-center gap-3">
                    <span className="font-mono text-xs text-zinc-300">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="flex-1">{item.q}</span>
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-400 transition-transform group-open:rotate-45 group-open:bg-brand-100 group-open:text-brand-500">
                      +
                    </span>
                  </span>
                </summary>
                <p className="mt-3 pl-8 text-sm leading-relaxed text-zinc-500">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
