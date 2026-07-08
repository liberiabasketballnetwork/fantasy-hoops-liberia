import { v4 as uuidv4 } from "uuid";
import { getSheetData, appendRow, findRowById } from "./sheetsService";

export interface CalculationBackupPayload {
  leaderboard: any[];
  user_lineups: any[];
  weekly_gameweek: any | null;
  player_prices?: { player_id: string; fantasy_price: number; full_name: string }[];
}

export async function createCalculationBackup(
  week_id: string,
  backup_type: string = "score_calculation"
): Promise<string> {
  if (!week_id) throw new Error("week_id is required to create a calculation backup");

  const [allLeaderboard, allUserLineups, weeklyGameweekRow, allPlayers] = await Promise.all([
    getSheetData("Leaderboard"),
    getSheetData("User_Lineups"),
    findRowById("Weekly_Gameweek", "week_id", week_id),
    getSheetData("Players"),
  ]);

  const leaderboardForWeek = allLeaderboard.filter((row) => String(row.week_id) === String(week_id));
  const userLineupsForWeek = allUserLineups.filter((row) => String(row.week_id) === String(week_id));

  // Always snapshot current player prices so rollback can restore them
  // regardless of whether this is a score backup or price backup.
  const playerPrices = allPlayers.map((p) => ({
    player_id: p.player_id,
    fantasy_price: Number(p.fantasy_price || 0),
    full_name: p.full_name,
  }));

  const payload: CalculationBackupPayload = {
    leaderboard: leaderboardForWeek,
    user_lineups: userLineupsForWeek,
    weekly_gameweek: weeklyGameweekRow || null,
    player_prices: playerPrices,
  };

  const backup_id = uuidv4();

  await appendRow("Calculation_Backup", {
    backup_id,
    week_id,
    backup_type,
    backup_data: JSON.stringify(payload),
    created_at: new Date().toISOString(),
  });

  return backup_id;
}
