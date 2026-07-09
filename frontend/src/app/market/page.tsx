"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { PriceBadge, FormBadge } from "@/components/ui";

// ─── Types ─────────────────────────────────────────────────────────────────

interface MarketPlayer {
  player_id: string;
  full_name: string;
  team_id: string;
  position: string;
  current_price: number;
  previous_price: number;
  price_change: number;
  price_trend: "up" | "down" | "same";
  season_average_fantasy_points: number;
  games_played: number;
  last_5_average: number;
  prev_5_average: number;
  value_per_credit: number;
  form: "hot" | "good" | "average" | "cold";
}

interface MarketData {
  trending: MarketPlayer[];
  risers: MarketPlayer[];
  fallers: MarketPlayer[];
  best_value: MarketPlayer[];
  hidden_gems: MarketPlayer[];
  form_watch: MarketPlayer[];
}

// ─── Section wrapper ────────────────────────────────────────────────────────

function Section({
  title,
  count,
  defaultOpen = true,
  children,
}: {
  title: string;
  count: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card overflow-hidden">
      <button
        className="w-full flex items-center justify-between p-4 hover:bg-[#1a2230] transition-colors"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <div className="flex items-center gap-2">
          <span className="font-bold text-base">{title}</span>
          {count > 0 && (
            <span className="text-xs text-gray-400 bg-[#0b0f14] px-2 py-0.5 rounded-full">
              {count}
            </span>
          )}
        </div>
        <span className="text-gray-400 text-sm">{open ? "▲" : "▼"}</span>
      </button>
      {open && <div className="border-t border-[#1f2733]">{children}</div>}
    </div>
  );
}

// ─── Empty state ─────────────────────────────────────────────────────────────

function EmptyState({ message }: { message: string }) {
  return (
    <div className="p-6 text-center text-sm text-gray-500">{message}</div>
  );
}

// ─── Change badge for risers/fallers ─────────────────────────────────────────

function ChangeBadge({ change }: { change: number }) {
  const positive = change > 0;
  return (
    <span
      className={`text-xs font-bold px-2 py-0.5 rounded-full ${
        positive
          ? "bg-court-green/15 text-court-green"
          : "bg-red-500/15 text-red-400"
      }`}
    >
      {positive ? "▲" : "▼"} {positive ? "+" : ""}{change} cr
    </span>
  );
}

// ─── Improvement badge for form watch ────────────────────────────────────────

function ImprovementBadge({ diff }: { diff: number }) {
  return (
    <span className="text-xs font-bold text-court-green bg-court-green/10 px-2 py-0.5 rounded-full">
      ▲ +{diff.toFixed(1)} avg
    </span>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function MarketPage() {
  const [data, setData] = useState<MarketData | null>(null);
  const [teams, setTeams] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([api.get("/market"), api.get("/teams")])
      .then(([marketRes, teamsRes]) => {
        setData(marketRes.data);
        const teamMap: Record<string, string> = {};
        for (const t of teamsRes.data.teams || []) {
          teamMap[t.team_id] = t.team_name;
        }
        setTeams(teamMap);
      })
      .catch(() => setError("Failed to load market data. Please try again."))
      .finally(() => setLoading(false));
  }, []);

  const tn = (teamId: string) => teams[teamId] || "—";

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[30vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full border-4 border-[#1f2733] border-t-court-orange animate-spin" />
          <p className="text-sm text-gray-400">Loading market data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card p-6 text-center text-red-400 text-sm">{error}</div>
    );
  }

  if (!data) return null;

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">📊 Fantasy Market</h1>
          <p className="text-sm text-gray-400">
            Player intelligence to sharpen your decisions.
          </p>
        </div>
        <Link href="/players" className="btn-primary text-sm">
          Pick Players →
        </Link>
      </div>

      <p className="text-xs text-gray-500">
        Player prices update after every completed gameweek based on fantasy performance.
      </p>

      {/* ── Section 1: Trending ───────────────────────────────────────── */}
      <Section title="🔥 Trending Players" count={data.trending.length}>
        {data.trending.length === 0 ? (
          <EmptyState message="No players on HOT form right now. Check back after the next gameweek." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#0b0f14] text-gray-400">
                <tr>
                  <th className="text-left p-3">Player</th>
                  <th className="text-left p-3 hidden sm:table-cell">Team</th>
                  <th className="text-right p-3">Price</th>
                  <th className="text-right p-3 hidden sm:table-cell">Avg</th>
                  <th className="text-right p-3">Val/cr</th>
                </tr>
              </thead>
              <tbody>
                {data.trending.map((p) => (
                  <tr key={p.player_id} className="border-t border-[#1f2733]">
                    <td className="p-3">
                      <div className="font-medium">{p.full_name}</div>
                      <div className="flex items-center gap-1 mt-0.5">
                        <FormBadge form={p.form} variant="pill" />
                      </div>
                    </td>
                    <td className="p-3 text-gray-400 hidden sm:table-cell">{tn(p.team_id)}</td>
                    <td className="p-3 text-right">
                      <PriceBadge
                        current_price={p.current_price}
                        previous_price={p.previous_price}
                        price_change={p.price_change}
                        price_trend={p.price_trend}
                        variant="inline"
                      />
                    </td>
                    <td className="p-3 text-right text-gray-300 hidden sm:table-cell">
                      {p.season_average_fantasy_points.toFixed(1)}
                    </td>
                    <td className="p-3 text-right font-semibold text-court-orange">
                      {p.value_per_credit.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* ── Section 2: Biggest Risers ──────────────────────────────────── */}
      <Section title="📈 Biggest Price Risers" count={data.risers.length}>
        {data.risers.length === 0 ? (
          <EmptyState message="No price increases recorded this gameweek yet." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#0b0f14] text-gray-400">
                <tr>
                  <th className="text-left p-3">Player</th>
                  <th className="text-right p-3">Was</th>
                  <th className="text-right p-3">Now</th>
                  <th className="text-right p-3">Change</th>
                </tr>
              </thead>
              <tbody>
                {data.risers.map((p) => (
                  <tr key={p.player_id} className="border-t border-[#1f2733]">
                    <td className="p-3">
                      <div className="font-medium">{p.full_name}</div>
                      <div className="text-xs text-gray-400">{tn(p.team_id)}</div>
                    </td>
                    <td className="p-3 text-right text-gray-400">{p.previous_price} cr</td>
                    <td className="p-3 text-right font-semibold">{p.current_price} cr</td>
                    <td className="p-3 text-right">
                      <ChangeBadge change={p.price_change} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* ── Section 3: Biggest Fallers ──────────────────────────────────── */}
      <Section title="📉 Biggest Price Fallers" count={data.fallers.length}>
        {data.fallers.length === 0 ? (
          <EmptyState message="No price drops recorded this gameweek yet." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#0b0f14] text-gray-400">
                <tr>
                  <th className="text-left p-3">Player</th>
                  <th className="text-right p-3">Was</th>
                  <th className="text-right p-3">Now</th>
                  <th className="text-right p-3">Change</th>
                </tr>
              </thead>
              <tbody>
                {data.fallers.map((p) => (
                  <tr key={p.player_id} className="border-t border-[#1f2733]">
                    <td className="p-3">
                      <div className="font-medium">{p.full_name}</div>
                      <div className="text-xs text-gray-400">{tn(p.team_id)}</div>
                    </td>
                    <td className="p-3 text-right text-gray-400">{p.previous_price} cr</td>
                    <td className="p-3 text-right font-semibold">{p.current_price} cr</td>
                    <td className="p-3 text-right">
                      <ChangeBadge change={p.price_change} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* ── Section 4: Best Value ─────────────────────────────────────────── */}
      <Section title="💎 Best Value Players" count={data.best_value.length}>
        {data.best_value.length === 0 ? (
          <EmptyState message="Not enough games played yet to rank value. Check back after 3+ gameweeks." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#0b0f14] text-gray-400">
                <tr>
                  <th className="text-left p-3">Player</th>
                  <th className="text-right p-3">Price</th>
                  <th className="text-right p-3 hidden sm:table-cell">Avg</th>
                  <th className="text-right p-3">Val/cr</th>
                </tr>
              </thead>
              <tbody>
                {data.best_value.map((p, i) => (
                  <tr key={p.player_id} className="border-t border-[#1f2733]">
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 w-4">#{i + 1}</span>
                        <div>
                          <div className="font-medium">{p.full_name}</div>
                          <div className="text-xs text-gray-400">{tn(p.team_id)}</div>
                        </div>
                      </div>
                    </td>
                    <td className="p-3 text-right">{p.current_price} cr</td>
                    <td className="p-3 text-right text-gray-300 hidden sm:table-cell">
                      {p.season_average_fantasy_points.toFixed(1)}
                    </td>
                    <td className="p-3 text-right">
                      <span className="font-bold text-court-orange">
                        {p.value_per_credit.toFixed(2)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* ── Section 5: Hidden Gems ─────────────────────────────────────────── */}
      <Section title="⭐ Hidden Gems" count={data.hidden_gems.length} defaultOpen={false}>
        {data.hidden_gems.length === 0 ? (
          <EmptyState message="No hidden gems found — no affordable players averaging 18+ pts with 3+ games yet." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#0b0f14] text-gray-400">
                <tr>
                  <th className="text-left p-3">Player</th>
                  <th className="text-right p-3">Price</th>
                  <th className="text-right p-3">Avg</th>
                  <th className="text-right p-3">Val/cr</th>
                </tr>
              </thead>
              <tbody>
                {data.hidden_gems.map((p) => (
                  <tr key={p.player_id} className="border-t border-[#1f2733]">
                    <td className="p-3">
                      <div className="font-medium">{p.full_name}</div>
                      <div className="text-xs text-gray-400">{tn(p.team_id)} · {p.games_played} GP</div>
                    </td>
                    <td className="p-3 text-right text-court-green font-semibold">
                      {p.current_price} cr
                    </td>
                    <td className="p-3 text-right">{p.season_average_fantasy_points.toFixed(1)}</td>
                    <td className="p-3 text-right font-bold text-court-orange">
                      {p.value_per_credit.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* ── Section 6: Form Watch ──────────────────────────────────────────── */}
      <Section title="📊 Form Watch" count={data.form_watch.length} defaultOpen={false}>
        {data.form_watch.length === 0 ? (
          <EmptyState message="Not enough game history to compare form blocks yet. Check back after 6+ games." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#0b0f14] text-gray-400">
                <tr>
                  <th className="text-left p-3">Player</th>
                  <th className="text-right p-3 hidden sm:table-cell">Prev 5 avg</th>
                  <th className="text-right p-3">Last 5 avg</th>
                  <th className="text-right p-3">Improvement</th>
                </tr>
              </thead>
              <tbody>
                {data.form_watch.map((p) => (
                  <tr key={p.player_id} className="border-t border-[#1f2733]">
                    <td className="p-3">
                      <div className="font-medium">{p.full_name}</div>
                      <div className="text-xs text-gray-400">{tn(p.team_id)}</div>
                    </td>
                    <td className="p-3 text-right text-gray-400 hidden sm:table-cell">
                      {p.prev_5_average.toFixed(1)}
                    </td>
                    <td className="p-3 text-right font-semibold text-court-green">
                      {p.last_5_average.toFixed(1)}
                    </td>
                    <td className="p-3 text-right">
                      <ImprovementBadge diff={p.last_5_average - p.prev_5_average} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
