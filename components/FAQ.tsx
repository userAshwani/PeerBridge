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
    <section className="mx-auto w-full max-w-3xl px-4 py-16" id="faq">
      <h2 className="mb-8 text-center text-2xl font-bold text-zinc-100">
        Security & how it works
      </h2>
      <div className="flex flex-col gap-3">
        {FAQ_ITEMS.map((item) => (
          <details
            key={item.q}
            className="group rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 open:border-cyan-400/40"
          >
            <summary className="cursor-pointer list-none text-sm font-medium text-zinc-200 marker:content-none">
              <span className="flex items-center justify-between">
                {item.q}
                <span className="text-zinc-500 transition-transform group-open:rotate-45">+</span>
              </span>
            </summary>
            <p className="mt-3 text-sm leading-relaxed text-zinc-400">{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
