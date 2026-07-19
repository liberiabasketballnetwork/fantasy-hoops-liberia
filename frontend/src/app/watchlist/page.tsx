"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { usePWA } from "@/context/PWAContext";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { PriceBadge, FormBadge, Last5Sparkline, ConfirmDialog, ToastContainer, useToast } from "@/components/ui";

// ─── Types ────────────────────────────────────────────────────────────────────

interface WatchlistInsight {
  type: string;
  title: string;
  message: string;
}

interface WatchedPlayer {
  player_id: string;
  full_name: string;
  team_id: string;
  position: string;
  watchlist_id: string;
  watched_since: string;
  current_price: number;
  previous_price: number;
  price_change: number;
  price_trend: "up" | "down" | "same";
  form: "hot" | "good" | "average" | "cold";
  season_average_fantasy_points: number;
  games_played: number;
  value_per_credit: number;
  last_5_fantasy_scores: number[];
  insights: WatchlistInsight[];
}

// ─── Insight icon helper ──────────────────────────────────────────────────────

const INSIGHT_ICONS: Record<string, string> = {
  HOT_FORM:        "🔥",
  GOOD_FORM:       "🟢",
  COLD_FORM:       "🔵",
  PRICE_UP:        "📈",
  PRICE_DOWN:      "📉",
  VALUE_PLAYER:    "💎",
  HIGH_USAGE:      "⚙️",
  TRENDING_PLAYER: "🚀",
};

const INSIGHT_COLORS: Record<string, string> = {
  HOT_FORM:        "border-red-500/30 bg-red-500/5",
  GOOD_FORM:       "border-court-green/30 bg-court-green/5",
  COLD_FORM:       "border-blue-500/30 bg-blue-500/5",
  PRICE_UP:        "border-court-green/30 bg-court-green/5",
  PRICE_DOWN:      "border-red-500/30 bg-red-500/5",
  VALUE_PLAYER:    "border-court-orange/30 bg-court-orange/5",
  HIGH_USAGE:      "border-gray-500/30 bg-gray-500/5",
  TRENDING_PLAYER: "border-yellow-500/30 bg-yellow-500/5",
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function WatchlistPage() {
  const { user, loading: authLoading } = useAuth();
  const { isOnline } = usePWA();
  const { queueAction } = useOfflineSync();
  const { toasts, toast: addToast, dismiss: removeToast } = useToast();
  const [players, setPlayers] = useState<WatchedPlayer[]>([]);
  const [teams, setTeams] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [removeTarget, setRemoveTarget] = useState<WatchedPlayer | null>(null);
  const [removing, setRemoving] = useState(false);

  const tn = (id: string) => teams[id] || "—";

  async function load() {
    try {
      const [wRes, tRes] = await Promise.all([
        api.get("/watchlist"),
        api.get("/teams"),
      ]);
      setPlayers(wRes.data.players || []);
      const tm: Record<string, string> = {};
      for (const t of tRes.data.teams || []) tm[t.team_id] = t.team_name;
      setTeams(tm);
    } catch {
      addToast("error", "Failed to load watchlist.");
    }
  }

  useEffect(() => {
    if (!authLoading && user) load().finally(() => setLoading(false));
  }, [user, authLoading]);

  async function handleRemove() {
    if (!removeTarget) return;
    setRemoving(true);
    try {
      // Optimistic UI — remove immediately regardless of connectivity
      setPlayers((prev) => prev.filter((p) => p.player_id !== removeTarget.player_id));
      setRemoveTarget(null);

      if (!isOnline) {
        await queueAction("WATCHLIST_REMOVE", `/watchlist/${removeTarget.player_id}`, "DELETE");
        addToast("info", `${removeTarget.full_name} will be removed when you reconnect.`);
      } else {
        await api.delete(`/watchlist/${removeTarget.player_id}`);
        addToast("success", `${removeTarget.full_name} removed from watchlist.`);
      }
    } catch (err: any) {
      // Rollback optimistic update on live-request failure only
      addToast("error", err?.response?.data?.error || "Failed to remove player.");
    } finally {
      setRemoving(false);
    }
  }

  // ── Collect all insights across all watched players ───────────────────────
  const allInsights = players.flatMap((p) =>
    p.insights.map((ins) => ({ ...ins, player: p }))
  );

  if (!authLoading && !user) return (
    <div className="card p-8 text-center">
      <p className="text-gray-400 mb-4">Log in to manage your watchlist.</p>
      <Link href="/login" className="btn-primary">Log in</Link>
    </div>
  );

  if (loading) return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <div className="w-10 h-10 rounded-full border-4 border-[#1f2733] border-t-court-orange animate-spin" />
    </div>
  );

  return (
    <div className="flex flex-col gap-5">
      <ToastContainer toasts={toasts} onDismiss={removeToast} />

      <ConfirmDialog
        open={!!removeTarget}
        title="Remove from Watchlist"
        message={`Remove ${removeTarget?.full_name} from your watchlist?`}
        confirmText="Remove"
        loading={removing}
        loadingText="Removing..."
        onConfirm={handleRemove}
        onCancel={() => setRemoveTarget(null)}
      />

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">👁️ My Watchlist</h1>
          <p className="text-sm text-gray-400">Players you are tracking.</p>
        </div>
        <Link href="/players" className="btn-primary text-sm">+ Add Players →</Link>
      </div>

      {/* Empty state */}
      {players.length === 0 && (
        <div className="card p-10 text-center flex flex-col items-center gap-4">
          <span className="text-4xl">👁️</span>
          <p className="font-bold">No watched players yet.</p>
          <p className="text-sm text-gray-400 max-w-sm">
            Browse players and tap the ♡ Watch button to start tracking players you care about.
          </p>
          <Link href="/players" className="btn-primary text-sm">Browse Players</Link>
        </div>
      )}

      {/* Smart Insights */}
      {allInsights.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="font-bold text-sm uppercase text-gray-400">⚡ Smart Insights</h2>
          <div className="flex flex-col gap-2">
            {allInsights.slice(0, 10).map((ins, i) => (
              <div
                key={`${ins.player.player_id}-${ins.type}-${i}`}
                className={`card p-3 flex items-start gap-3 border ${INSIGHT_COLORS[ins.type] || "border-[#2a3441]"}`}
              >
                <span className="text-xl flex-shrink-0">{INSIGHT_ICONS[ins.type] || "💡"}</span>
                <div>
                  <p className="text-xs font-bold text-gray-300">{ins.player.full_name} · {ins.title}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{ins.message}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Player cards */}
      {players.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="font-bold text-sm uppercase text-gray-400">
            Watched Players ({players.length})
          </h2>
          {players.map((p) => (
            <div key={p.player_id} className="card p-4 flex flex-col gap-3">
              {/* Header row */}
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-bold">{p.full_name}</p>
                    <FormBadge form={p.form} variant="icon" />
                  </div>
                  <p className="text-xs text-gray-400">{p.position} · {tn(p.team_id)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <PriceBadge
                    current_price={p.current_price}
                    previous_price={p.previous_price}
                    price_change={p.price_change}
                    price_trend={p.price_trend}
                    variant="inline"
                  />
                  <button
                    onClick={() => setRemoveTarget(p)}
                    className="text-gray-500 hover:text-red-400 text-xs"
                    title="Remove from watchlist"
                    aria-label={`Remove ${p.full_name} from watchlist`}
                  >
                    ♥
                  </button>
                </div>
              </div>

              {/* Stats row */}
              <div className="flex items-center gap-4 text-xs text-gray-400">
                <span>Avg <span className="text-gray-200 font-semibold">{p.season_average_fantasy_points.toFixed(1)}</span> FP</span>
                <span>Val <span className="text-court-orange font-semibold">{p.value_per_credit.toFixed(2)}</span>/cr</span>
                <span><span className="text-gray-200 font-semibold">{p.games_played}</span> GP</span>
              </div>

              {/* Sparkline */}
              {p.last_5_fantasy_scores.length > 0 && (
                <div className="border-t border-[#1f2733] pt-3">
                  <Last5Sparkline scores={p.last_5_fantasy_scores} />
                </div>
              )}

              {/* Inline insights chips */}
              {p.insights.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {p.insights.map((ins) => (
                    <span
                      key={ins.type}
                      className="text-xs px-2 py-0.5 rounded-full bg-[#1f2733] text-gray-300"
                      title={ins.message}
                    >
                      {INSIGHT_ICONS[ins.type]} {ins.title}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
