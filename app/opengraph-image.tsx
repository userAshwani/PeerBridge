import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#09090b",
          color: "#f4f4f5",
          fontSize: 96,
          fontWeight: 800,
        }}
      >
        <div style={{ display: "flex" }}>
          Peer<span style={{ color: "#34d399" }}>Bridge</span>
        </div>
        <div style={{ display: "flex", fontSize: 32, color: "#a1a1aa", marginTop: 24 }}>
          Zero-Cloud P2P File Transfer
        </div>
      </div>
    ),
    size,
  );
}
