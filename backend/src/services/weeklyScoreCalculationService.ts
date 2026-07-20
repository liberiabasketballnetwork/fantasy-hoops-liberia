import { v4 as uuidv4 } from "uuid";
import { getSheetData, appendRow, updateRow } from "./sheetsService";
import { createCalculationBackup } from "./calculationBackupService";
import { logAdminAction } from "./adminActionLogger";
import { calculatePlayerFantasyScore, SCORING_RULES } from "./scoringEngine";

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
    allGames.filter((g) => {
      if (String(g.status).toLowerCase() !== "completed") return false;
      const d = new Date(g.game_date);
      return d >= startDate && d <= endDate;
    }).map((g) => g.game_id)
  );

  const allPlayerStats = await getSheetData("Player_Stats");

  // ── ARCH-001: recompute fantasy_points from raw stats using the canonical
  // formula. Never trust the stored fantasy_points value — it may have been
  // written by a different formula (e.g. importRoutes used different multipliers).
  const cumulativeByPlayer: Record<string, number> = {};
  let mismatchWarnings = 0;

  for (const stat of allPlayerStats) {
    if (!validGameIds.has(stat.game_id)) continue;

    const canonical = calculatePlayerFantasyScore({
      points:    Number(stat.points    || 0),
      rebounds:  Number(stat.rebounds  || 0),
      assists:   Number(stat.assists   || 0),
      steals:    Number(stat.steals    || 0),
      blocks:    Number(stat.blocks    || 0),
      turnovers: Number(stat.turnovers || 0),
    });

    // Audit: warn if stored value diverges from canonical calculation
    const stored = Number(stat.fantasy_points || 0);
    if (Math.abs(canonical - stored) > 0.01) {
      console.warn(
        `[ScoringAudit] Mismatch for player ${stat.player_id} ` +
        `game ${stat.game_id}: stored=${stored.toFixed(2)} ` +
        `canonical=${canonical.toFixed(2)} diff=${(canonical - stored).toFixed(2)}`
      );
      mismatchWarnings++;
    }

    // Always use canonical value — never the stored one
    cumulativeByPlayer[stat.player_id] = (cumulativeByPlayer[stat.player_id] || 0) + canonical;
  }

  if (mismatchWarnings > 0) {
    console.warn(`[ScoringAudit] ${mismatchWarnings} stat row(s) had mismatched fantasy_points. Canonical values used throughout.`);
  }

  const allLineupPlayers = await getSheetData("Lineup_Players");
  const userScores: { user_id: string; score: number }[] = [];

  for (const lineup of weekLineups) {
    const playersInLineup = allLineupPlayers.filter((lp) => String(lp.lineup_id) === String(lineup.lineup_id));
    let totalUserScore = 0;
    for (const lp of playersInLineup) {
      let playerWeeklyScore = cumulativeByPlayer[lp.player_id] || 0;
      if (String(lp.player_id) === String(lineup.captain_player_id)) {
        playerWeeklyScore *= SCORING_RULES.CAPTAIN_MULTIPLIER;
      }
      totalUserScore += playerWeeklyScore;
    }
    userScores.push({ user_id: lineup.user_id, score: totalUserScore });
  }

  const ranked: LeaderboardResultRow[] = [...userScores]
    .sort((a, b) => b.score - a.score)
    .map((entry, index) => ({ ...entry, rank: index + 1 }));

  for (const entry of ranked) {
    await appendRow("Leaderboard", { leaderboard_id: uuidv4(), week_id, user_id: entry.user_id, score: entry.score.toFixed(2), rank: entry.rank });
  }

  await updateRow("Weekly_Gameweek", "week_id", week_id, { scores_calculated: "TRUE" });

  await logAdminAction({ admin_id, action_type: "CALCULATE_WEEKLY_SCORES", entity_type: "WEEK", entity_id: week_id, details: `Weekly score calculation completed for ${ranked.length} user(s). Mismatch warnings: ${mismatchWarnings}`, status: "success" });

  return { ranked, backup_id };
}

