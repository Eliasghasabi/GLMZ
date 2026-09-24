// ─────────────────────────────────────────────────────────────
//  FONT LOADER — Vazirmatn (Persian)
//
//  We base64-embed the Vazirmatn woff2 files directly into the JS
//  bundle so the font is guaranteed to load:
//
//    • No dependence on /fonts/* being served correctly by the
//      Android WebView (it serves / at https://localhost, and
//      relative URL resolution has historically been flaky there)
//    • No Google Fonts CDN round-trip (offline-first)
//    • No flash-of-unstyled-text after language switch
//
//  The CSS @font-face rule is injected at app boot once.
// ─────────────────────────────────────────────────────────────

import VazirmatnRegular from "../vazirmatn-regular.b64";
import VazirmatnBold from "../vazirmatn-bold.b64";
import VazirmatnBlack from "../vazirmatn-black.b64";

let injected = false;

/**
 * Inject the @font-face rules for Vazirmatn into the document head.
 * Safe to call repeatedly — only injects once. Called automatically
 * by useApplyLanguage() in App.tsx, so callers usually don't need to
 * invoke this directly.
 */
export function ensureVazirmatnLoaded() {
  if (typeof document === "undefined") return;
  if (injected) return;
  injected = true;

  const css = `
@font-face {
  font-family: "Vazirmatn";
  src: url(data:font/woff2;base64,${VazirmatnRegular}) format("woff2");
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: "Vazirmatn";
  src: url(data:font/woff2;base64,${VazirmatnBold}) format("woff2");
  font-weight: 700;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: "Vazirmatn";
  src: url(data:font/woff2;base64,${VazirmatnBlack}) format("woff2");
  font-weight: 900;
  font-style: normal;
  font-display: swap;
}
`.trim();

  const style = document.createElement("style");
  style.setAttribute("data-vazirmatn", "v1");
  style.textContent = css;
  document.head.appendChild(style);
}
