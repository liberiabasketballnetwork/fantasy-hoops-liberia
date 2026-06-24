import { v4 as uuidv4 } from "uuid";
import {
  getSheetData,
  appendRow,
  findRowById,
  sortLeaderboard,
} from "./sheetsService";

/**
 * Scoring rules (per the product spec):
 *  points    x 1
 *  rebounds  x 1.5
 *  assists   x 2
 *  steals    x 3
 *  blocks    x 3
 *  turnovers x -1
 *  captain   => total x 2
 */
export function calculatePlayerFantasyScore(stat: {
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
}): number {
  const score =
    Number(stat.points || 0) * 1 +
    Number(stat.rebounds || 0) * 1.5 +
    Number(stat.assists || 0) * 2 +
    Number(stat.steals || 0) * 3 +
    Number(stat.blocks || 0) * 3 -
    Number(stat.turnovers || 0) * 1;
  return score;
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
