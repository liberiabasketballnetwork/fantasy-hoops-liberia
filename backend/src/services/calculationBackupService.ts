import { v4 as uuidv4 } from "uuid";
import { getSheetData, appendRow, findRowById } from "./sheetsService";

/**
 * Rollback protection for weekly score calculation.
 *
 * This service does ONE thing: snapshot the current state of everything a
 * future score-calculation step would touch, so that state can be restored
 * if a calculation run needs to be undone. It does NOT perform any score
 * calculation itself, and is not yet wired into any existing route - it's
 * a standalone, additive safety net ready for the calculation feature to
 * call before it runs.
 *
 * Nothing in this file modifies Users, Players, Player_Stats, Import_Log,
 * the HTML importer, matching system, or auth in any way.
 */

export interface CalculationBackupPayload {
  leaderboard: any[];
  user_lineups: any[];
  weekly_gameweek: any | null;
}

/**
 * Creates a backup row in Calculation_Backup capturing:
 *  A) Leaderboard entries for the given week
 *  B) User_Lineups records for the given week
 *  C) The Weekly_Gameweek row for that week
 *
 * Returns the new backup_id.
 */
export async function createCalculationBackup(
  week_id: string,
  backup_type: string = "score_calculation"
): Promise<string> {
  if (!week_id) {
    throw new Error("week_id is required to create a calculation backup");
  }

  const [allLeaderboard, allUserLineups, weeklyGameweekRow] = await Promise.all([
    getSheetData("Leaderboard"),
    getSheetData("User_Lineups"),
    findRowById("Weekly_Gameweek", "week_id", week_id),
  ]);

  const leaderboardForWeek = allLeaderboard.filter(
    (row) => String(row.week_id) === String(week_id)
  );
  const userLineupsForWeek = allUserLineups.filter(
    (row) => String(row.week_id) === String(week_id)
  );

  const payload: CalculationBackupPayload = {
    leaderboard: leaderboardForWeek,
    user_lineups: userLineupsForWeek,
    weekly_gameweek: weeklyGameweekRow || null,
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
