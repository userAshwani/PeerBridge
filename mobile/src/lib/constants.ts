export const SIGNALING_URL = "wss://transfer.ashwanitiwari.com/ws";
export const WEB_APP_URL = "https://transfer.ashwanitiwari.com";

// Same relay already deployed for the web app, configured the same way —
// build-time env vars (Expo inlines EXPO_PUBLIC_* at build time, same as
// Next.js does with NEXT_PUBLIC_*), never hardcoded here. Set locally in
// `.env` (gitignored, see .env.example) for dev builds, and as EAS project
// environment variables (`eas env:create`, see DEPLOY notes) for
// `eas build` — see TURN-SETUP.md / DEPLOY.md in the main repo. Falls back
// to a public shared TURN relay if unset (see webrtc-session.ts).
export const TURN_URLS = process.env.EXPO_PUBLIC_TURN_URLS;
export const TURN_USERNAME = process.env.EXPO_PUBLIC_TURN_USERNAME;
export const TURN_CREDENTIAL = process.env.EXPO_PUBLIC_TURN_CREDENTIAL;

export const CONTACT_EMAIL = "dev.ashwanitiwari@gmail.com";
export const CONTACT_URL = "https://ashwanitiwari.com/contact";

// Placeholder brand — name/logo intentionally not finalized yet per
// instruction; swap these in one place once decided.
export const APP_NAME = "PeerBridge";
export const BRAND_COLOR = "#0056D2";
