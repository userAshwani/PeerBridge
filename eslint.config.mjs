import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Plain CommonJS Node scripts, not part of the Next app bundle.
    "server.js",
    "server/**",
    // Separate Expo/React Native app with its own toolchain and
    // dependencies (never npm-installed at the repo root) — Next's
    // build-time lint pass would otherwise fail trying to resolve its
    // imports (react-native, expo-*, etc.) against the root node_modules.
    "mobile/**",
  ]),
]);

export default eslintConfig;
