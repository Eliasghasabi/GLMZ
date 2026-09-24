// ─────────────────────────────────────────────────────────────
//  SHADOW STRIKE — leaderboard Worker
//
//  Cloudflare Worker + D1. D1 is used rather than KV because a
//  leaderboard is fundamentally a "top N ordered by score" query:
//  in KV that means listing and sorting every key on each request,
//  whereas D1 answers it with one indexed SQL statement and keeps
//  full history for free.
//
//  Routes
//    GET  /api/health
//    GET  /api/leaderboard?month=YYYY-MM&limit=100&user=NAME
//    POST /api/score
//    GET  /api/validate-name?name=X&device=Y
//    POST /api/username/claim  { username, device }
//    GET  /api/chat?since=TIMESTAMP&limit=50
//    POST /api/chat  { username, device, text }
//
//  Deploy: see server/README.md
// ─────────────────────────────────────────────────────────────

import {
  validateScorePayload, validateUsername, usernameKey,
  monthKey, verifySignature, type ScorePayload,
} from "../../src/net/scoreRules";

export interface Env {
  DB: D1Database;
  /** optional: comma-separated allowed origins. "*" if unset. */
  ALLOWED_ORIGINS?: string;
  /** optional: overrides the client signing salt */
  SIGNING_SALT?: string;
}

// ── tuning ──────────────────────────────────────────────────
const MAX_LIMIT = 100;
const RATE_WINDOW_MS = 60 * 60 * 1000;  // 1 hour
const RATE_MAX_PER_WINDOW = 30;         // submissions per device per hour
const MIN_GAP_MS = 20 * 1000;           // minimum spacing between submissions
const IP_MAX_PER_WINDOW = 120;          // submissions per IP per hour

const CHAT_TEXT_MAX = 200;
const CHAT_MAX_LIMIT = 100;
const CHAT_MIN_GAP_MS = 2500;              // min spacing between a device's messages
const CHAT_RATE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const CHAT_RATE_MAX_PER_WINDOW = 20;       // messages per device per window

// ── helpers ─────────────────────────────────────────────────

function corsHeaders(env: Env, origin: string | null): Record<string, string> {
  const allowed = (env.ALLOWED_ORIGINS ?? "*").trim();
  let allowOrigin = "*";
  if (allowed !== "*") {
    const list = allowed.split(",").map((s) => s.trim()).filter(Boolean);
    allowOrigin = origin && list.includes(origin) ? origin : list[0] ?? "*";
  }
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(data: unknown, status: number, env: Env, origin: string | null): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...corsHeaders(env, origin),
    },
  });
}

/** stable, non-identifying hash for the rate-limit bucket */
async function hash(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ── routes ──────────────────────────────────────────────────

async function handleLeaderboard(req: Request, env: Env, origin: string | null): Promise<Response> {
  const url = new URL(req.url);
  const month = /^\d{4}-\d{2}$/.test(url.searchParams.get("month") ?? "")
    ? url.searchParams.get("month")!
    : monthKey();
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, parseInt(url.searchParams.get("limit") ?? "50", 10) || 50)
  );
  const user = url.searchParams.get("user");

  // Each player's BEST run for the month, ranked. The window
  // function keeps the kills/wave/accuracy belonging to that
  // specific run rather than mixing maxima from different runs.
  const topSql = `
    SELECT username, score, kills, wave, accuracy, difficulty, created_at
    FROM (
      SELECT *, ROW_NUMBER() OVER (
        PARTITION BY username_key ORDER BY score DESC, created_at ASC
      ) AS rn
      FROM scores WHERE month = ?1
    )
    WHERE rn = 1
    ORDER BY score DESC, created_at ASC
    LIMIT ?2`;

  const { results } = await env.DB.prepare(topSql).bind(month, limit).all();
  const entries = (results ?? []).map((r: any, i: number) => ({
    rank: i + 1,
    username: r.username as string,
    score: r.score as number,
    kills: r.kills as number,
    wave: r.wave as number,
    accuracy: r.accuracy as number,
    difficulty: r.difficulty as string,
    at: r.created_at as number,
  }));

  // total distinct players competing this month
  const totalRow = await env.DB.prepare(
    `SELECT COUNT(DISTINCT username_key) AS n FROM scores WHERE month = ?1`
  ).bind(month).first<{ n: number }>();

  // the caller's own standing, even when outside the returned page
  let you: null | {
    rank: number; username: string; score: number;
    kills: number; wave: number; accuracy: number;
  } = null;

  if (user) {
    const key = usernameKey(user);
    const best = await env.DB.prepare(
      `SELECT username, score, kills, wave, accuracy, created_at
         FROM scores WHERE month = ?1 AND username_key = ?2
        ORDER BY score DESC, created_at ASC LIMIT 1`
    ).bind(month, key).first<any>();

    if (best) {
      // rank = players whose best beats this one, plus one
      const rankRow = await env.DB.prepare(
        `SELECT COUNT(*) AS n FROM (
           SELECT username_key, MAX(score) AS s
             FROM scores WHERE month = ?1
            GROUP BY username_key
           HAVING s > ?2
         )`
      ).bind(month, best.score).first<{ n: number }>();
      you = {
        rank: (rankRow?.n ?? 0) + 1,
        username: best.username,
        score: best.score,
        kills: best.kills,
        wave: best.wave,
        accuracy: best.accuracy,
      };
    }
  }

  return json(
    { ok: true, month, entries, you, totalPlayers: totalRow?.n ?? 0, serverTime: Date.now() },
    200, env, origin
  );
}

async function usernameOwner(env: Env, key: string): Promise<string | null> {
  const row = await env.DB.prepare(
    `SELECT device FROM usernames WHERE username_key = ?1`
  ).bind(key).first<{ device: string }>();
  return row?.device ?? null;
}

async function handleValidateName(req: Request, env: Env, origin: string | null): Promise<Response> {
  const url = new URL(req.url);
  const name = url.searchParams.get("name") ?? "";
  const r = validateUsername(name);
  if (!r.ok) return json({ ok: false, error: r.reason }, 200, env, origin);

  const deviceRaw = String(url.searchParams.get("device") ?? "").slice(0, 64);
  const device = deviceRaw ? await hash(deviceRaw) : "";
  const owner = await usernameOwner(env, usernameKey(name));
  if (owner && owner !== device) {
    return json({ ok: false, error: "That username is already taken" }, 200, env, origin);
  }
  return json({ ok: true }, 200, env, origin);
}

/** Claim a username for a device, Telegram-style: first come, first
 *  served, and a name stays reserved to whichever device claimed it.
 *  A device may rename — its previous claim is released. */
async function handleClaimUsername(req: Request, env: Env, origin: string | null): Promise<Response> {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "Malformed JSON body" }, 400, env, origin);
  }

  const name = String(body?.username ?? "");
  const v = validateUsername(name);
  if (!v.ok) return json({ ok: false, error: v.reason }, 422, env, origin);

  const deviceRaw = String(body?.device ?? "").slice(0, 64);
  if (!deviceRaw) return json({ ok: false, error: "Missing device id" }, 400, env, origin);
  const device = await hash(deviceRaw);
  const key = usernameKey(name);
  const now = Date.now();

  const owner = await usernameOwner(env, key);
  if (owner && owner !== device) {
    return json({ ok: false, error: "That username is already taken" }, 409, env, origin);
  }

  if (!owner) {
    // release this device's previous name, if any, then claim the new one
    await env.DB.prepare(`DELETE FROM usernames WHERE device = ?1`).bind(device).run();
    await env.DB.prepare(
      `INSERT INTO usernames (username_key, username, device, created_at) VALUES (?1,?2,?3,?4)`
    ).bind(key, name.trim(), device, now).run();
  } else {
    // already theirs — keep the display-case form current
    await env.DB.prepare(
      `UPDATE usernames SET username = ?1 WHERE username_key = ?2`
    ).bind(name.trim(), key).run();
  }

  return json({ ok: true }, 200, env, origin);
}

async function handleChatGet(req: Request, env: Env, origin: string | null): Promise<Response> {
  const url = new URL(req.url);
  const since = Math.max(0, Number(url.searchParams.get("since") ?? 0) || 0);
  const limit = Math.min(CHAT_MAX_LIMIT, Math.max(1, Number(url.searchParams.get("limit") ?? 50) || 50));

  let rows: { id: number; username: string; text: string; created_at: number }[];
  if (since > 0) {
    const res = await env.DB.prepare(
      `SELECT id, username, text, created_at FROM chat_messages
         WHERE created_at > ?1 ORDER BY created_at ASC LIMIT ?2`
    ).bind(since, limit).all<{ id: number; username: string; text: string; created_at: number }>();
    rows = res.results ?? [];
  } else {
    const res = await env.DB.prepare(
      `SELECT id, username, text, created_at FROM chat_messages
         ORDER BY created_at DESC LIMIT ?1`
    ).bind(limit).all<{ id: number; username: string; text: string; created_at: number }>();
    rows = (res.results ?? []).reverse();
  }

  return json({ ok: true, messages: rows, serverTime: Date.now() }, 200, env, origin);
}

async function handleChatPost(req: Request, env: Env, origin: string | null): Promise<Response> {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "Malformed JSON body" }, 400, env, origin);
  }

  const username = String(body?.username ?? "").trim();
  const nameCheck = validateUsername(username);
  if (!nameCheck.ok) return json({ ok: false, error: nameCheck.reason }, 422, env, origin);

  const text = String(body?.text ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim();
  if (!text) return json({ ok: false, error: "Message is empty" }, 422, env, origin);
  if (text.length > CHAT_TEXT_MAX) {
    return json({ ok: false, error: `Message exceeds ${CHAT_TEXT_MAX} characters` }, 422, env, origin);
  }

  const deviceRaw = String(body?.device ?? "").slice(0, 64);
  if (!deviceRaw) return json({ ok: false, error: "Missing device id" }, 400, env, origin);
  const device = await hash(deviceRaw);

  // only the name's actual owner may speak as it — same registry as scores
  const owner = await usernameOwner(env, usernameKey(username));
  if (owner && owner !== device) {
    return json({ ok: false, error: "That username belongs to another player" }, 403, env, origin);
  }
  if (!owner) {
    await env.DB.prepare(`DELETE FROM usernames WHERE device = ?1`).bind(device).run();
    await env.DB.prepare(
      `INSERT INTO usernames (username_key, username, device, created_at) VALUES (?1,?2,?3,?4)`
    ).bind(usernameKey(username), username, device, Date.now()).run();
  }

  const now = Date.now();
  const since = now - CHAT_RATE_WINDOW_MS;
  const recent = await env.DB.prepare(
    `SELECT COUNT(*) AS n, MAX(created_at) AS last
       FROM chat_messages WHERE device = ?1 AND created_at > ?2`
  ).bind(device, since).first<{ n: number; last: number | null }>();

  if ((recent?.n ?? 0) >= CHAT_RATE_MAX_PER_WINDOW) {
    return json({ ok: false, error: "Slow down — you're sending messages too fast" }, 429, env, origin);
  }
  if (recent?.last && now - recent.last < CHAT_MIN_GAP_MS) {
    return json({ ok: false, error: "Sending too quickly" }, 429, env, origin);
  }

  const result = await env.DB.prepare(
    `INSERT INTO chat_messages (username, text, device, created_at) VALUES (?1,?2,?3,?4)`
  ).bind(username, text, device, now).run();

  return json(
    { ok: true, message: { id: result.meta.last_row_id, username, text, created_at: now } },
    200, env, origin
  );
}

async function handleSubmit(req: Request, env: Env, origin: string | null): Promise<Response> {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "Malformed JSON body" }, 400, env, origin);
  }

  const payload: ScorePayload = {
    username: String(body?.username ?? ""),
    score: Number(body?.score),
    kills: Number(body?.kills),
    wave: Number(body?.wave),
    accuracy: Number(body?.accuracy ?? 0),
    difficulty: String(body?.difficulty ?? "normal"),
    duration: Number(body?.duration ?? 0),
  };

  // ── 1. shape + plausibility (shared with the client) ──
  const v = validateScorePayload(payload);
  if (!v.ok) return json({ ok: false, error: v.reason }, 422, env, origin);

  if (!["easy", "normal", "hard"].includes(payload.difficulty)) {
    return json({ ok: false, error: "Unknown difficulty" }, 422, env, origin);
  }

  // ── 2. signature: raises the bar above blind curl posting ──
  const sig = String(body?.sig ?? "");
  if (!verifySignature(payload, sig, env.SIGNING_SALT)) {
    return json({ ok: false, error: "Signature mismatch" }, 403, env, origin);
  }

  // ── 3. rate limiting, per device and per IP ──
  const ip = req.headers.get("CF-Connecting-IP") ?? "0.0.0.0";
  const deviceRaw = String(body?.device ?? "").slice(0, 64) || ip;
  const device = await hash(deviceRaw);
  const ipHash = await hash(ip);
  const now = Date.now();
  const since = now - RATE_WINDOW_MS;

  // ── 3b. username ownership — a name belongs to whichever device
  // claimed it first; auto-claim on a device's first-ever submission
  // so runs never get silently rejected for a name nobody has yet ──
  const key = usernameKey(payload.username);
  const owner = await usernameOwner(env, key);
  if (owner && owner !== device) {
    return json({ ok: false, error: "That username belongs to another player" }, 403, env, origin);
  }
  if (!owner) {
    await env.DB.prepare(`DELETE FROM usernames WHERE device = ?1`).bind(device).run();
    await env.DB.prepare(
      `INSERT INTO usernames (username_key, username, device, created_at) VALUES (?1,?2,?3,?4)`
    ).bind(key, payload.username.trim(), device, now).run();
  }

  const recent = await env.DB.prepare(
    `SELECT COUNT(*) AS n, MAX(created_at) AS last
       FROM scores WHERE device = ?1 AND created_at > ?2`
  ).bind(device, since).first<{ n: number; last: number | null }>();

  if ((recent?.n ?? 0) >= RATE_MAX_PER_WINDOW) {
    return json({ ok: false, error: "Too many submissions — try again later" }, 429, env, origin);
  }
  if (recent?.last && now - recent.last < MIN_GAP_MS) {
    return json({ ok: false, error: "Submitting too quickly" }, 429, env, origin);
  }

  const ipRecent = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM scores WHERE ip = ?1 AND created_at > ?2`
  ).bind(ipHash, since).first<{ n: number }>();
  if ((ipRecent?.n ?? 0) >= IP_MAX_PER_WINDOW) {
    return json({ ok: false, error: "Too many submissions from this network" }, 429, env, origin);
  }

  // ── 4. store ──
  const month = monthKey(now);
  await env.DB.prepare(
    `INSERT INTO scores
       (username, username_key, score, kills, wave, accuracy, difficulty,
        duration, month, created_at, device, ip)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)`
  ).bind(
    payload.username.trim(), key, payload.score, payload.kills, payload.wave,
    Math.round(payload.accuracy), payload.difficulty, Math.round(payload.duration),
    month, now, device, ipHash
  ).run();

  // ── 5. report back where that run landed ──
  const rankRow = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM (
       SELECT username_key, MAX(score) AS s
         FROM scores WHERE month = ?1
        GROUP BY username_key
       HAVING s > ?2
     )`
  ).bind(month, payload.score).first<{ n: number }>();

  const bestRow = await env.DB.prepare(
    `SELECT MAX(score) AS s FROM scores WHERE month = ?1 AND username_key = ?2`
  ).bind(month, key).first<{ s: number }>();

  return json({
    ok: true,
    month,
    rank: (rankRow?.n ?? 0) + 1,
    personalBest: bestRow?.s ?? payload.score,
    isPersonalBest: (bestRow?.s ?? 0) <= payload.score,
  }, 200, env, origin);
}

// ── entry point ─────────────────────────────────────────────

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const origin = req.headers.get("Origin");
    const url = new URL(req.url);

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(env, origin) });
    }

    try {
      if (url.pathname === "/api/health") {
        return json({ ok: true, service: "shadowstrike-leaderboard", month: monthKey() }, 200, env, origin);
      }
      if (url.pathname === "/api/leaderboard" && req.method === "GET") {
        return await handleLeaderboard(req, env, origin);
      }
      if (url.pathname === "/api/score" && req.method === "POST") {
        return await handleSubmit(req, env, origin);
      }
      if (url.pathname === "/api/validate-name" && req.method === "GET") {
        return await handleValidateName(req, env, origin);
      }
      if (url.pathname === "/api/username/claim" && req.method === "POST") {
        return await handleClaimUsername(req, env, origin);
      }
      if (url.pathname === "/api/chat" && req.method === "GET") {
        return await handleChatGet(req, env, origin);
      }
      if (url.pathname === "/api/chat" && req.method === "POST") {
        return await handleChatPost(req, env, origin);
      }
      return json({ ok: false, error: "Not found" }, 404, env, origin);
    } catch (err: any) {
      // never leak internals to the client
      console.error("worker error", err?.stack ?? err);
      return json({ ok: false, error: "Internal error" }, 500, env, origin);
    }
  },
};
