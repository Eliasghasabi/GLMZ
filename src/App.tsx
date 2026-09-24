import { useEffect, useRef, useState } from "react";
import { RotateCw } from "lucide-react";
import { Game } from "./game/game";
import { setGame } from "./game/instance";
import { bus, type ScreenName } from "./store";
import Hud from "./ui/Hud";
import Menus from "./ui/Menus";
import TouchControls, { isTouchDevice } from "./ui/TouchControls";
import { startScoreService } from "./net/scoreService";

function usePortrait(touch: boolean) {
  const [portrait, setPortrait] = useState(
    () => touch && typeof window !== "undefined" && window.matchMedia("(orientation: portrait)").matches
  );
  useEffect(() => {
    if (!touch) return;
    const mq = window.matchMedia("(orientation: portrait)");
    const onChange = () => setPortrait(mq.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, [touch]);
  return portrait;
}

export default function App() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [screen, setScreen] = useState<ScreenName>("menu");
  const [touch] = useState(isTouchDevice);
  const [bootError, setBootError] = useState<string | null>(null);
  const portrait = usePortrait(touch);

  // bridges gameplay run results to the leaderboard backend
  useEffect(() => { startScoreService(); }, []);

  useEffect(() => {
    if (!mountRef.current) return;
    let game: Game | null = null;
    try {
      game = new Game(mountRef.current);
      if (touch) game.enableTouchMode();
      setGame(game);
    } catch (err) {
      // Surface the failure instead of leaving PLAY silently doing
      // nothing forever while it polls for a game instance that will
      // never exist.
      console.error("[boot] game failed to initialize:", err);
      setBootError(err instanceof Error ? err.message : String(err));
      return;
    }
    const off = bus.on("screen", (s: ScreenName) => setScreen(s));
    return () => {
      off();
      setGame(null);
      game?.dispose();
    };
  }, [touch]);

  const inGame = screen === "playing" || screen === "paused";

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#05070b]">
      {/* WebGL canvas */}
      <div ref={mountRef} className="absolute inset-0" />
      {/* HUD overlays */}
      {inGame && <Hud />}
      {touch && screen === "playing" && <TouchControls />}
      {inGame && portrait && (
        <div className="absolute inset-0 z-[60] flex flex-col items-center justify-center gap-4 bg-[#05070b] px-8 text-center">
          <RotateCw size={40} className="animate-spin text-[#e8b545]" style={{ animationDuration: "2.2s" }} />
          <p className="text-sm font-bold tracking-[0.15em] text-white">ROTATE YOUR DEVICE</p>
          <p className="max-w-xs text-xs leading-relaxed text-[#8fa8bf]">
            Shadow Strike plays in landscape. Turn your phone sideways to continue.
          </p>
        </div>
      )}
      {bootError ? (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#05070b] p-6 text-center">
          <div className="max-w-md border border-[#ff5546]/50 bg-[#200c0a]/80 p-6">
            <p className="mb-2 text-sm font-bold tracking-[0.15em] text-[#ff9a90]">
              GAME FAILED TO START
            </p>
            <p className="mb-4 text-xs leading-relaxed text-[#c9a8a4]">
              Something went wrong while loading the game engine. Try reloading the page.
            </p>
            <p className="break-all font-mono text-[10px] text-[#8a6a66]">{bootError}</p>
          </div>
        </div>
      ) : (
        <Menus />
      )}
    </div>
  );
}
