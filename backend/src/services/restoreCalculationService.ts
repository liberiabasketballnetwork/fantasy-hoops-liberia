import { getSheetData, appendRow, deleteRow, updateRow, batchUpdateRows } from "./sheetsService";
import { CalculationBackupPayload } from "./calculationBackupService";
import { logAdminAction } from "./adminActionLogger";

export async function rollbackLastCalculation(
  week_id: string,
  admin_id: string = "admin"
): Promise<{
  backup_id: string;
  restored_leaderboard_count: number;
  restored_lineup_count: number;
  weekly_gameweek_restored: boolean;
  restored_player_prices_count: number;
  removed_price_history_count: number;
}> {
  if (!week_id) throw new Error("week_id is required to roll back a calculation");

  // STEP 1: find the latest backup for this week.
  const allBackups = await getSheetData("Calculation_Backup", false);
  const backupsForWeek = allBackups.filter(
    (b) => String(b.week_id) === String(week_id) && String(b.backup_type) === "score_calculation"
  );
  if (backupsForWeek.length === 0) throw new Error("No backup found for this week. Nothing to roll back.");

  const latestBackup = backupsForWeek.sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )[backupsForWeek.length - 1];

  let payload: CalculationBackupPayload;
  try {
    payload = JSON.parse(latestBackup.backup_data);
  } catch {
    throw new Error("Backup data for this week is corrupted and could not be restored.");
  }

  // STEP 2: restore player prices FIRST (atomic - if this fails, nothing else changes).
  // Only attempt if the backup contains player_prices.
  let restoredPlayerPricesCount = 0;
  if (payload.player_prices && payload.player_prices.length > 0) {
    const allPlayers = await getSheetData("Players", false);

    // Build batch update: match each backed-up price to its current row index.
    const batchUpdates: { rowNumber: number; data: Record<string, any> }[] = [];
    for (let i = 0; i < allPlayers.length; i++) {
      const player = allPlayers[i];
      const backedUp = payload.player_prices.find((p) => p.player_id === player.player_id);
      if (!backedUp) continue;
      if (Number(player.fantasy_price) === backedUp.fantasy_price) continue; // already correct

      batchUpdates.push({
        rowNumber: i + 2, // +1 for header, +1 for 0-index
        data: { ...player, fantasy_price: backedUp.fantasy_price },
      });
      restoredPlayerPricesCount++;
    }

    // This must succeed before we touch anything else.
    if (batchUpdates.length > 0) {
      await batchUpdateRows("Players", batchUpdates);
    }
  }

  // STEP 3: delete Price_History rows for this week.
  let removedPriceHistoryCount = 0;
  try {
    const allPriceHistory = await getSheetData("Price_History", false);
    const weekPriceHistory = allPriceHistory.filter((r) => String(r.week_id) === String(week_id));
    for (const row of weekPriceHistory) {
      await deleteRow("Price_History", "price_history_id", row.price_history_id);
      removedPriceHistoryCount++;
    }
  } catch (err) {
    console.error("rollback: failed to remove Price_History rows:", err);
    // Non-fatal: log but continue with the rest of the rollback.
  }

  // STEP 4: restore Leaderboard.
  const currentLeaderboard = await getSheetData("Leaderboard", false);
  for (const row of currentLeaderboard.filter((r) => String(r.week_id) === String(week_id))) {
    await deleteRow("Leaderboard", "leaderboard_id", row.leaderboard_id);
  }
  for (const row of payload.leaderboard || []) {
    await appendRow("Leaderboard", row);
  }

  // STEP 5: restore User_Lineups.
  const currentLineups = await getSheetData("User_Lineups", false);
  for (const row of currentLineups.filter((r) => String(r.week_id) === String(week_id))) {
    await deleteRow("User_Lineups", "lineup_id", row.lineup_id);
  }
  for (const row of payload.user_lineups || []) {
    await appendRow("User_Lineups", row);
  }

  // STEP 6: restore Weekly_Gameweek fields including prices_updated.
  let weeklyGameweekRestored = false;
  if (payload.weekly_gameweek) {
    await updateRow("Weekly_Gameweek", "week_id", week_id, {
      ...payload.weekly_gameweek,
      prices_updated: "FALSE",
    });
    weeklyGameweekRestored = true;
  }

  const result = {
    backup_id: latestBackup.backup_id,
    restored_leaderboard_count: (payload.leaderboard || []).length,
    restored_lineup_count: (payload.user_lineups || []).length,
    weekly_gameweek_restored: weeklyGameweekRestored,
    restored_player_prices_count: restoredPlayerPricesCount,
    removed_price_history_count: removedPriceHistoryCount,
  };

  // STEP 7: audit log.
  await logAdminAction({
    admin_id,
    action_type: "ROLLBACK_PRICES",
    entity_type: "GAMEWEEK",
    entity_id: week_id,
    details: `Full rollback: ${restoredPlayerPricesCount} player prices restored, ${removedPriceHistoryCount} price history rows removed`,
    status: "success",
  });

  return result;
}
