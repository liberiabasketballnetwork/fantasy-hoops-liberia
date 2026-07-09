/**
 * Team Advisor Service — GAME-004 Phase 1
 *
 * Provides deterministic, explainable recommendations for a user's current
 * submitted lineup. All analytics are delegated to playerAnalytics.ts.
 * No AI, no randomness — every recommendation is reproducible.
 */

import { getSheetData, getSetting } from "./sheetsService";
import {
  buildPriceMovementMap,
  buildPlayerIntelligenceMap,
  enrichPlayers,
  EnrichedPlayer,
  FormRating,
} from "../utils/playerAnalytics";

// ─── Output types ───────────────────────────────────────────────────────────

export interface TeamHealth {
  score: number;
  label: "Excellent" | "Strong" | "Average" | "Needs Improvement";
}

export interface PlayerRecommendation {
  player_id: string;
  player_name: string;
  team_id: string;
  current_price: number;
  season_average_fantasy_points: number;
  form: FormRating;
  value_per_credit: number;
  reason: string;
}

export interface TransferSuggestion {
  out: PlayerRecommendation;
  in: PlayerRecommendation;
  reason: string;
}

export interface BudgetAnalysis {
  credits_used: number;
  credits_remaining: number;
  budget_cap: number;
  message: string;
}

export interface TeamAlert {
  type: "hot_player" | "cold_player" | "price_up" | "price_down" | "bargain";
  player_name: string;
  message: string;
}

export interface TeamAdvisorResult {
  has_lineup: boolean;
  week_id: string | null;
  team_health: TeamHealth | null;
  strongest_player: PlayerRecommendation | null;
  weakest_player: PlayerRecommendation | null;
  suggested_captain: PlayerRecommendation | null;
  suggested_transfer: TransferSuggestion | null;
  budget_analysis: BudgetAnalysis | null;
  alerts: TeamAlert[];
}

// ─── Health scoring ─────────────────────────────────────────────────────────

const FORM_SCORE: Record<FormRating, number> = {
  hot: 100,
  good: 75,
  average: 50,
  cold: 25,
};

export function calcTeamHealth(
  lineup: EnrichedPlayer[],
  budgetCap: number
): TeamHealth {
  if (lineup.length === 0) return { score: 0, label: "Needs Improvement" };

  const avgFormScore =
    lineup.reduce((s, p) => s + FORM_SCORE[p.form as FormRating], 0) / lineup.length;

  const avgFP =
    lineup.reduce((s, p) => s + p.season_average_fantasy_points, 0) / lineup.length;
  // Normalise: assume 30 fp is a very strong average → 100 pts
  const fpScore = Math.min((avgFP / 30) * 100, 100);

  const avgValue =
    lineup.reduce((s, p) => s + p.value_per_credit, 0) / lineup.length;
  // Normalise: 3.0 value/cr is elite
  const valueScore = Math.min((avgValue / 3) * 100, 100);

  const creditsUsed = lineup.reduce((s, p) => s + p.current_price, 0);
  const budgetUtilisation = budgetCap > 0 ? creditsUsed / budgetCap : 1;
  // Reward teams that use 85–100% of budget; penalise those leaving >20% unused
  const budgetScore = budgetUtilisation >= 0.85 ? 100 : budgetUtilisation * 100;

  const raw = avgFormScore * 0.35 + fpScore * 0.35 + valueScore * 0.20 + budgetScore * 0.10;
  const score = Math.round(Math.min(Math.max(raw, 0), 100));
  const label =
    score >= 90 ? "Excellent"
    : score >= 75 ? "Strong"
    : score >= 60 ? "Average"
    : "Needs Improvement";

  return { score, label };
}

// ─── Captain selection ───────────────────────────────────────────────────────

export function suggestCaptain(lineup: EnrichedPlayer[]): EnrichedPlayer {
  // Priority: HOT form > GOOD form > highest last_5_average > season average
  const formOrder: FormRating[] = ["hot", "good", "average", "cold"];
  for (const form of formOrder) {
    const candidates = lineup
      .filter((p) => p.form === form)
      .sort((a, b) => b.last_5_average - a.last_5_average);
    if (candidates.length > 0) return candidates[0];
  }
  return [...lineup].sort((a, b) => b.season_average_fantasy_points - a.season_average_fantasy_points)[0];
}

// ─── Transfer logic ──────────────────────────────────────────────────────────

function suggestTransfer(
  weakest: EnrichedPlayer,
  lineupPlayers: EnrichedPlayer[],
  allActive: EnrichedPlayer[],
  creditsRemaining: number
): EnrichedPlayer | null {
  const lineupIds = new Set(lineupPlayers.map((p) => p.player_id));
  const lineupTeamCounts: Record<string, number> = {};
  for (const p of lineupPlayers) {
    lineupTeamCounts[p.team_id] = (lineupTeamCounts[p.team_id] || 0) + 1;
  }

  // Budget available after selling weakest
  const availableBudget = creditsRemaining + weakest.current_price;

  return (
    allActive
      .filter((p) => {
        if (lineupIds.has(p.player_id)) return false;        // already in lineup
        if (p.player_id === weakest.player_id) return false;
        if (p.current_price > availableBudget) return false; // can't afford
        if (p.form !== "hot" && p.form !== "good") return false; // form filter
        if (p.value_per_credit <= weakest.value_per_credit) return false; // must be better value
        // Respect max 2 per team
        const currentCount = lineupTeamCounts[p.team_id] || 0;
        // Weakest may be from the same team — adjust count
        const adjustedCount = p.team_id === weakest.team_id ? currentCount - 1 : currentCount;
        if (adjustedCount >= 2) return false;
        return true;
      })
      .sort((a, b) => b.value_per_credit - a.value_per_credit)[0] || null
  );
}

// ─── Alerts ─────────────────────────────────────────────────────────────────

function buildAlerts(lineup: EnrichedPlayer[]): TeamAlert[] {
  const alerts: TeamAlert[] = [];

  for (const p of lineup) {
    if (alerts.length >= 5) break;

    if (p.form === "hot") {
      alerts.push({
        type: "hot_player",
        player_name: p.full_name,
        message: `🔥 ${p.full_name} is on HOT form — great captain option.`,
      });
    } else if (p.form === "cold") {
      alerts.push({
        type: "cold_player",
        player_name: p.full_name,
        message: `🔵 ${p.full_name} is COLD — consider a transfer.`,
      });
    }

    if (alerts.length >= 5) break;

    if (p.price_trend === "up" && p.price_change >= 2) {
      alerts.push({
        type: "price_up",
        player_name: p.full_name,
        message: `📈 ${p.full_name}'s price rose +${p.price_change} cr this week.`,
      });
    } else if (p.price_trend === "down") {
      alerts.push({
        type: "price_down",
        player_name: p.full_name,
        message: `📉 ${p.full_name}'s price fell ${p.price_change} cr — watch for further drops.`,
      });
    }

    if (alerts.length >= 5) break;

    if (p.current_price <= 8 && p.season_average_fantasy_points >= 18) {
      alerts.push({
        type: "bargain",
        player_name: p.full_name,
        message: `💎 ${p.full_name} is an excellent bargain at ${p.current_price} cr.`,
      });
    }
  }

  return alerts.slice(0, 5);
}

// ─── Main function ───────────────────────────────────────────────────────────

export async function getTeamAdvice(user_id: string): Promise<TeamAdvisorResult> {
  // ── Step 1: get the active week
  const allWeeks = await getSheetData("Weekly_Gameweek");
  const activeWeek = allWeeks
    .filter((w) => String(w.is_locked).toUpperCase() === "TRUE")
    .sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime())[0]
    // Fallback: most recent week even if not locked
    || allWeeks.sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime())[0];

  if (!activeWeek) {
    return { has_lineup: false, week_id: null, team_health: null, strongest_player: null, weakest_player: null, suggested_captain: null, suggested_transfer: null, budget_analysis: null, alerts: [] };
  }

  // ── Step 2: find user's lineup for this week
  const [lineupRows, lineupPlayerRows] = await Promise.all([
    getSheetData("User_Lineups"),
    getSheetData("Lineup_Players"),
  ]);

  const userLineup = lineupRows.find(
    (l) => String(l.user_id) === String(user_id) && String(l.week_id) === String(activeWeek.week_id)
  );

  if (!userLineup) {
    return { has_lineup: false, week_id: activeWeek.week_id, team_health: null, strongest_player: null, weakest_player: null, suggested_captain: null, suggested_transfer: null, budget_analysis: null, alerts: [] };
  }

  const lineupPlayerIds = new Set(
    lineupPlayerRows
      .filter((lp) => String(lp.lineup_id) === String(userLineup.lineup_id))
      .map((lp) => lp.player_id)
  );

  // ── Step 3: analytics — all three reads in parallel
  const [allPlayers, allStats, priceHistory, budgetCapStr] = await Promise.all([
    getSheetData("Players"),
    getSheetData("Player_Stats"),
    getSheetData("Price_History"),
    getSetting("budget_cap", "100"),
  ]);

  const budgetCap = Number(budgetCapStr);
  const movementMap = buildPriceMovementMap(priceHistory);
  const intelligenceMap = buildPlayerIntelligenceMap(allStats);

  const allEnriched = enrichPlayers(
    allPlayers.filter((p) => String(p.status).toLowerCase() === "active"),
    movementMap,
    intelligenceMap
  );

  const lineupEnriched = allEnriched.filter((p) => lineupPlayerIds.has(p.player_id));

  if (lineupEnriched.length === 0) {
    return { has_lineup: false, week_id: activeWeek.week_id, team_health: null, strongest_player: null, weakest_player: null, suggested_captain: null, suggested_transfer: null, budget_analysis: null, alerts: [] };
  }

  // ── Step 4: compute all sections ──────────────────────────────────────────

  const creditsUsed = lineupEnriched.reduce((s, p) => s + p.current_price, 0);
  const creditsRemaining = budgetCap - creditsUsed;

  // Team health
  const teamHealth = calcTeamHealth(lineupEnriched, budgetCap);

  // Strongest: highest season average
  const strongest = [...lineupEnriched].sort(
    (a, b) => b.season_average_fantasy_points - a.season_average_fantasy_points
  )[0];

  // Weakest: lowest value per credit
  const weakest = [...lineupEnriched].sort(
    (a, b) => a.value_per_credit - b.value_per_credit
  )[0];

  // Captain
  const captain = suggestCaptain(lineupEnriched);

  // Transfer
  const transferIn = suggestTransfer(weakest, lineupEnriched, allEnriched, creditsRemaining);

  // Budget
  const budgetAnalysis: BudgetAnalysis = {
    credits_used: creditsUsed,
    credits_remaining: creditsRemaining,
    budget_cap: budgetCap,
    message:
      creditsRemaining === 0
        ? "Your salary cap is fully utilized."
        : creditsRemaining <= 5
        ? `You have ${creditsRemaining} credits left — limited transfer options.`
        : `You still have ${creditsRemaining} credits available.`,
  };

  // Alerts
  const alerts = buildAlerts(lineupEnriched);

  // ── Helpers: shape PlayerRecommendation ───────────────────────────────────

  const toRec = (p: EnrichedPlayer, reason: string): PlayerRecommendation => ({
    player_id: p.player_id,
    player_name: p.full_name,
    team_id: p.team_id,
    current_price: p.current_price,
    season_average_fantasy_points: p.season_average_fantasy_points,
    form: p.form as FormRating,
    value_per_credit: p.value_per_credit,
    reason,
  });

  return {
    has_lineup: true,
    week_id: activeWeek.week_id,
    team_health: teamHealth,
    strongest_player: toRec(
      strongest,
      `Averages ${strongest.season_average_fantasy_points.toFixed(1)} fantasy points.`
    ),
    weakest_player: toRec(
      weakest,
      `Lowest value relative to price (${weakest.value_per_credit.toFixed(2)}/cr).`
    ),
    suggested_captain: toRec(
      captain,
      captain.form === "hot"
        ? `Currently HOT and averaging ${captain.season_average_fantasy_points.toFixed(1)} FP.`
        : `${captain.form === "good" ? "Good" : "Best available"} form with ${captain.season_average_fantasy_points.toFixed(1)} FP average.`
    ),
    suggested_transfer: transferIn
      ? {
          out: toRec(weakest, `Lowest value in your team at ${weakest.value_per_credit.toFixed(2)}/cr.`),
          in: toRec(transferIn, `Higher value (${transferIn.value_per_credit.toFixed(2)}/cr) within budget.`),
          reason: `Swap ${weakest.full_name} for ${transferIn.full_name} — stronger value for your current budget.`,
        }
      : null,
    budget_analysis: budgetAnalysis,
    alerts,
  };
}
