// ─────────────────────────────────────────────────────────────
//  SHADOW STRIKE — event bus bridging the WebGL engine and the
//  React HUD/menu layer. The engine mutates plain data objects
//  and emits events; React subscribes.
// ─────────────────────────────────────────────────────────────

export type ScreenName =
  | "menu"
  | "playing"
  | "paused"
  | "gameover"
  | "howto"
  | "settings"
  | "crosshair"
  | "loadout"
  | "leaderboard";

export interface HudData {
  health: number;
  armor: number;
  ammo: number;
  reserve: number;
  weaponName: string;
  weaponSlot: number;
  score: number;
  kills: number;
  wave: number;
  enemiesLeft: number;
  reloading: boolean;
}

export interface HudPatch extends Partial<HudData> {}

export interface BannerData {
  title: string;
  sub?: string;
  tone: "wave" | "complete" | "danger" | "info";
  countdown?: number;
}

/** emitted when a sniper variant lands a killing shot */
export interface KillConfirmData {
  weapon: string;
  name: string;
  headshot: boolean;
  duration: number;
}

export interface StatsData {
  score: number;
  kills: number;
  wave: number;
  accuracy: number;
  best: boolean;
}

type Handler = (payload: any) => void;

class Bus {
  private map = new Map<string, Set<Handler>>();

  on(event: string, handler: Handler): () => void {
    if (!this.map.has(event)) this.map.set(event, new Set());
    this.map.get(event)!.add(handler);
    return () => this.off(event, handler);
  }

  off(event: string, handler: Handler) {
    this.map.get(event)?.delete(handler);
  }

  emit(event: string, payload?: any) {
    this.map.get(event)?.forEach((h) => h(payload));
  }
}

export const bus = new Bus();

/** Live HUD values — mutated by the engine, broadcast on change. */
export const hud: HudData = {
  health: 100,
  armor: 50,
  ammo: 30,
  reserve: 180,
  weaponName: "SPECTRE AR",
  weaponSlot: 0,
  score: 0,
  kills: 0,
  wave: 1,
  enemiesLeft: 0,
  reloading: false,
};

export function pushHud(patch: HudPatch) {
  Object.assign(hud, patch);
  bus.emit("hud", { ...hud });
}

// Event names used across the app:
//  "hud"        HudData snapshot
//  "screen"     ScreenName
//  "hit"        { kill:boolean, headshot:boolean }
//  "damage"     { amount:number }
//  "banner"     BannerData | null
//  "killfeed"   { text:string, tone:"kill"|"bonus"|"info" }
//  "killconfirm" KillConfirmData (sniper kill flourish)
//  "unlocks"    UnlockableRef[] (newly earned customization items)
//  "runcomplete" RunPayload (run finished — consumed by the score service)
//  "submission" SubmissionState (leaderboard upload progress)
//  "scope"      boolean   (sniper scope overlay)
//  "spread"     number    (crosshair spread px)
//  "stats"      StatsData (game-over summary)
//  "healflash"  void
