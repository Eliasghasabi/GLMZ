// ─────────────────────────────────────────────────────────────
//  Platform helpers
//
//  The game ships as BOTH a website and a native Android APK
//  (via Capacitor). This module lets the rest of the code ask
//  "are we running inside the Android app right now?" so it can
//  apply Android-only tweaks: more aggressive pixel-ratio culling,
//  true fullscreen via the native StatusBar plugin, etc.
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
 * Hide the system status bar. No-op on the web build, where
 * requestFullscreen() is used instead.
 *
 * NOTE: The Activity itself (MainActivity.java) already applies
 * immersive mode natively with WindowInsetsController / IMMERSIVE_STICKY,
 * which is what actually hides BOTH the status bar AND the navigation
 * bar. The StatusBar plugin calls here are belt-and-suspenders for
 * edge cases (e.g. some OEM Android builds ignore the activity flags
 * but honour the plugin).
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
  } catch (e) {
    // older Android / missing plugin — fall through silently,
    // the Activity-level immersive mode is the real workhorse.
    console.warn("[native] fullscreen setup failed:", e);
  } finally {
    fsInFlight = false;
  }
}

/**
 * Restore the system bars when the player returns to the menu, so
 * they can read notifications / see the clock while picking a loadout.
 *
 * Currently we DON'T restore on Android because the activity stays
 * immersive the whole time (the menu still looks great fullscreen),
 * but we keep the function so the web build's requestFullscreen()
 * exit path has a parallel native API.
 */
export async function exitNativeFullscreen(): Promise<void> {
  if (!isNativeApp()) return;
  // No-op on Android: we keep immersive mode on for the whole
  // session, including menu screens.
}

// ── Android hardware back button ──────────────────────────────
//
// The default Capacitor behaviour exits the app on the first back
// press. That's catastrophic for a game — pressing back from the
// settings panel should close the panel, not kill the run. We
// intercept the event and route it into the game's screen system.
//
// The handler is registered lazily (once, on first call) and lives
// for the lifetime of the page. It emits a `backbutton` event on
// the game's bus, which the menu component listens for to navigate
// back through the screen stack.

let backHandlerInstalled = false;
type BackHandler = () => boolean; // returns true if consumed
let backHandlers: BackHandler[] = [];

/**
 * Push a handler that gets called when the Android hardware back
 * button is pressed. Handlers are called in LIFO order — the most
 * recently pushed one gets the first chance to consume the event.
 * If a handler returns true, the event is considered handled and
 * the app does NOT exit. If no handler returns true, we fall back
 * to the "press back again to exit" double-press pattern.
 *
 * Returns an unsubscribe function — call it when the screen that
 * pushed the handler unmounts.
 */
export function onAndroidBack(handler: BackHandler): () => void {
  if (!isNativeApp()) return () => {};
  ensureBackHandler();
  backHandlers.push(handler);
  return () => {
    backHandlers = backHandlers.filter((h) => h !== handler);
  };
}

let lastBackPressAt = 0;
const DOUBLE_PRESS_MS = 2000;

async function ensureBackHandler() {
  if (backHandlerInstalled) return;
  backHandlerInstalled = true;
  try {
    const { App } = await import("@capacitor/app");
    App.addListener("backButton", () => {
      // Walk handlers in LIFO order — the topmost screen gets the
      // first chance to consume the event.
      for (let i = backHandlers.length - 1; i >= 0; i--) {
        try {
          if (backHandlers[i]()) return; // consumed
        } catch (e) {
          console.warn("[native] back handler threw:", e);
        }
      }
      // No handler consumed — apply the "press back again to exit"
      // pattern so the player can confirm they really want to leave.
      const now = Date.now();
      if (now - lastBackPressAt < DOUBLE_PRESS_MS) {
        App.exitApp();
        return;
      }
      lastBackPressAt = now;
      // Show a transient toast via the bus so the HUD can display it.
      // We import dynamically so the web build doesn't pull the store
      // module until needed. Synchronous-style emit since the bus is
      // a singleton — we don't need to await anything.
      try {
        // Use a synchronous dynamic getter via the global bus instance
        const { bus } = require("../store");
        bus.emit("toast", { text: "Press back again to exit", duration: 2000 });
      } catch {
        /* bus not loaded yet — the toast just won't show, but the
           double-press pattern still works silently */
      }
    });
  } catch (e) {
    console.warn("[native] back button handler install failed:", e);
  }
}
