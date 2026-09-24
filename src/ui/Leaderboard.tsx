// ─────────────────────────────────────────────────────────────
//  LEADERBOARD SCREEN
//
//  Monthly global ranking with explicit loading / empty / error /
//  offline states — the menu must never break because a network
//  request failed.
// ─────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { audio } from "../game/audio";
import { getProfile } from "../net/profile";
import {
  fetchLeaderboard, flushPending, pendingCount, HAS_BACKEND,
  type LeaderboardData,
} from "../net/leaderboard";
import { fetchChat, sendChat, CHAT_AVAILABLE, CHAT_TEXT_MAX, type ChatMessage } from "../net/chat";
import { monthKey, monthLabel, msUntilMonthEnd, usernameKey } from "../net/scoreRules";
import {
  ChevronLeft, Trophy, RefreshCw, WifiOff, AlertTriangle,
  Crown, Medal, Clock, Users, UserPlus, MessageSquare, Send, Loader2,
} from "lucide-react";

function countdown(ms: number): string {
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

const rankStyle = (rank: number) =>
  rank === 1 ? "text-[#ffd76a]"
    : rank === 2 ? "text-[#d6dde5]"
      : rank === 3 ? "text-[#d9925a]"
        : "text-[#7c8ea1]";

export default function Leaderboard({
  onBack,
  onSetName,
}: {
  onBack: () => void;
  onSetName: () => void;
}) {
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [month] = useState(monthKey());
  const [left, setLeft] = useState(msUntilMonthEnd());
  const [queued, setQueued] = useState(pendingCount());
  const [tab, setTab] = useState<"ranking" | "chat">("ranking");

  const profile = getProfile();
  const myKey = usernameKey(profile.username);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    // opportunistically drain any runs stranded by an outage
    if (HAS_BACKEND) {
      try { await flushPending(); } catch { /* non-fatal */ }
    }
    const res = await fetchLeaderboard(month, 50);
    setData(res.data);
    setError(res.error);
    setQueued(pendingCount());
    setLoading(false);
  }, [month]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const t = window.setInterval(() => setLeft(msUntilMonthEnd()), 30000);
    return () => window.clearInterval(t);
  }, []);

  const entries = data?.entries ?? [];
  const youInList = entries.some((e) => usernameKey(e.username) === myKey);

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-[#05070b]">
      <div className="menu-grid pointer-events-none opacity-40" />

      {/* ── header ── */}
      <div className="relative flex shrink-0 flex-wrap items-center gap-3 border-b border-[#1e2831] px-5 py-3">
        <button
          type="button"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); audio.uiClick(); onBack(); }}
          onMouseEnter={() => audio.uiHover()}
          className="btn-tac clip-btn flex items-center gap-2 px-4 py-2 text-xs"
        >
          <ChevronLeft size={15} /> BACK
        </button>
        <div className="flex items-center gap-2">
          <Trophy size={16} className="text-[#e8b545]" />
          <h2 className="font-display text-xl tracking-[0.15em] text-white">LEADERBOARD</h2>
        </div>
        <span className="clip-btn border border-[#2c3641] bg-[#0b1016] px-2.5 py-1 text-[10px] tracking-[0.2em] text-[#9fb0c2]">
          {monthLabel(month).toUpperCase()}
        </span>

        <div className="ml-auto flex items-center gap-3">
          <span className="hidden items-center gap-1.5 text-[10px] tracking-[0.15em] text-[#647489] sm:flex">
            <Clock size={11} /> RESETS IN {countdown(left)}
          </span>
          <button
            type="button"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); audio.uiClick(); void load(); }}
            onMouseEnter={() => audio.uiHover()}
            className="clip-btn border border-[#2c3641] bg-[#0b1016] p-2 text-[#8fa8bf] transition-colors hover:text-[#e8b545]"
            title="Refresh"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* ── tabs ── */}
      <div className="relative flex shrink-0 gap-2 border-b border-[#1e2831] px-5 pt-2">
        <button
          type="button"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); audio.uiClick(); setTab("ranking"); }}
          onMouseEnter={() => audio.uiHover()}
          className={`flex items-center gap-1.5 border-b-2 px-3 pb-2 text-[11px] tracking-[0.15em] transition-colors ${
            tab === "ranking" ? "border-[#e8b545] text-white" : "border-transparent text-[#647489] hover:text-[#9fb0c2]"
          }`}
        >
          <Trophy size={12} /> RANKING
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); audio.uiClick(); setTab("chat"); }}
          onMouseEnter={() => audio.uiHover()}
          className={`flex items-center gap-1.5 border-b-2 px-3 pb-2 text-[11px] tracking-[0.15em] transition-colors ${
            tab === "chat" ? "border-[#e8b545] text-white" : "border-transparent text-[#647489] hover:text-[#9fb0c2]"
          }`}
        >
          <MessageSquare size={12} /> CHAT
        </button>
      </div>

      {tab === "chat" ? (
        <ChatPanel />
      ) : (
        <>
      {/* ── status strip ── */}
      {(!HAS_BACKEND || data?.local || error || queued > 0) && (
        <div className="relative shrink-0 border-b border-[#1e2831] px-5 py-2">
          {!HAS_BACKEND ? (
            <div className="flex items-center gap-2 text-[10px] tracking-[0.12em] text-[#8fa8bf]">
              <WifiOff size={12} className="text-[#e8b545]" />
              OFFLINE MODE — showing this device's scores. Global ranking needs a
              leaderboard server (see <span className="font-mono2 text-[#9fb0c2]">server/README.md</span>).
            </div>
          ) : error ? (
            <div className="flex items-center gap-2 text-[10px] tracking-[0.12em] text-[#ffb0a6]">
              <AlertTriangle size={12} />
              {error} {data?.local && "Showing this device's scores instead."}
            </div>
          ) : queued > 0 ? (
            <div className="flex items-center gap-2 text-[10px] tracking-[0.12em] text-[#9fb0c2]">
              <Clock size={12} className="text-[#e8b545]" />
              {queued} score{queued === 1 ? "" : "s"} waiting to upload — will retry automatically.
            </div>
          ) : null}
        </div>
      )}

      {/* ── body ── */}
      <div className="relative min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {loading && !data ? (
          <div className="space-y-1.5">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="h-11 animate-pulse rounded-sm bg-[#0d1319]"
                style={{ animationDelay: `${i * 70}ms` }}
              />
            ))}
            <div className="pt-3 text-center text-[10px] tracking-[0.3em] text-[#647489]">
              LOADING RANKINGS…
            </div>
          </div>
        ) : error && !data ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <AlertTriangle size={26} className="text-[#ff7a6a]" />
            <div className="font-display text-base tracking-[0.1em] text-white">
              COULDN'T LOAD THE LEADERBOARD
            </div>
            <div className="max-w-sm text-[11px] leading-relaxed text-[#8fa8bf]">{error}</div>
            <div className="text-[10px] text-[#647489]">
              Your scores are saved on this device and will upload automatically.
            </div>
            <button
              type="button"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); audio.uiClick(); void load(); }}
              className="btn-tac clip-btn mt-1 flex items-center gap-2 px-5 py-2.5 text-xs"
            >
              <RefreshCw size={13} /> TRY AGAIN
            </button>
          </div>
        ) : entries.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <Trophy size={26} className="text-[#e8b545]" />
            <div className="font-display text-base tracking-[0.1em] text-white">
              NO SCORES THIS MONTH YET
            </div>
            <div className="max-w-sm text-[11px] leading-relaxed text-[#8fa8bf]">
              The board resets every month. Finish a run to claim the top spot.
            </div>
          </div>
        ) : (
          <>
            {/* column headings */}
            <div className="mb-1 grid grid-cols-[46px_1fr_auto] items-center gap-2 px-3 text-[9px] tracking-[0.22em] text-[#4b5a6b] sm:grid-cols-[46px_1fr_70px_60px_66px]">
              <span>RANK</span>
              <span>OPERATOR</span>
              <span className="hidden text-right sm:block">KILLS</span>
              <span className="hidden text-right sm:block">WAVE</span>
              <span className="text-right">SCORE</span>
            </div>

            <div className="space-y-1">
              {entries.map((e) => {
                const mine = usernameKey(e.username) === myKey && !!profile.username;
                return (
                  <div
                    key={`${e.rank}-${e.username}`}
                    className={`clip-btn grid grid-cols-[46px_1fr_auto] items-center gap-2 border px-3 py-2 transition-colors sm:grid-cols-[46px_1fr_70px_60px_66px] ${
                      mine
                        ? "border-[#e8b545] bg-[#1d1708]"
                        : e.rank <= 3
                          ? "border-[#2c3641] bg-[#0e141b]"
                          : "border-[#1a222b] bg-[#0a0f14]"
                    }`}
                  >
                    <span className={`font-mono2 flex items-center gap-1 text-sm ${rankStyle(e.rank)}`}>
                      {e.rank === 1 ? <Crown size={13} /> : e.rank <= 3 ? <Medal size={12} /> : null}
                      {e.rank}
                    </span>
                    <span className="min-w-0 truncate text-[12px] font-semibold text-white">
                      {e.username}
                      {mine && (
                        <span className="ml-2 text-[9px] tracking-[0.2em] text-[#e8b545]">YOU</span>
                      )}
                    </span>
                    <span className="font-mono2 hidden text-right text-[11px] text-[#9fb0c2] sm:block">
                      {e.kills}
                    </span>
                    <span className="font-mono2 hidden text-right text-[11px] text-[#9fb0c2] sm:block">
                      {e.wave}
                    </span>
                    <span className="font-mono2 text-right text-[13px] text-[#e8b545]">
                      {e.score.toLocaleString()}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* the player's own standing when they're off the visible page */}
            {data?.you && !youInList && (
              <>
                <div className="my-2 text-center text-[10px] tracking-[0.3em] text-[#4b5a6b]">· · ·</div>
                <div className="clip-btn grid grid-cols-[46px_1fr_auto] items-center gap-2 border border-[#e8b545] bg-[#1d1708] px-3 py-2 sm:grid-cols-[46px_1fr_70px_60px_66px]">
                  <span className="font-mono2 text-sm text-[#e8b545]">{data.you.rank}</span>
                  <span className="truncate text-[12px] font-semibold text-white">
                    {data.you.username}
                    <span className="ml-2 text-[9px] tracking-[0.2em] text-[#e8b545]">YOU</span>
                  </span>
                  <span className="font-mono2 hidden text-right text-[11px] text-[#9fb0c2] sm:block">
                    {data.you.kills}
                  </span>
                  <span className="font-mono2 hidden text-right text-[11px] text-[#9fb0c2] sm:block">
                    {data.you.wave}
                  </span>
                  <span className="font-mono2 text-right text-[13px] text-[#e8b545]">
                    {data.you.score.toLocaleString()}
                  </span>
                </div>
              </>
            )}
          </>
        )}
      </div>
      </>
      )}

      {/* ── footer ── */}
      <div className="relative flex shrink-0 flex-wrap items-center gap-3 border-t border-[#1e2831] px-5 py-2.5">
        <span className="flex items-center gap-1.5 text-[10px] tracking-[0.15em] text-[#647489]">
          <Users size={11} /> {data?.totalPlayers ?? 0} COMPETING
        </span>
        {profile.username ? (
          <span className="text-[10px] tracking-[0.15em] text-[#8fa8bf]">
            PLAYING AS <span className="text-[#e8b545]">{profile.username}</span>
          </span>
        ) : (
          <span className="text-[10px] tracking-[0.15em] text-[#ffb0a6]">NO CALLSIGN SET</span>
        )}
        <button
          type="button"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); audio.uiClick(); onSetName(); }}
          onMouseEnter={() => audio.uiHover()}
          className="btn-tac clip-btn ml-auto flex items-center gap-2 px-4 py-2 text-[10px]"
        >
          <UserPlus size={12} /> {profile.username ? "CHANGE NAME" : "SET NAME"}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
//  CHAT PANEL — polling chat scoped to the leaderboard screen.
//  Only the claimed owner of a username can speak as it (enforced
//  server-side); here we just need a callsign set to send.
// ─────────────────────────────────────────────────────────────

const CHAT_POLL_MS = 3000;

function timeAgo(ms: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (s < 5) return "now";
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function ChatPanel() {
  const profile = getProfile();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<number | null>(null);

  const poll = useCallback(async (initial: boolean) => {
    const res = await fetchChat(initial ? 0 : (messages[messages.length - 1]?.created_at ?? 0));
    if (res.error && initial) setError(res.error);
    else setError(null);
    if (res.messages.length) {
      setMessages((prev) => {
        const seen = new Set(prev.map((m) => m.id));
        const merged = [...prev, ...res.messages.filter((m) => !seen.has(m.id))];
        return merged.slice(-200);
      });
    }
    if (initial) setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  useEffect(() => {
    void poll(true);
    pollRef.current = window.setInterval(() => void poll(false), CHAT_POLL_MS);
    return () => { if (pollRef.current) window.clearInterval(pollRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    const res = await sendChat(text);
    setSending(false);
    if (res.ok) {
      setDraft("");
      void poll(false);
    } else {
      setError(res.error ?? "Couldn't send that message");
    }
  };

  const myKey = usernameKey(profile.username);

  if (!CHAT_AVAILABLE) {
    return (
      <div className="relative flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <WifiOff size={26} className="text-[#e8b545]" />
        <div className="font-display text-base tracking-[0.1em] text-white">CHAT UNAVAILABLE</div>
        <div className="max-w-sm text-[11px] leading-relaxed text-[#8fa8bf]">
          Chat needs a leaderboard server (see{" "}
          <span className="font-mono2 text-[#9fb0c2]">server/README.md</span>). Offline mode has
          no shared place for messages to live.
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-9 animate-pulse rounded-sm bg-[#0d1319]"
                style={{ animationDelay: `${i * 70}ms`, width: `${60 + (i % 3) * 12}%` }}
              />
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <MessageSquare size={24} className="text-[#e8b545]" />
            <div className="text-[11px] text-[#8fa8bf]">No messages yet — say hi.</div>
          </div>
        ) : (
          <div className="space-y-1.5">
            {messages.map((m) => {
              const mine = usernameKey(m.username) === myKey && !!profile.username;
              return (
                <div key={m.id} className={`flex gap-2 text-[12px] ${mine ? "justify-end" : ""}`}>
                  <div
                    className={`clip-btn max-w-[80%] border px-2.5 py-1.5 ${
                      mine ? "border-[#e8b545]/50 bg-[#1d1708]" : "border-[#1a222b] bg-[#0a0f14]"
                    }`}
                  >
                    <div className="mb-0.5 flex items-center gap-1.5">
                      <span className={`text-[10px] font-semibold ${mine ? "text-[#e8b545]" : "text-[#9fb0c2]"}`}>
                        {m.username}
                      </span>
                      <span className="text-[9px] text-[#4b5a6b]">{timeAgo(m.created_at)}</span>
                    </div>
                    <div className="whitespace-pre-wrap break-words text-white">{m.text}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {error && (
        <div className="shrink-0 border-t border-[#1e2831] px-4 py-1.5 text-[10px] tracking-[0.1em] text-[#ffb0a6]">
          {error}
        </div>
      )}

      <div className="flex shrink-0 items-center gap-2 border-t border-[#1e2831] px-4 py-2.5">
        {profile.username ? (
          <>
            <input
              value={draft}
              maxLength={CHAT_TEXT_MAX}
              onChange={(e) => setDraft(e.target.value)}
              onMouseDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); }
              }}
              placeholder="Message the lobby…"
              className="font-mono2 min-w-0 flex-1 border border-[#2c3641] bg-[#0b1016] px-3 py-2 text-[12px] text-white outline-none focus:border-[#e8b545]"
            />
            <button
              type="button"
              disabled={!draft.trim() || sending}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); void send(); }}
              onMouseEnter={() => audio.uiHover()}
              className={`btn-tac clip-btn flex items-center gap-1.5 px-4 py-2 text-[11px] ${
                !draft.trim() || sending ? "cursor-not-allowed opacity-40" : ""
              }`}
            >
              {sending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
            </button>
          </>
        ) : (
          <div className="w-full text-center text-[11px] text-[#8fa8bf]">
            Set a callsign (below) before you can chat.
          </div>
        )}
      </div>
    </div>
  );
}
