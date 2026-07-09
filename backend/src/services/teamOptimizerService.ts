/**
 * Team Optimizer Service — GAME-007
 *
 * Recommends the strongest possible 5-player lineup for the active
 * gameweek using an iterative improvement algorithm.
 *
 * IMPORTANT: Uses calcTeamHealth from teamAdvisorService as the single
 * evaluation function for lineup quality. The Team Planner and Optimizer
 * share the same scoring — no duplicate algorithms.
 *
 * ALGORITHM: Greedy iterative improvement with single-swap search
 * ──────────────────────────────────────────────────────────────
 * 1. Start from the user's current lineup (or build a seed lineup).
 * 2. For each player in the lineup:
 *      For each active player NOT in the lineup:
 *        a. Check swap validity (salary cap, team rule, active)
 *        b. Score the swapped lineup with calcTeamHealth
 *        c. Track best swap found in this pass
 * 3. Apply the best swap. Repeat until no improvement is found.
 *
 * Complexity: O(k × n × iterations) where k=5, n≈70 active players,
 * typically converges in 3-8 iterations (~2,800 evaluations/pass).
 * All evaluations are pure in-memory — no I/O after initial load.
 *
 * Pruning: salary-cap check first eliminates most candidates early.
 */

import { getSheetData, getSetting } from "./sheetsService";
import {
  buildPriceMovementMap,
  buildPlayerIntelligenceMap,
  enrichPlayers,
  EnrichedPlayer,
} from "../utils/playerAnalytics";
import { calcTeamHealth, suggestCaptain, TeamHealth } from "./teamAdvisorService";

// ─── Types ────────────────────────────────────────────────────────────────────

export type Strategy = "balanced" | "value" | "stars";

export interface OptimizerPlayerSummary {
  player_id: string;
  player_name: string;
  team_id: string;
  current_price: number;
  form: string;
  season_average_fantasy_points: number;
  value_per_credit: number;
}

export interface OptimizerTeamSnapshot {
  players: OptimizerPlayerSummary[];
  team_health: TeamHealth;
  salary_used: number;
  remaining_budget: number;
  captain: OptimizerPlayerSummary;
}

export interface OptimizerComparison {
  health_change: number;
  budget_change: number;
  average_points_change: number;
  value_change: number;
  captain_changed: boolean;
  players_replaced: number;
}

export interface TransferRecommendation {
  out: OptimizerPlayerSummary;
  in: OptimizerPlayerSummary;
  reason: string;
}

export interface OptimizerResult {
  strategy: Strategy;
  current_team: OptimizerTeamSnapshot;
  optimized_team: OptimizerTeamSnapshot;
  comparison: OptimizerComparison;
  recommendations: TransferRecommendation[];
  already_optimal: boolean;
}

// ─── Strategy scoring ─────────────────────────────────────────────────────────

function scoreLineup(lineup: EnrichedPlayer[], budgetCap: number, strategy: Strategy): number {
  const health = calcTeamHealth(lineup, budgetCap);
  if (strategy === "balanced") return health.score;
  if (strategy === "value") {
    const avgVal = lineup.reduce((s, p) => s + p.value_per_credit, 0) / lineup.length;
    return Math.min((avgVal / 3) * 100, 100) * 0.6 + health.score * 0.4;
  }
  // stars
  const avgFP = lineup.reduce((s, p) => s + p.season_average_fantasy_points, 0) / lineup.length;
  return Math.min((avgFP / 30) * 100, 100) * 0.6 + health.score * 0.4;
}

// ─── Constraint validation ────────────────────────────────────────────────────

function isValidSwap(current: EnrichedPlayer[], out: EnrichedPlayer, candidate: EnrichedPlayer, budgetCap: number): boolean {
  const totalSalary = current.reduce((s, p) => s + p.current_price, 0) - out.current_price + candidate.current_price;
  if (totalSalary > budgetCap) return false;
  const teamCounts: Record<string, number> = {};
  for (const p of current) {
    if (p.player_id === out.player_id) continue;
    teamCounts[p.team_id] = (teamCounts[p.team_id] || 0) + 1;
  }
  return (teamCounts[candidate.team_id] || 0) < 2;
}

// ─── Iterative improvement ────────────────────────────────────────────────────

function iterativeImprovement(
  start: EnrichedPlayer[],
  allActive: EnrichedPlayer[],
  budgetCap: number,
  strategy: Strategy,
  maxIterations = 20
): EnrichedPlayer[] {
  let current = [...start];
  for (let iter = 0; iter < maxIterations; iter++) {
    let bestScore = scoreLineup(current, budgetCap, strategy);
    let bestSwap: { outIdx: number; candidate: EnrichedPlayer } | null = null;
    const ids = new Set(current.map((p) => p.player_id));
    for (let i = 0; i < current.length; i++) {
      for (const candidate of allActive) {
        if (ids.has(candidate.player_id)) continue;
        if (!isValidSwap(current, current[i], candidate, budgetCap)) continue;
        const trial = [...current];
        trial[i] = candidate;
        const score = scoreLineup(trial, budgetCap, strategy);
        if (score > bestScore) { bestScore = score; bestSwap = { outIdx: i, candidate }; }
      }
    }
    if (!bestSwap) break;
    current[bestSwap.outIdx] = bestSwap.candidate;
  }
  return current;
}

// ─── Seed lineup (when user has no lineup) ────────────────────────────────────

function buildSeedLineup(allActive: EnrichedPlayer[], budgetCap: number, strategy: Strategy): EnrichedPlayer[] {
  const sorted = [...allActive].sort((a, b) => {
    if (strategy === "value") return b.value_per_credit - a.value_per_credit;
    if (strategy === "stars") return b.season_average_fantasy_points - a.season_average_fantasy_points;
    return (b.season_average_fantasy_points + b.value_per_credit * 5) - (a.season_average_fantasy_points + a.value_per_credit * 5);
  });
  const lineup: EnrichedPlayer[] = [];
  const teamCounts: Record<string, number> = {};
  let salary = 0;
  for (const p of sorted) {
    if (lineup.length >= 5) break;
    if (salary + p.current_price > budgetCap) continue;
    if ((teamCounts[p.team_id] || 0) >= 2) continue;
    lineup.push(p);
    teamCounts[p.team_id] = (teamCounts[p.team_id] || 0) + 1;
    salary += p.current_price;
  }
  return lineup;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const toSummary = (p: EnrichedPlayer): OptimizerPlayerSummary => ({
  player_id: p.player_id, player_name: p.full_name, team_id: p.team_id,
  current_price: p.current_price, form: p.form,
  season_average_fantasy_points: p.season_average_fantasy_points,
  value_per_credit: p.value_per_credit,
});
const avg = (arr: EnrichedPlayer[], fn: (p: EnrichedPlayer) => number) =>
  arr.length ? Math.round(arr.reduce((s, p) => s + fn(p), 0) / arr.length * 100) / 100 : 0;

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function optimizeLineup(user_id: string, strategy: Strategy = "balanced"): Promise<OptimizerResult> {
  const [allWeeks, lineupRows, lineupPlayerRows] = await Promise.all([
    getSheetData("Weekly_Gameweek"),
    getSheetData("User_Lineups"),
    getSheetData("Lineup_Players"),
  ]);

  const activeWeek =
    allWeeks.filter((w) => String(w.is_locked).toUpperCase() === "TRUE")
      .sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime())[0] ||
    allWeeks.sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime())[0];

  if (!activeWeek) throw new Error("No active gameweek found.");

  const userLineup = lineupRows.find(
    (l) => String(l.user_id) === String(user_id) && String(l.week_id) === String(activeWeek.week_id)
  );
  const lineupPlayerIds = userLineup
    ? lineupPlayerRows.filter((lp) => String(lp.lineup_id) === String(userLineup.lineup_id)).map((lp) => lp.player_id)
    : [];

  // Single analytics load — everything else in memory
  const [allPlayers, allStats, priceHistory, budgetCapStr] = await Promise.all([
    getSheetData("Players"),
    getSheetData("Player_Stats"),
    getSheetData("Price_History"),
    getSetting("budget_cap", "100"),
  ]);

  const budgetCap = Number(budgetCapStr);
  const movementMap = buildPriceMovementMap(priceHistory);
  const intelligenceMap = buildPlayerIntelligenceMap(allStats);
  const allActive = enrichPlayers(
    allPlayers.filter((p) => String(p.status).toLowerCase() === "active"),
    movementMap, intelligenceMap
  );

  const currentLineup = lineupPlayerIds.length >= 5
    ? allActive.filter((p) => lineupPlayerIds.includes(p.player_id))
    : buildSeedLineup(allActive, budgetCap, strategy);

  if (currentLineup.length < 5) throw new Error("NO_LINEUP");

  const optimizedLineup = iterativeImprovement(currentLineup, allActive, budgetCap, strategy);

  const currentHealth = calcTeamHealth(currentLineup, budgetCap);
  const optimizedHealth = calcTeamHealth(optimizedLineup, budgetCap);
  const currentCaptain = suggestCaptain(currentLineup);
  const optimizedCaptain = suggestCaptain(optimizedLineup);
  const currentSalary = currentLineup.reduce((s, p) => s + p.current_price, 0);
  const optimizedSalary = optimizedLineup.reduce((s, p) => s + p.current_price, 0);

  const currentIds = new Set(currentLineup.map((p) => p.player_id));
  const optimizedIds = new Set(optimizedLineup.map((p) => p.player_id));
  const removed = currentLineup.filter((p) => !optimizedIds.has(p.player_id));
  const added = optimizedLineup.filter((p) => !currentIds.has(p.player_id));
  const alreadyOptimal = removed.length === 0;

  const recommendations: TransferRecommendation[] = removed.map((outP, i) => {
    const inP = added[i];
    const reasons: string[] = [];
    if (inP.value_per_credit > outP.value_per_credit)
      reasons.push(`better value (${inP.value_per_credit.toFixed(2)} vs ${outP.value_per_credit.toFixed(2)}/cr)`);
    if (inP.season_average_fantasy_points > outP.season_average_fantasy_points)
      reasons.push(`higher average (${inP.season_average_fantasy_points.toFixed(1)} vs ${outP.season_average_fantasy_points.toFixed(1)} FP)`);
    if (["hot","good"].includes(inP.form) && inP.form !== outP.form)
      reasons.push(`${inP.form.toUpperCase()} form`);
    return {
      out: toSummary(outP),
      in: toSummary(inP),
      reason: reasons.length
        ? `Improves ${reasons.slice(0, 2).join(" and ")} while remaining under salary cap.`
        : `Improves overall score under ${strategy} strategy.`,
    };
  });

  return {
    strategy,
    current_team: {
      players: currentLineup.map(toSummary), team_health: currentHealth,
      salary_used: currentSalary, remaining_budget: budgetCap - currentSalary,
      captain: toSummary(currentCaptain),
    },
    optimized_team: {
      players: optimizedLineup.map(toSummary), team_health: optimizedHealth,
      salary_used: optimizedSalary, remaining_budget: budgetCap - optimizedSalary,
      captain: toSummary(optimizedCaptain),
    },
    comparison: {
      health_change: optimizedHealth.score - currentHealth.score,
      budget_change: (budgetCap - optimizedSalary) - (budgetCap - currentSalary),
      average_points_change: Math.round((avg(optimizedLineup, p => p.season_average_fantasy_points) - avg(currentLineup, p => p.season_average_fantasy_points)) * 100) / 100,
      value_change: Math.round((avg(optimizedLineup, p => p.value_per_credit) - avg(currentLineup, p => p.value_per_credit)) * 100) / 100,
      captain_changed: optimizedCaptain.player_id !== currentCaptain.player_id,
      players_replaced: removed.length,
    },
    recommendations,
    already_optimal: alreadyOptimal,
  };
}
