# Shadow Strike — Leaderboard Backend

A Cloudflare Worker + D1 database that receives score submissions and
serves a **monthly** global ranking.

The game works fine without it: with no endpoint configured the
leaderboard runs in **offline mode**, storing runs in `localStorage`
and showing this device's own scores. Deploying the Worker upgrades
that to a global board.

---

## Why D1 rather than KV

A leaderboard is fundamentally a *"top N ordered by score"* query.

* With **KV** you would have to list and sort every key on each
  request, or hand-maintain a denormalised sorted blob (which races
  under concurrent writes).
* With **D1** it is one indexed SQL statement, history is retained for
  free, and monthly filtering is a `WHERE month = ?`.

Both are cheap; D1 is the better fit and simpler to get right here.

---

## Deploy

```bash
cd server
npm install -g wrangler        # or: npx wrangler …
wrangler login

# 1. create the database
wrangler d1 create shadowstrike-scores
#    → copy the printed database_id into wrangler.toml

# 2. create the schema (remote)
wrangler d1 execute shadowstrike-scores --remote --file=./migrations/0001_init.sql

# 3. ship it
wrangler deploy
```

Wrangler prints a URL such as
`https://shadowstrike-leaderboard.<you>.workers.dev`.

### Point the game at it

Build the client with the endpoint baked in:

```bash
VITE_LEADERBOARD_URL=https://shadowstrike-leaderboard.<you>.workers.dev npm run build
```

or create a `.env` file in the project root:

```
VITE_LEADERBOARD_URL=https://shadowstrike-leaderboard.<you>.workers.dev
```

### Lock down CORS (recommended)

In `wrangler.toml`:

```toml
[vars]
ALLOWED_ORIGINS = "https://yourgame.example.com"
```

### Optional: private signing salt

```bash
wrangler secret put SIGNING_SALT
```

The client's salt must match, so rebuild with the same value if you
change it. (See the note on signatures below.)

---

## Local development

```bash
cd server
wrangler d1 execute shadowstrike-scores --local --file=./migrations/0001_init.sql
wrangler dev
# → http://127.0.0.1:8787
```

Then build the game with `VITE_LEADERBOARD_URL=http://127.0.0.1:8787`.

---

## API

### `GET /api/health`
```json
{ "ok": true, "service": "shadowstrike-leaderboard", "month": "2026-09" }
```

### `GET /api/leaderboard?month=YYYY-MM&limit=50&user=NAME`
`month` defaults to the current UTC month, `limit` caps at 100.
Returns each player's **best run** for that month, ranked.

```json
{
  "ok": true,
  "month": "2026-09",
  "entries": [
    { "rank": 1, "username": "Nomad", "score": 31500,
      "kills": 160, "wave": 18, "accuracy": 62,
      "difficulty": "hard", "at": 1789804293342 }
  ],
  "you": { "rank": 13, "username": "Ghost", "score": 7000,
           "kills": 40, "wave": 7, "accuracy": 41 },
  "totalPlayers": 17,
  "serverTime": 1789804293999
}
```

`you` is returned even when the player falls outside the requested
page, so the UI can always show their standing.

### `POST /api/score`
```json
{
  "username": "Ghost", "score": 18400, "kills": 96, "wave": 12,
  "accuracy": 54, "difficulty": "normal", "duration": 612,
  "device": "<opaque id>", "sig": "<checksum>"
}
```
Responses: `200` accepted · `422` implausible · `403` bad signature ·
`429` rate-limited · `400` malformed JSON.

---

## Monthly reset

Every row stores `month` (`YYYY-MM`, **UTC** so all players share one
boundary) alongside a full timestamp. The board simply filters on the
current month, so rankings reset automatically at the start of each
month while **all historical rows are retained** — pass `?month=` to
query any past month.

---

## Anti-abuse

Layered, and deliberately "reasonable rather than bulletproof" — a
determined attacker with the bundle can still forge a submission.

1. **Plausibility** — `src/net/scoreRules.ts` is imported by *both*
   the client and the Worker, so the checks can never drift apart. It
   derives real limits from the game's own tuning:
   * `kills` cannot exceed the enemies that can spawn by that wave;
   * `score` cannot exceed `kills × 250 + Σ wave bonuses` (+15% headroom);
   * `score` cannot fall below `kills × 100` (the cheapest enemy);
   * a run cannot reach wave *N* faster than physically possible.
2. **Signature** — each payload carries a checksum over its fields.
   A browser can't hold a real secret, so this only means a cheater
   must read the bundle rather than blind-`curl` the endpoint. It does
   catch payloads edited in flight, including *plausible* ones.
3. **Rate limits** — per hashed device and per hashed IP:
   30 submissions/device/hour, 120/IP/hour, and a 20-second minimum
   gap between submissions.
4. **Privacy** — device ids and IPs are stored only as truncated
   SHA-256 hashes, purely for rate limiting.

To harden further you would move scoring server-side or sign runs with
a server-issued session token; both are beyond "basic safeguards".

---

## Cost

Comfortably inside Cloudflare's free tier for a small game:
100k Worker requests/day and 5M D1 row reads/day. Each board view is
~3 indexed queries; each submission is ~4.
