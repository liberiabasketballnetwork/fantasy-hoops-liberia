import { v4 as uuidv4 } from "uuid";
import {
  getSheetData,
  appendRow,
  findRowById,
  sortLeaderboard,
} from "./sheetsService";

// ─── Canonical scoring multipliers ────────────────────────────────────────────
// This is the SINGLE SOURCE OF TRUTH for all fantasy point calculations.
// No other file may hardcode these values.

export const SCORING_RULES = {
  POINTS:    1,
  REBOUNDS:  1.5,
  ASSISTS:   2,
  STEALS:    3,
  BLOCKS:    3,
  TURNOVERS: -1,
  CAPTAIN_MULTIPLIER: 2,
} as const;

/**
 * Calculate fantasy points for a single player performance.
 * This is the ONLY function in the entire codebase that computes fantasy points.
 * All importers, score calculators, and admin tools must call this function.
 *
 * Formula:
 *   FP = (PTS × 1) + (REB × 1.5) + (AST × 2) + (STL × 3) + (BLK × 3) − (TOV × 1)
 *
 * @example calculatePlayerFantasyScore({ points:19, rebounds:18, assists:2, steals:0, blocks:1, turnovers:0 })
 * => 53.0   (19×1 + 18×1.5 + 2×2 + 0×3 + 1×3 − 0×1)
 */
export function calculatePlayerFantasyScore(stat: {
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
}): number {
  return (
    Number(stat.points    || 0) * SCORING_RULES.POINTS    +
    Number(stat.rebounds  || 0) * SCORING_RULES.REBOUNDS  +
    Number(stat.assists   || 0) * SCORING_RULES.ASSISTS   +
    Number(stat.steals    || 0) * SCORING_RULES.STEALS    +
    Number(stat.blocks    || 0) * SCORING_RULES.BLOCKS    +
    Number(stat.turnovers || 0) * SCORING_RULES.TURNOVERS
  );
}

/**
 * Recalculate fantasy points for every player who has stats logged for the given week,
 * then recompute every user's lineup total (applying the 2x captain multiplier),
 * and rebuild the leaderboard for that week.
 *
 * Triggered by: POST /admin/calculate-scores
 */
export async function calculateScoresForWeek(weekId: string) {
  const allStats = await getSheetData("Player_Stats", false);
  const allGames = await getSheetData("Games", false);

  // Map game_id -> only games that belong to this week is not directly modeled,
  // so we rely on admin entering stats for the relevant week's games.
  // For MVP simplicity, we treat ALL Player_Stats rows tied to games as belonging
  // to whichever week is currently being calculated (admin enters stats per week).
  const gameIdsThisWeek = new Set(allGames.map((g) => g.game_id));

  const relevantStats = allStats.filter((s) => gameIdsThisWeek.has(s.game_id));

  // Aggregate stats per player (in case a player has multiple games in the week)
  const perPlayerTotals: Record<string, any> = {};
  for (const s of relevantStats) {
    const pid = s.player_id;
    if (!perPlayerTotals[pid]) {
      perPlayerTotals[pid] = {
        points: 0,
        rebounds: 0,
        assists: 0,
        steals: 0,
        blocks: 0,
        turnovers: 0,
      };
    }
    perPlayerTotals[pid].points += Number(s.points || 0);
    perPlayerTotals[pid].rebounds += Number(s.rebounds || 0);
    perPlayerTotals[pid].assists += Number(s.assists || 0);
    perPlayerTotals[pid].steals += Number(s.steals || 0);
    perPlayerTotals[pid].blocks += Number(s.blocks || 0);
    perPlayerTotals[pid].turnovers += Number(s.turnovers || 0);
  }

  // Write Fantasy_Scoring rows
  const fantasyPointsByPlayer: Record<string, number> = {};
  for (const playerId of Object.keys(perPlayerTotals)) {
    const fp = calculatePlayerFantasyScore(perPlayerTotals[playerId]);
    fantasyPointsByPlayer[playerId] = fp;
    await appendRow("Fantasy_Scoring", {
      score_id: uuidv4(),
      player_id: playerId,
      week_id: weekId,
      fantasy_points: fp.toFixed(2),
    });
  }

  // Recompute every lineup submitted for this week
  const lineups = await getSheetData("User_Lineups", false);
  const weekLineups = lineups.filter((l) => String(l.week_id) === String(weekId));
  const lineupPlayers = await getSheetData("Lineup_Players", false);

  const leaderboardEntries: { user_id: string; score: number }[] = [];

  for (const lineup of weekLineups) {
    const playersInLineup = lineupPlayers.filter(
      (lp) => String(lp.lineup_id) === String(lineup.lineup_id)
    );

    let total = 0;
    for (const lp of playersInLineup) {
      let fp = fantasyPointsByPlayer[lp.player_id] || 0;
      if (String(lp.player_id) === String(lineup.captain_player_id)) {
        fp = fp * 2;
      }
      total += fp;
    }

    leaderboardEntries.push({ user_id: lineup.user_id, score: total });
  }

  // Rebuild leaderboard for the week
  const ranked = sortLeaderboard(
    leaderboardEntries.map((e) => ({ ...e, week_id: weekId }))
  );

  for (const entry of ranked) {
    await appendRow("Leaderboard", {
      leaderboard_id: uuidv4(),
      week_id: weekId,
      user_id: entry.user_id,
      score: entry.score.toFixed(2),
      rank: entry.rank,
    });
  }

  return ranked;
}
