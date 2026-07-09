"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { PriceBadge, FormBadge, Last5Sparkline } from "@/components/ui";

// ─── Types ───────────────────────────────────────────────────────────────────

interface PlayerData {
  player_id: string;
  player_name: string;
  team_id: string;
  current_price: number;
  previous_price: number;
  price_change: number;
  price_trend: "up" | "down" | "same";
  season_average_fantasy_points: number;
  games_played: number;
  last_5_fantasy_scores: number[];
  last_5_average: number;
  value_per_credit: number;
  form: "hot" | "good" | "average" | "cold";
}

interface CompCategory {
  winner: "playerA" | "playerB" | "tie";
  reason: string;
}

interface ComparisonResult {
  player_a: PlayerData;
  player_b: PlayerData;
  comparison: {
    price: CompCategory;
    season_average: CompCategory;
    form: CompCategory;
    value: CompCategory;
    recent_form: CompCategory;
    price_trend: CompCategory;
    games_played: CompCategory;
  };
  recommendation: {
    recommended_player: "playerA" | "playerB" | "tie";
    confidence: "High" | "Medium" | "Low";
    summary: string;
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const CONFIDENCE_COLOR: Record<string, string> = {
  High: "text-court-green",
  Medium: "text-yellow-400",
  Low: "text-gray-400",
};

// Highlight colour for the winning column cell
function winClass(cat: CompCategory, side: "playerA" | "playerB") {
  if (cat.winner === side) return "bg-court-orange/10 text-court-orange font-bold";
  if (cat.winner === "tie") return "text-gray-300";
  return "text-gray-400";
}

// ─── Comparison row ───────────────────────────────────────────────────────────

function CompRow({
  label,
  cat,
  cellA,
  cellB,
}: {
  label: string;
  cat: CompCategory;
  cellA: React.ReactNode;
  cellB: React.ReactNode;
}) {
  return (
    <tr className="border-t border-[#1f2733]">
      <td className="p-3 text-xs text-gray-400 text-center">{label}</td>
      <td className={`p-3 text-sm text-center ${winClass(cat, "playerA")}`}>{cellA}</td>
      <td className={`p-3 text-sm text-center ${winClass(cat, "playerB")}`}>{cellB}</td>
    </tr>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ComparePage() {
  const [allPlayers, setAllPlayers] = useState<{ player_id: string; full_name: string; team_id: string }[]>([]);
  const [teams, setTeams] = useState<Record<string, string>>({});
  const [playerA, setPlayerA] = useState("");
  const [playerB, setPlayerB] = useState("");
  const [result, setResult] = useState<ComparisonResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [loadingPlayers, setLoadingPlayers] = useState(true);

  useEffect(() => {
    Promise.all([api.get("/players?status=all"), api.get("/teams")])
      .then(([pRes, tRes]) => {
        setAllPlayers(pRes.data.players || []);
        const tm: Record<string, string> = {};
        for (const t of tRes.data.teams || []) tm[t.team_id] = t.team_name;
        setTeams(tm);
      })
      .finally(() => setLoadingPlayers(false));
  }, []);

  useEffect(() => {
    if (!playerA || !playerB || playerA === playerB) { setResult(null); return; }
    setLoading(true);
    setError("");
    api.get(`/player-comparison?playerA=${playerA}&playerB=${playerB}`)
      .then((res) => setResult(res.data))
      .catch((err) => setError(err?.response?.data?.error || "Failed to load comparison."))
      .finally(() => setLoading(false));
  }, [playerA, playerB]);

  const tn = (id: string) => teams[id] || "—";
  const pName = (id: string) => allPlayers.find((p) => p.player_id === id)?.full_name || "Player";

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">⚖️ Compare Players</h1>
        <p className="text-sm text-gray-400 mt-0.5">
          Side-by-side analytics to sharpen your transfer decisions.
        </p>
      </div>

      {/* Selectors */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="card p-4 flex flex-col gap-2">
          <label className="text-xs text-gray-400 font-semibold uppercase">Player A</label>
          <select
            className="input-field"
            value={playerA}
            onChange={(e) => setPlayerA(e.target.value)}
            disabled={loadingPlayers}
          >
            <option value="">Select player...</option>
            {allPlayers.map((p) => (
              <option key={p.player_id} value={p.player_id}>{p.full_name} ({tn(p.team_id)})</option>
            ))}
          </select>
        </div>
        <div className="card p-4 flex flex-col gap-2">
          <label className="text-xs text-gray-400 font-semibold uppercase">Player B</label>
          <select
            className="input-field"
            value={playerB}
            onChange={(e) => setPlayerB(e.target.value)}
            disabled={loadingPlayers}
          >
            <option value="">Select player...</option>
            {allPlayers.map((p) => (
              <option key={p.player_id} value={p.player_id}>{p.full_name} ({tn(p.team_id)})</option>
            ))}
          </select>
        </div>
      </div>

      {playerA && playerB && playerA === playerB && (
        <div className="card p-4 text-center text-sm text-yellow-400">
          ⚠️ Select two different players to compare.
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 rounded-full border-4 border-[#1f2733] border-t-court-orange animate-spin" />
            <p className="text-sm text-gray-400">Comparing players...</p>
          </div>
        </div>
      )}

      {/* Error */}
      {error && <div className="card p-4 text-center text-red-400 text-sm">{error}</div>}

      {/* Empty state */}
      {!loading && !error && !result && (!playerA || !playerB || playerA === playerB) && (
        <div className="card p-10 text-center flex flex-col items-center gap-3">
          <span className="text-4xl">⚖️</span>
          <p className="font-bold">Choose two players to begin comparison.</p>
          <p className="text-sm text-gray-400">
            Select Player A and Player B above to see a detailed side-by-side breakdown.
          </p>
        </div>
      )}

      {/* Results */}
      {!loading && result && (
        <>
          {/* Comparison table */}
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[#0b0f14]">
                  <tr>
                    <th className="p-3 text-gray-400 text-xs text-center w-28">Category</th>
                    <th className="p-3 text-center font-bold text-base w-1/2">
                      <div>{result.player_a.player_name}</div>
                      <div className="text-xs text-gray-400 font-normal">{tn(result.player_a.team_id)}</div>
                    </th>
                    <th className="p-3 text-center font-bold text-base w-1/2">
                      <div>{result.player_b.player_name}</div>
                      <div className="text-xs text-gray-400 font-normal">{tn(result.player_b.team_id)}</div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <CompRow
                    label="Form"
                    cat={result.comparison.form}
                    cellA={<FormBadge form={result.player_a.form} variant="pill" />}
                    cellB={<FormBadge form={result.player_b.form} variant="pill" />}
                  />
                  <CompRow
                    label="Price"
                    cat={result.comparison.price}
                    cellA={
                      <PriceBadge
                        current_price={result.player_a.current_price}
                        previous_price={result.player_a.previous_price}
                        price_change={result.player_a.price_change}
                        price_trend={result.player_a.price_trend}
                        variant="inline"
                      />
                    }
                    cellB={
                      <PriceBadge
                        current_price={result.player_b.current_price}
                        previous_price={result.player_b.previous_price}
                        price_change={result.player_b.price_change}
                        price_trend={result.player_b.price_trend}
                        variant="inline"
                      />
                    }
                  />
                  <CompRow
                    label="Season Avg"
                    cat={result.comparison.season_average}
                    cellA={`${result.player_a.season_average_fantasy_points.toFixed(1)} FP`}
                    cellB={`${result.player_b.season_average_fantasy_points.toFixed(1)} FP`}
                  />
                  <CompRow
                    label="Last 5 Avg"
                    cat={result.comparison.recent_form}
                    cellA={`${result.player_a.last_5_average.toFixed(1)} FP`}
                    cellB={`${result.player_b.last_5_average.toFixed(1)} FP`}
                  />
                  <CompRow
                    label="Value/cr"
                    cat={result.comparison.value}
                    cellA={`${result.player_a.value_per_credit.toFixed(2)}`}
                    cellB={`${result.player_b.value_per_credit.toFixed(2)}`}
                  />
                  <CompRow
                    label="Games"
                    cat={result.comparison.games_played}
                    cellA={result.player_a.games_played}
                    cellB={result.player_b.games_played}
                  />
                  <CompRow
                    label="Prev Price"
                    cat={{ winner: "tie", reason: "" }}
                    cellA={`${result.player_a.previous_price} cr`}
                    cellB={`${result.player_b.previous_price} cr`}
                  />
                  <tr className="border-t border-[#1f2733]">
                    <td className="p-3 text-xs text-gray-400 text-center">Last 5 Games</td>
                    <td className="p-3">
                      {result.player_a.last_5_fantasy_scores.length > 0
                        ? <Last5Sparkline scores={result.player_a.last_5_fantasy_scores} />
                        : <span className="text-xs text-gray-500">No data</span>}
                    </td>
                    <td className="p-3">
                      {result.player_b.last_5_fantasy_scores.length > 0
                        ? <Last5Sparkline scores={result.player_b.last_5_fantasy_scores} />
                        : <span className="text-xs text-gray-500">No data</span>}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Category reasons */}
          <div className="card p-4">
            <h3 className="font-bold mb-3 text-sm text-gray-400 uppercase">Category Breakdown</h3>
            <div className="flex flex-col gap-2 text-sm">
              {Object.entries(result.comparison).map(([key, cat]) => (
                <div key={key} className="flex items-start justify-between gap-4">
                  <span className="text-gray-400 capitalize">{key.replace(/_/g, " ")}</span>
                  <span className={`text-right text-xs ${cat.winner === "tie" ? "text-gray-500" : cat.winner === "playerA" ? "text-court-orange" : "text-blue-400"}`}>
                    {cat.winner === "tie" ? "—" : cat.winner === "playerA" ? `${pName(playerA)} ▲` : `${pName(playerB)} ▲`}: {cat.reason}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Verdict */}
          <div className={`card p-6 border-2 ${
            result.recommendation.recommended_player === "tie"
              ? "border-[#1f2733]"
              : result.recommendation.recommended_player === "playerA"
              ? "border-court-orange"
              : "border-blue-500"
          }`}>
            <div className="flex items-start gap-4">
              <span className="text-3xl flex-shrink-0">🏆</span>
              <div className="flex flex-col gap-1">
                <p className="text-xs text-gray-400 uppercase font-semibold">Fantasy Verdict</p>
                <p className="font-bold text-lg">
                  {result.recommendation.recommended_player === "tie"
                    ? "No Clear Recommendation"
                    : result.recommendation.recommended_player === "playerA"
                    ? result.player_a.player_name
                    : result.player_b.player_name}
                </p>
                <p className={`text-sm font-semibold ${CONFIDENCE_COLOR[result.recommendation.confidence]}`}>
                  Confidence: {result.recommendation.confidence}
                </p>
                <p className="text-sm text-gray-300 mt-1 leading-relaxed">
                  {result.recommendation.summary}
                </p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
