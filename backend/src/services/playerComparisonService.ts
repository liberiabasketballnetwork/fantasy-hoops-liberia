/**
 * Player Comparison Service — GAME-005
 *
 * Deterministic, explainable comparison of two active players.
 * All analytics are delegated to playerAnalytics.ts.
 * No AI, no randomness — every result is reproducible.
 */

import { getSheetData } from "./sheetsService";
import {
  buildPriceMovementMap,
  buildPlayerIntelligenceMap,
  enrichPlayers,
  EnrichedPlayer,
  FormRating,
} from "../utils/playerAnalytics";

// ─── Output types ────────────────────────────────────────────────────────────

export interface ComparisonPlayerData {
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
  form: FormRating;
}

export interface ComparisonCategory {
  winner: "playerA" | "playerB" | "tie";
  reason: string;
}

export interface Comparison {
  price: ComparisonCategory;
  season_average: ComparisonCategory;
  form: ComparisonCategory;
  value: ComparisonCategory;
  recent_form: ComparisonCategory;
  price_trend: ComparisonCategory;
  games_played: ComparisonCategory;
}

export interface Recommendation {
  recommended_player: "playerA" | "playerB" | "tie";
  confidence: "High" | "Medium" | "Low";
  summary: string;
}

export interface ComparisonResult {
  player_a: ComparisonPlayerData;
  player_b: ComparisonPlayerData;
  comparison: Comparison;
  recommendation: Recommendation;
}

// ─── Form rank helper ─────────────────────────────────────────────────────────

const FORM_RANK: Record<FormRating, number> = {
  hot: 4,
  good: 3,
  average: 2,
  cold: 1,
};

const TREND_RANK: Record<string, number> = {
  up: 2,
  same: 1,
  down: 0,
};

// ─── Category comparisons ─────────────────────────────────────────────────────

function cmpPrice(a: EnrichedPlayer, b: EnrichedPlayer): ComparisonCategory {
  const diff = Math.abs(a.current_price - b.current_price);
  if (a.current_price < b.current_price)
    return { winner: "playerA", reason: `Costs ${diff} fewer credit${diff !== 1 ? "s" : ""}.` };
  if (b.current_price < a.current_price)
    return { winner: "playerB", reason: `Costs ${diff} fewer credit${diff !== 1 ? "s" : ""}.` };
  return { winner: "tie", reason: "Same price." };
}

function cmpSeasonAverage(a: EnrichedPlayer, b: EnrichedPlayer): ComparisonCategory {
  const da = a.season_average_fantasy_points;
  const db = b.season_average_fantasy_points;
  if (da > db) return { winner: "playerA", reason: `Higher season average (${da.toFixed(1)} vs ${db.toFixed(1)} FP).` };
  if (db > da) return { winner: "playerB", reason: `Higher season average (${db.toFixed(1)} vs ${da.toFixed(1)} FP).` };
  return { winner: "tie", reason: `Equal season average (${da.toFixed(1)} FP).` };
}

function cmpForm(a: EnrichedPlayer, b: EnrichedPlayer): ComparisonCategory {
  const ra = FORM_RANK[a.form as FormRating];
  const rb = FORM_RANK[b.form as FormRating];
  if (ra > rb) return { winner: "playerA", reason: `${a.form.toUpperCase()} form vs ${b.form.toUpperCase()}.` };
  if (rb > ra) return { winner: "playerB", reason: `${b.form.toUpperCase()} form vs ${a.form.toUpperCase()}.` };
  return { winner: "tie", reason: `Both on ${a.form.toUpperCase()} form.` };
}

function cmpValue(a: EnrichedPlayer, b: EnrichedPlayer): ComparisonCategory {
  const va = a.value_per_credit;
  const vb = b.value_per_credit;
  if (va > vb) return { winner: "playerA", reason: `Better value (${va.toFixed(2)} vs ${vb.toFixed(2)} FP/cr).` };
  if (vb > va) return { winner: "playerB", reason: `Better value (${vb.toFixed(2)} vs ${va.toFixed(2)} FP/cr).` };
  return { winner: "tie", reason: `Equal value per credit (${va.toFixed(2)} FP/cr).` };
}

function cmpRecentForm(a: EnrichedPlayer, b: EnrichedPlayer): ComparisonCategory {
  const la = a.last_5_average;
  const lb = b.last_5_average;
  if (la > lb) return { winner: "playerA", reason: `Higher last-5 average (${la.toFixed(1)} vs ${lb.toFixed(1)} FP).` };
  if (lb > la) return { winner: "playerB", reason: `Higher last-5 average (${lb.toFixed(1)} vs ${la.toFixed(1)} FP).` };
  if (a.last_5_fantasy_scores.length === 0 && b.last_5_fantasy_scores.length === 0)
    return { winner: "tie", reason: "No recent games for either player." };
  return { winner: "tie", reason: `Equal last-5 average (${la.toFixed(1)} FP).` };
}

function cmpPriceTrend(a: EnrichedPlayer, b: EnrichedPlayer): ComparisonCategory {
  const ra = TREND_RANK[a.price_trend] ?? 1;
  const rb = TREND_RANK[b.price_trend] ?? 1;
  if (ra > rb) return { winner: "playerA", reason: `Price trending ${a.price_trend} vs ${b.price_trend}.` };
  if (rb > ra) return { winner: "playerB", reason: `Price trending ${b.price_trend} vs ${a.price_trend}.` };
  return { winner: "tie", reason: `Both prices trending ${a.price_trend}.` };
}

function cmpGamesPlayed(a: EnrichedPlayer, b: EnrichedPlayer): ComparisonCategory {
  if (a.games_played > b.games_played)
    return { winner: "playerA", reason: `More games played (${a.games_played} vs ${b.games_played}).` };
  if (b.games_played > a.games_played)
    return { winner: "playerB", reason: `More games played (${b.games_played} vs ${a.games_played}).` };
  return { winner: "tie", reason: `Both have played ${a.games_played} game${a.games_played !== 1 ? "s" : ""}.` };
}

// ─── Weighted recommendation ──────────────────────────────────────────────────

function buildRecommendation(
  a: EnrichedPlayer,
  b: EnrichedPlayer,
  comparison: Comparison
): Recommendation {
  // Weighted scoring: season avg 35%, value 30%, form 20%, price trend 10%, games 5%
  const WEIGHTS = {
    season_average: 0.35,
    value: 0.30,
    form: 0.20,
    price_trend: 0.10,
    games_played: 0.05,
  };

  let scoreA = 0;
  let scoreB = 0;

  const score = (cat: ComparisonCategory, weight: number) => {
    if (cat.winner === "playerA") scoreA += weight;
    else if (cat.winner === "playerB") scoreB += weight;
    // tie → no points added
  };

  score(comparison.season_average, WEIGHTS.season_average);
  score(comparison.value, WEIGHTS.value);
  score(comparison.form, WEIGHTS.form);
  score(comparison.price_trend, WEIGHTS.price_trend);
  score(comparison.games_played, WEIGHTS.games_played);

  const diff = Math.abs(scoreA - scoreB);
  const confidence: "High" | "Medium" | "Low" =
    diff >= 0.35 ? "High" : diff >= 0.15 ? "Medium" : "Low";

  // Build a human explanation from the dominant factors
  const winnerName = scoreA > scoreB ? a.full_name : scoreB > scoreA ? b.full_name : "";
  const winner: Recommendation["recommended_player"] =
    scoreA > scoreB ? "playerA" : scoreB > scoreA ? "playerB" : "tie";

  if (winner === "tie") {
    return {
      recommended_player: "tie",
      confidence: "Low",
      summary: `No clear recommendation. ${a.full_name} and ${b.full_name} are closely matched across all categories.`,
    };
  }

  const wp = winner === "playerA" ? a : b;
  const lp = winner === "playerA" ? b : a;

  // Build a contextual summary from the strongest winning factors
  const reasons: string[] = [];
  if (comparison.value.winner === winner) reasons.push(`better value (${wp.value_per_credit.toFixed(2)}/cr)`);
  if (comparison.season_average.winner === winner) reasons.push(`higher season average (${wp.season_average_fantasy_points.toFixed(1)} FP)`);
  if (comparison.form.winner === winner) reasons.push(`${wp.form.toUpperCase()} form`);
  if (comparison.price_trend.winner === winner) reasons.push(`price trending ${wp.price_trend}`);

  const summary =
    reasons.length > 0
      ? `${winnerName} offers ${reasons.slice(0, 3).join(", ")}.`
      : `${winnerName} scores higher overall across the weighted criteria compared to ${lp.full_name}.`;

  return { recommended_player: winner, confidence, summary };
}

// ─── Main function ────────────────────────────────────────────────────────────

export async function comparePlayersById(
  playerAId: string,
  playerBId: string
): Promise<ComparisonResult> {
  // Three parallel reads — same pattern as /market and /players.
  const [allPlayers, allStats, priceHistory] = await Promise.all([
    getSheetData("Players"),
    getSheetData("Player_Stats"),
    getSheetData("Price_History"),
  ]);

  const movementMap = buildPriceMovementMap(priceHistory);
  const intelligenceMap = buildPlayerIntelligenceMap(allStats);

  // Enrich all players (active + inactive) so archived players can still
  // be compared if explicitly requested by ID.
  const enriched = enrichPlayers(allPlayers, movementMap, intelligenceMap);

  const playerA = enriched.find((p) => p.player_id === playerAId);
  const playerB = enriched.find((p) => p.player_id === playerBId);

  if (!playerA) throw new Error(`Player A not found: ${playerAId}`);
  if (!playerB) throw new Error(`Player B not found: ${playerBId}`);

  const toData = (p: EnrichedPlayer): ComparisonPlayerData => ({
    player_id: p.player_id,
    player_name: p.full_name,
    team_id: p.team_id,
    current_price: p.current_price,
    previous_price: p.previous_price,
    price_change: p.price_change,
    price_trend: p.price_trend,
    season_average_fantasy_points: p.season_average_fantasy_points,
    games_played: p.games_played,
    last_5_fantasy_scores: p.last_5_fantasy_scores,
    last_5_average: p.last_5_average,
    value_per_credit: p.value_per_credit,
    form: p.form as FormRating,
  });

  const comparison: Comparison = {
    price: cmpPrice(playerA, playerB),
    season_average: cmpSeasonAverage(playerA, playerB),
    form: cmpForm(playerA, playerB),
    value: cmpValue(playerA, playerB),
    recent_form: cmpRecentForm(playerA, playerB),
    price_trend: cmpPriceTrend(playerA, playerB),
    games_played: cmpGamesPlayed(playerA, playerB),
  };

  const recommendation = buildRecommendation(playerA, playerB, comparison);

  return {
    player_a: toData(playerA),
    player_b: toData(playerB),
    comparison,
    recommendation,
  };
}
