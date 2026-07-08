import { v4 as uuidv4 } from "uuid";
import { getSheetData, appendRow, updateRow } from "./sheetsService";
import { createCalculationBackup } from "./calculationBackupService";
import { logAdminAction } from "./adminActionLogger";

export class WeeklyScoreCalculationError extends Error {}

interface LeaderboardResultRow { user_id: string; score: number; rank: number; }

export async function calculateWeeklyScores(week_id: string, admin_id: string = "admin"): Promise<{ ranked: LeaderboardResultRow[]; backup_id: string; }> {
  if (!week_id) throw new WeeklyScoreCalculationError("week_id is required");

  const allWeeks = await getSheetData("Weekly_Gameweek");
  const week = allWeeks.find((w) => String(w.week_id) === String(week_id));
  if (!week) throw new WeeklyScoreCalculationError("Gameweek not found.");

  if (String(week.scores_calculated).toUpperCase() === "TRUE") throw new WeeklyScoreCalculationError("Scores already calculated for this week.");

  let backup_id: string;
  try {
    backup_id = await createCalculationBackup(week_id, "score_calculation");
  } catch (err) {
    throw new WeeklyScoreCalculationError("Could not create a safety backup before calculation. Calculation was aborted - nothing was changed.");
  }

  const allLineups = await getSheetData("User_Lineups");
  const weekLineups = allLineups.filter((l) => String(l.week_id) === String(week_id));
  const allGames = await getSheetData("Games");
  const startDate = new Date(week.start_date);
  const endDate = new Date(week.end_date);
  endDate.setHours(23, 59, 59, 999);

  const validGameIds = new Set(
    allGames.filter((g) => { if (String(g.status).toLowerCase() !== "completed") return false; const d = new Date(g.game_date); return d >= startDate && d <= endDate; }).map((g) => g.game_id)
  );

  const allPlayerStats = await getSheetData("Player_Stats");
  const cumulativeByPlayer: Record<string, number> = {};
  for (const stat of allPlayerStats) {
    if (!validGameIds.has(stat.game_id)) continue;
    cumulativeByPlayer[stat.player_id] = (cumulativeByPlayer[stat.player_id] || 0) + Number(stat.fantasy_points || 0);
  }

  const allLineupPlayers = await getSheetData("Lineup_Players");
  const userScores: { user_id: string; score: number }[] = [];

  for (const lineup of weekLineups) {
    const playersInLineup = allLineupPlayers.filter((lp) => String(lp.lineup_id) === String(lineup.lineup_id));
    let totalUserScore = 0;
    for (const lp of playersInLineup) {
      let playerWeeklyScore = cumulativeByPlayer[lp.player_id] || 0;
      if (String(lp.player_id) === String(lineup.captain_player_id)) playerWeeklyScore *= 2;
      totalUserScore += playerWeeklyScore;
    }
    userScores.push({ user_id: lineup.user_id, score: totalUserScore });
  }

  const ranked: LeaderboardResultRow[] = [...userScores].sort((a, b) => b.score - a.score).map((entry, index) => ({ ...entry, rank: index + 1 }));

  for (const entry of ranked) {
    await appendRow("Leaderboard", { leaderboard_id: uuidv4(), week_id, user_id: entry.user_id, score: entry.score.toFixed(2), rank: entry.rank });
  }

  await updateRow("Weekly_Gameweek", "week_id", week_id, { scores_calculated: "TRUE" });

  await logAdminAction({ admin_id, action_type: "CALCULATE_WEEKLY_SCORES", entity_type: "WEEK", entity_id: week_id, details: `Weekly score calculation completed for ${ranked.length} user(s)`, status: "success" });

  return { ranked, backup_id };
}
