import localFont from "next/font/local";

// Gilroy — the heading font from Ashwani Tiwari's own site theme, self-
// hosted here (not Google Fonts) for visual consistency with
// ashwanitiwari.com. Weights matter: SemiBold/Bold/Black cover h1-h6 and
// the hero; Regular is unused for headings but kept for completeness.
export const gilroy = localFont({
  src: [
    { path: "../fonts/gilroy/gilroy-regular.woff2", weight: "400", style: "normal" },
    { path: "../fonts/gilroy/gilroy-semibold.woff2", weight: "600", style: "normal" },
    { path: "../fonts/gilroy/gilroy-bold.woff2", weight: "700", style: "normal" },
    { path: "../fonts/gilroy/gilroy-black.woff2", weight: "900", style: "normal" },
  ],
  variable: "--font-gilroy",
  display: "swap",
});
