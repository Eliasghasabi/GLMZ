// ─────────────────────────────────────────────────────────────
//  SCORE SERVICE
//
//  The single bridge between gameplay and the leaderboard backend.
//  It subscribes to the game's existing event bus, so game.ts never
//  imports any networking code — it just reports that a run ended.
//
//  Mount once at app start:  startScoreService()
// ─────────────────────────────────────────────────────────────

import { bus } from "../store";
import { getProfile } from "./profile";
import { submitScore, flushPending, type SubmitResult, type RunPayload } from "./leaderboard";

export interface SubmissionState extends SubmitResult {
  status: "idle" | "sending" | "done" | "error" | "skipped";
}

let current: SubmissionState = { status: "idle", ok: false };

export function getSubmissionState(): SubmissionState {
  return current;
}

function emit(next: SubmissionState) {
  current = next;
  bus.emit("submission", next);
}

let started = false;

export function startScoreService() {
  if (started) return;
  started = true;

  // retry anything stranded by an earlier outage
  void flushPending();

  bus.on("runcomplete", async (run: RunPayload) => {
    const profile = getProfile();

    // no name yet: the run is kept locally and the UI invites them
    // to set one — we never invent a username on their behalf
    if (!profile.confirmed || !profile.username) {
      emit({ status: "skipped", ok: false, error: "Set a username to compete on the leaderboard" });
      return;
    }

    emit({ status: "sending", ok: false });
    const res = await submitScore(run);
    emit({
      ...res,
      status: res.ok ? "done" : "error",
    });

    // a successful contact is a good moment to drain the outbox
    if (res.ok && !res.local) void flushPending();
  });

  // clear stale feedback when a new run starts
  bus.on("screen", (s: string) => {
    if (s === "playing") emit({ status: "idle", ok: false });
  });
}
