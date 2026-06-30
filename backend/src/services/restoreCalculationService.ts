import { getSheetData, appendRow, deleteRow, updateRow } from "./sheetsService";
import { CalculationBackupPayload } from "./calculationBackupService";

/**
 * Restores the most recent Calculation_Backup for a given week, completely
 * overwriting current Leaderboard and User_Lineups rows for that week with
 * the backed-up versions, and restoring the Weekly_Gameweek row's fields.
 *
 * This does NOT touch Lineup_Players, since the restored User_Lineups rows
 * carry the exact same lineup_id values they had when backed up, so the
 * existing Lineup_Players links remain valid automatically - no need to
 * delete or recreate them.
 *
 * This is a standalone, additive safety net. It does not call into or
 * modify the HTML importer, player matching system, Player_Stats, Games,
 * Import_Log, or any auth/registration/login code.
 */
export async function rollbackLastCalculation(week_id: string): Promise<{
  backup_id: string;
  restored_leaderboard_count: number;
  restored_lineup_count: number;
  weekly_gameweek_restored: boolean;
}> {
  if (!week_id) {
    throw new Error("week_id is required to roll back a calculation");
  }

  // STEP 1: find the latest backup record for this week.
  const allBackups = await getSheetData("Calculation_Backup", false);
  const backupsForWeek = allBackups.filter(
    (b) =>
      String(b.week_id) === String(week_id) &&
      String(b.backup_type) === "score_calculation"
  );

  if (backupsForWeek.length === 0) {
    throw new Error("No backup found for this week. Nothing to roll back.");
  }

  // Pick the most recently created backup (sort by created_at, take last).
  const latestBackup = backupsForWeek.sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )[backupsForWeek.length - 1];

  // STEP 2: parse the JSON backup payload.
  let payload: CalculationBackupPayload;
  try {
    payload = JSON.parse(latestBackup.backup_data);
  } catch {
    throw new Error("Backup data for this week is corrupted and could not be restored.");
  }

  // STEP 3 / STEP 4: restore Leaderboard - delete all current rows for this
  // week, then re-insert the exact rows captured in the backup.
  const currentLeaderboard = await getSheetData("Leaderboard", false);
  const currentLeaderboardForWeek = currentLeaderboard.filter(
    (row) => String(row.week_id) === String(week_id)
  );
  for (const row of currentLeaderboardForWeek) {
    await deleteRow("Leaderboard", "leaderboard_id", row.leaderboard_id);
  }
  for (const row of payload.leaderboard || []) {
    await appendRow("Leaderboard", row);
  }

  // Restore User_Lineups the same way - delete current week's rows, then
  // re-insert the backed-up ones (same lineup_id values, so Lineup_Players
  // links stay intact without needing any changes there).
  const currentLineups = await getSheetData("User_Lineups", false);
  const currentLineupsForWeek = currentLineups.filter(
    (row) => String(row.week_id) === String(week_id)
  );
  for (const row of currentLineupsForWeek) {
    await deleteRow("User_Lineups", "lineup_id", row.lineup_id);
  }
  for (const row of payload.user_lineups || []) {
    await appendRow("User_Lineups", row);
  }

  // Restore the Weekly_Gameweek row's fields exactly as they were backed up.
  let weeklyGameweekRestored = false;
  if (payload.weekly_gameweek) {
    await updateRow("Weekly_Gameweek", "week_id", week_id, payload.weekly_gameweek);
    weeklyGameweekRestored = true;
  }

  return {
    backup_id: latestBackup.backup_id,
    restored_leaderboard_count: (payload.leaderboard || []).length,
    restored_lineup_count: (payload.user_lineups || []).length,
    weekly_gameweek_restored: weeklyGameweekRestored,
  };
}
