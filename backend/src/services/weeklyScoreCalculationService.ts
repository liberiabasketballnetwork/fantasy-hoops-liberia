import { v4 as uuidv4 } from "uuid";
import { getSheetData, appendRow, updateRow } from "./sheetsService";
import { createCalculationBackup } from "./calculationBackupService";

/**
 * Weekly score calculation engine.
 *
 * This is a SEPARATE, new engine from scoringEngine.ts (which powers the
 * existing "Calculate Scores" button and Fantasy_Scoring sheet). That file
 * and its formula are not touched or used here. This engine instead
 * implements the locked gameplay rules from the spec:
 *  - cumulative fantasy_points across all of a player's completed games
 *    within the week's date range
 *  - captain doubles their total
 *  - zero completed games in the week => score 0 (DNP)
 *  - manual trigger only, with backup-first and a double-calculation guard
 *
 * Captain status is read from the existing User_Lineups.captain_player_id
 * field (comparing it to each Lineup_Players row's player_id), rather than
 * adding a new is_captain column to Lineup_Players - that field already
 * fully captures captain status today, and avoids touching the lineup
 * submission system, which is on the "do not modify" list.
 *
 * The Leaderboard sheet's existing "score" column (not "total_score") is
 * used here for consistency with the public Leaderboard page and admin
 * leaderboard tools, which already read leaderboard.score today.
 */

export class WeeklyScoreCalculationError extends Error {}

interface LeaderboardResultRow {
  user_id: string;
  score: number;
  rank: number;
}

export async function calculateWeeklyScores(week_id: string): Promise<{
  ranked: LeaderboardResultRow[];
  backup_id: string;
}> {
  if (!week_id) {
    throw new WeeklyScoreCalculationError("week_id is required");
  }

  const allWeeks = await getSheetData("Weekly_Gameweek");
  const week = allWeeks.find((w) => String(w.week_id) === String(week_id));
  if (!week) {
    throw new WeeklyScoreCalculationError("Gameweek not found.");
  }

  if (String(week.scores_calculated).toUpperCase() === "TRUE") {
    throw new WeeklyScoreCalculationError("Scores already calculated for this week.");
  }

  let backup_id: string;
  try {
    backup_id = await createCalculationBackup(week_id, "score_calculation");
  } catch (err) {
    console.error("Weekly score calculation aborted - backup failed:", err);
    throw new WeeklyScoreCalculationError(
      "Could not create a safety backup before calculation. Calculation was aborted - nothing was changed."
    );
  }

  const allLineups = await getSheetData("User_Lineups");
  const weekLineups = allLineups.filter((l) => String(l.week_id) === String(week_id));

  const allGames = await getSheetData("Games");
  const startDate = new Date(week.start_date);
  const endDate = new Date(week.end_date);
  endDate.setHours(23, 59, 59, 999);

  const validGameIds = new Set(
    allGames
      .filter((g) => {
        if (String(g.status).toLowerCase() !== "completed") return false;
        const gameDate = new Date(g.game_date);
        return gameDate >= startDate && gameDate <= endDate;
      })
      .map((g) => g.game_id)
  );

  const allPlayerStats = await getSheetData("Player_Stats");
  const cumulativeByPlayer: Record<string, number> = {};

  for (const stat of allPlayerStats) {
    if (!validGameIds.has(stat.game_id)) continue;
    const pid = stat.player_id;
    const points = Number(stat.fantasy_points || 0);
    cumulativeByPlayer[pid] = (cumulativeByPlayer[pid] || 0) + points;
  }

  const allLineupPlayers = await getSheetData("Lineup_Players");

  const userScores: { user_id: string; score: number }[] = [];

  for (const lineup of weekLineups) {
    const playersInLineup = allLineupPlayers.filter(
      (lp) => String(lp.lineup_id) === String(lineup.lineup_id)
    );

    let totalUserScore = 0;

    for (const lp of playersInLineup) {
      let playerWeeklyScore = cumulativeByPlayer[lp.player_id] || 0;

      const isCaptain = String(lp.player_id) === String(lineup.captain_player_id);
      if (isCaptain) {
        playerWeeklyScore = playerWeeklyScore * 2;
      }

      totalUserScore += playerWeeklyScore;
    }

    userScores.push({ user_id: lineup.user_id, score: totalUserScore });
  }

  const ranked: LeaderboardResultRow[] = [...userScores]
    .sort((a, b) => b.score - a.score)
    .map((entry, index) => ({ ...entry, rank: index + 1 }));

  for (const entry of ranked) {
    await appendRow("Leaderboard", {
      leaderboard_id: uuidv4(),
      week_id,
      user_id: entry.user_id,
      score: entry.score.toFixed(2),
      rank: entry.rank,
    });
  }

  await updateRow("Weekly_Gameweek", "week_id", week_id, {
    scores_calculated: "TRUE",
  });

  return { ranked, backup_id };
}
