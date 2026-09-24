// Holds the live Game instance so React components can issue commands
// (start / resume / restart / quit) without prop drilling.
import type { Game } from "./game";

let _game: Game | null = null;

export function setGame(g: Game | null) {
  _game = g;
}

export function getGame(): Game | null {
  return _game;
}
