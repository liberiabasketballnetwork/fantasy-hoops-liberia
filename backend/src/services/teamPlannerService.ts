/**
 * Team Planner Service — GAME-006
 *
 * Simulates swapping one player in a user's current lineup with another.
 * No database writes at any point — pure in-memory simulation.
 *
 * Reuses:
 *   - playerAnalytics.ts  (enrichment)
 *   - teamAdvisorService.ts  (calcTeamHealth, suggestCaptain — exported)
 */

import { getSheetData, getSetting } from "./sheetsService";
import {
  buildPriceMovementMap,
  buildPlayerIntelligenceMap,
  enrichPlayers,
  EnrichedPlayer,
} from "../utils/playerAnalytics";
import { calcTeamHealth, suggestCaptain, TeamHealth } from "./teamAdvisorService";

// ─── Output types ─────────────────────────────────────────────────────────────

export interface PlannerPlayerSummary {
  player_id: string;
  player_name: string;
  team_id: string;
  current_price: number;
  form: string;
  season_average_fantasy_points: number;
  value_per_credit: number;
}

export interface PlannerTeamSnapshot {
  players: PlannerPlayerSummary[];
  projected_team_health: TeamHealth;
  total_salary: number;
  remaining_budget: number;
  suggested_captain: PlannerPlayerSummary;
}

export interface PlannerComparison {
  health_change: number;
  budget_change: number;
  average_points_change: number;
  value_change: number;
  captain_changed: boolean;
  transfer_summary: string;
}

export interface PlannerResult {
  current_team: PlannerTeamSnapshot;
  simulated_team: PlannerTeamSnapshot;
  comparison: PlannerComparison;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toSummary(p: EnrichedPlayer): PlannerPlayerSummary {
  return {
    player_id: p.player_id,
    player_name: p.full_name,
    team_id: p.team_id,
    current_price: p.current_price,
    form: p.form,
    season_average_fantasy_points: p.season_average_fantasy_points,
    value_per_credit: p.value_per_credit,
  };
}

function teamAvgPoints(players: EnrichedPlayer[]): number {
  if (players.length === 0) return 0;
  return (
    Math.round(
      (players.reduce((s, p) => s + p.season_average_fantasy_points, 0) /
        players.length) *
        100
    ) / 100
  );
}

function teamAvgValue(players: EnrichedPlayer[]): number {
  if (players.length === 0) return 0;
  return (
    Math.round(
      (players.reduce((s, p) => s + p.value_per_credit, 0) / players.length) *
        100
    ) / 100
  );
}

// ─── Main function ─────────────────────────────────────────────────────────────

export async function simulateTransfer(
  user_id: string,
  remove_player_id: string,
  add_player_id: string
): Promise<PlannerResult> {
  // ── 1. Validate inputs ──────────────────────────────────────────────────────
  if (!remove_player_id || !add_player_id) {
    throw new Error("Both remove_player_id and add_player_id are required.");
  }
  if (remove_player_id === add_player_id) {
    throw new Error("The player being added must be different from the one being removed.");
  }

  // ── 2. Find active week and user lineup ─────────────────────────────────────
  const [allWeeks, lineupRows, lineupPlayerRows] = await Promise.all([
    getSheetData("Weekly_Gameweek"),
    getSheetData("User_Lineups"),
    getSheetData("Lineup_Players"),
  ]);

  const activeWeek =
    allWeeks
      .filter((w) => String(w.is_locked).toUpperCase() === "TRUE")
      .sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime())[0] ||
    allWeeks.sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime())[0];

  if (!activeWeek) throw new Error("No active gameweek found.");

  const userLineup = lineupRows.find(
    (l) =>
      String(l.user_id) === String(user_id) &&
      String(l.week_id) === String(activeWeek.week_id)
  );
  if (!userLineup) throw new Error("NO_LINEUP");

  const lineupPlayerIds = lineupPlayerRows
    .filter((lp) => String(lp.lineup_id) === String(userLineup.lineup_id))
    .map((lp) => lp.player_id);

  // ── 3. Analytics — 3 parallel reads ────────────────────────────────────────
  const [allPlayers, allStats, priceHistory, budgetCapStr] = await Promise.all([
    getSheetData("Players"),
    getSheetData("Player_Stats"),
    getSheetData("Price_History"),
    getSetting("budget_cap", "100"),
  ]);

  const budgetCap = Number(budgetCapStr);
  const movementMap = buildPriceMovementMap(priceHistory);
  const intelligenceMap = buildPlayerIntelligenceMap(allStats);
  const allEnriched = enrichPlayers(allPlayers, movementMap, intelligenceMap);

  // ── 4. Validate the transfer ─────────────────────────────────────────────────

  const currentLineup = allEnriched.filter((p) =>
    lineupPlayerIds.includes(p.player_id)
  );

  const removedPlayer = allEnriched.find((p) => p.player_id === remove_player_id);
  const addedPlayer = allEnriched.find((p) => p.player_id === add_player_id);

  if (!removedPlayer) throw new Error("Player to remove not found.");
  if (!addedPlayer) throw new Error("Player to add not found.");

  if (!lineupPlayerIds.includes(remove_player_id)) {
    throw new Error(`${removedPlayer.full_name} is not in your current lineup.`);
  }

  if (lineupPlayerIds.includes(add_player_id)) {
    throw new Error(`${addedPlayer.full_name} is already in your lineup.`);
  }

  if (String(addedPlayer.status).toLowerCase() !== "active") {
    throw new Error(`${addedPlayer.full_name} is not an active player.`);
  }

  // Salary cap check
  const currentSalary = currentLineup.reduce((s, p) => s + p.current_price, 0);
  const simulatedSalary = currentSalary - removedPlayer.current_price + addedPlayer.current_price;
  if (simulatedSalary > budgetCap) {
    throw new Error(
      `This transfer exceeds the salary cap. Simulated cost: ${simulatedSalary} credits (cap: ${budgetCap}).`
    );
  }

  // Max 2 per team rule
  const simulatedLineup = currentLineup
    .filter((p) => p.player_id !== remove_player_id)
    .concat([addedPlayer]);

  const teamCounts: Record<string, number> = {};
  for (const p of simulatedLineup) {
    teamCounts[p.team_id] = (teamCounts[p.team_id] || 0) + 1;
  }
  if ((teamCounts[addedPlayer.team_id] || 0) > 2) {
    throw new Error(
      `Adding ${addedPlayer.full_name} would give you 3 players from the same team.`
    );
  }

  // ── 5. Build snapshots ───────────────────────────────────────────────────────

  const currentHealth = calcTeamHealth(currentLineup, budgetCap);
  const currentCaptain = suggestCaptain(currentLineup);

  const simulatedHealth = calcTeamHealth(simulatedLineup, budgetCap);
  const simulatedCaptain = suggestCaptain(simulatedLineup);

  const currentRemainingBudget = budgetCap - currentSalary;
  const simulatedRemainingBudget = budgetCap - simulatedSalary;

  const currentSnapshot: PlannerTeamSnapshot = {
    players: currentLineup.map(toSummary),
    projected_team_health: currentHealth,
    total_salary: currentSalary,
    remaining_budget: currentRemainingBudget,
    suggested_captain: toSummary(currentCaptain),
  };

  const simulatedSnapshot: PlannerTeamSnapshot = {
    players: simulatedLineup.map(toSummary),
    projected_team_health: simulatedHealth,
    total_salary: simulatedSalary,
    remaining_budget: simulatedRemainingBudget,
    suggested_captain: toSummary(simulatedCaptain),
  };

  // ── 6. Comparison ────────────────────────────────────────────────────────────

  const healthChange = simulatedHealth.score - currentHealth.score;
  const budgetChange = simulatedRemainingBudget - currentRemainingBudget;
  const avgPtsChange =
    Math.round(
      (teamAvgPoints(simulatedLineup) - teamAvgPoints(currentLineup)) * 100
    ) / 100;
  const valueChange =
    Math.round(
      (teamAvgValue(simulatedLineup) - teamAvgValue(currentLineup)) * 100
    ) / 100;
  const captainChanged = simulatedCaptain.player_id !== currentCaptain.player_id;

  const transferSummary = [
    `Replacing ${removedPlayer.full_name} with ${addedPlayer.full_name}.`,
    healthChange > 0
      ? `Results: +${healthChange} Team Health`
      : healthChange < 0
      ? `Results: ${healthChange} Team Health`
      : "Team Health unchanged.",
    valueChange > 0 ? `+${valueChange.toFixed(2)} Avg Value/cr` : valueChange < 0 ? `${valueChange.toFixed(2)} Avg Value/cr` : "",
    avgPtsChange > 0 ? `+${avgPtsChange.toFixed(1)} Projected Fantasy Avg` : avgPtsChange < 0 ? `${avgPtsChange.toFixed(1)} Projected Fantasy Avg` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return {
    current_team: currentSnapshot,
    simulated_team: simulatedSnapshot,
    comparison: {
      health_change: healthChange,
      budget_change: budgetChange,
      average_points_change: avgPtsChange,
      value_change: valueChange,
      captain_changed: captainChanged,
      transfer_summary: transferSummary,
    },
  };
}
