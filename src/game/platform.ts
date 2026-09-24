// ─────────────────────────────────────────────────────────────
//  Platform helpers
//
//  The game ships as BOTH a website and a native Android APK
//  (via Capacitor). This module lets the rest of the code ask
//  "are we running inside the Android app right now?" so it can
//  apply Android-only tweaks: more aggressive pixel-ratio culling,
//  true fullscreen via the Capacitor StatusBar plugin, etc.
//
//  On the website these helpers return false / no-op so the web
//  build is completely unaffected.
// ─────────────────────────────────────────────────────────────

import { Capacitor } from "@capacitor/core";

/** true only inside the native Android (or iOS) shell — never true on the web build */
export function isNativeApp(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/** short alias: isNativeApp() && Capacitor.getPlatform() === "android" */
export function isAndroid(): boolean {
  try {
    return Capacitor.getPlatform() === "android";
  } catch {
    return false;
  }
}

let fsInFlight = false;

/**
 * Hide the system status bar and (on Android) the navigation bar,
 * putting the app into true immersive fullscreen. No-op on the web
 * build, where requestFullscreen() is used instead.
 *
 * Safe to call repeatedly — already-fullscreen calls return immediately.
 */
export async function enterNativeFullscreen(): Promise<void> {
  if (!isNativeApp()) return;
  if (fsInFlight) return;
  fsInFlight = true;
  try {
    // dynamic-imported so the web build never pulls these chunks
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setOverlaysWebView({ overlay: true });
    // hide entirely — game is immersive
    await StatusBar.hide().catch(() => {});

    const { App } = await import("@capacitor/app");
    // when the user taps back on Android, ask the OS to background
    // the app instead of destroying the activity — keeps the run
    // state alive if they re-open immediately.
    App.addListener("backButton", () => {
      App.exitApp();
    });
  } catch (e) {
    // older Android / missing plugin — fall through silently
    console.warn("[native] fullscreen setup failed:", e);
  } finally {
    fsInFlight = false;
  }
}

/**
 * Restore the system bars when the player returns to the menu, so
 * they can read notifications / see the clock while picking a loadout.
 */
export async function exitNativeFullscreen(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    const { StatusBar } = await import("@capacitor/status-bar");
    await StatusBar.show().catch(() => {});
    await StatusBar.setOverlaysWebView({ overlay: false }).catch(() => {});
  } catch {
    /* no-op */
  }
}
