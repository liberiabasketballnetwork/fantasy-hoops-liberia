import { v4 as uuidv4 } from "uuid";
import { getSheetData, appendRow, updateRow, batchUpdateRows } from "./sheetsService";
import { logAdminAction } from "./adminActionLogger";

/**
 * Weekly price adjustment engine for Fantasy Hoops Liberia.
 *
 * Pricing rules (per spec):
 *   fantasy_points >= 30  → +2 credits
 *   fantasy_points 20-29  → +1 credit
 *   fantasy_points 10-19  → no change
 *   fantasy_points <  10  → -1 credit
 *
 * Price floor = 5. Price ceiling = 30.
 * Players with no Player_Stats for the week are ignored (no change).
 * Runs once per week — guarded by Weekly_Gameweek.prices_updated flag.
 *
 * Does NOT touch scoring, lineup, rollback, or any auth logic.
 */

const PRICE_FLOOR = 5;
const PRICE_CEILING = 30;

export class PriceAdjustmentError extends Error {}

function priceAdjustment(weeklyPoints: number): number {
  if (weeklyPoints >= 30) return 2;
  if (weeklyPoints >= 20) return 1;
  if (weeklyPoints >= 10) return 0;
  return -1;
}

export interface PriceAdjustmentResult {
  updated_count: number;
  no_change_count: number;
  ignored_count: number;
  changes: {
    player_id: string;
    full_name: string;
    old_price: number;
    new_price: number;
    weekly_fantasy_points: number;
  }[];
}

export async function adjustPlayerPrices(
  week_id: string,
  admin_id: string = "admin"
): Promise<PriceAdjustmentResult> {
  if (!week_id) throw new PriceAdjustmentError("week_id is required");

  // Verify the week exists.
  const allWeeks = await getSheetData("Weekly_Gameweek");
  const week = allWeeks.find((w) => String(w.week_id) === String(week_id));
  if (!week) throw new PriceAdjustmentError("Gameweek not found.");

  // Log what the service actually reads from the sheet so mismatches are
  // immediately visible in Render logs rather than failing silently.
  console.log("[priceAdjustmentService] week row read from sheet:", {
    week_id: week.week_id,
    scores_calculated: week.scores_calculated,
    prices_updated: week.prices_updated,
    start_date: week.start_date,
    end_date: week.end_date,
  });

  // Prevent double adjustment for the same week.
  if (String(week.prices_updated).toUpperCase() === "TRUE") {
    throw new PriceAdjustmentError("Player prices have already been updated for this week.");
  }

  // Require scores to have been calculated first.
  if (String(week.scores_calculated).toUpperCase() !== "TRUE") {
    console.log("[priceAdjustmentService] blocked: scores_calculated =", week.scores_calculated);
    throw new PriceAdjustmentError(
      "Weekly scores must be calculated before adjusting prices. Run 'Calculate Weekly Scores' first."
    );
  }

  // Scope to completed games within the week's date range.
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

  console.log("[priceAdjustmentService] validGameIds in week:", [...validGameIds]);

  // Sum fantasy_points from Player_Stats for each player, scoped to the week.
  const allStats = await getSheetData("Player_Stats");
  const cumulativeByPlayer: Record<string, number> = {};
  for (const stat of allStats) {
    if (!validGameIds.has(stat.game_id)) continue;
    const pid = stat.player_id;
    cumulativeByPlayer[pid] = (cumulativeByPlayer[pid] || 0) + Number(stat.fantasy_points || 0);
  }

  console.log("[priceAdjustmentService] players with stats this week:", Object.keys(cumulativeByPlayer).length);

  // Load all players once. We already have their full row data so we can
  // build the complete updated row without any extra reads — this keeps
  // the total API call count to O(1) rather than O(n players).
  const allPlayers = await getSheetData("Players");

  const result: PriceAdjustmentResult = {
    updated_count: 0,
    no_change_count: 0,
    ignored_count: 0,
    changes: [],
  };

  // Collect all updates so we can write them in a single batch API call.
  const playerBatchUpdates: { rowNumber: number; data: Record<string, any> }[] = [];
  const priceHistoryRows: Record<string, any>[] = [];

  for (let i = 0; i < allPlayers.length; i++) {
    const player = allPlayers[i];

    if (!(player.player_id in cumulativeByPlayer)) {
      result.ignored_count++;
      continue;
    }

    const weeklyPoints = cumulativeByPlayer[player.player_id];
    const delta = priceAdjustment(weeklyPoints);

    if (delta === 0) {
      result.no_change_count++;
      continue;
    }

    const oldPrice = Number(player.fantasy_price || 0);
    const rawNewPrice = oldPrice + delta;
    const newPrice = Math.max(PRICE_FLOOR, Math.min(PRICE_CEILING, rawNewPrice));

    if (newPrice === oldPrice) {
      result.no_change_count++;
      continue;
    }

    // Row number is i+2 (row 1 is header, array is 0-indexed).
    const updatedPlayer = { ...player, fantasy_price: newPrice };
    playerBatchUpdates.push({ rowNumber: i + 2, data: updatedPlayer });

    priceHistoryRows.push({
      price_history_id: uuidv4(),
      player_id: player.player_id,
      week_id,
      old_price: oldPrice,
      new_price: newPrice,
      weekly_fantasy_points: weeklyPoints.toFixed(2),
      created_at: new Date().toISOString(),
    });

    result.updated_count++;
    result.changes.push({
      player_id: player.player_id,
      full_name: player.full_name,
      old_price: oldPrice,
      new_price: newPrice,
      weekly_fantasy_points: weeklyPoints,
    });
  }

  // Write all player price changes in a single batch API call.
  if (playerBatchUpdates.length > 0) {
    await batchUpdateRows("Players", playerBatchUpdates);
  }

  // Append Price_History rows one at a time (append doesn't support batch
  // natively, but these writes happen after the heavy player update so
  // quota pressure is much lower at this point).
  for (const historyRow of priceHistoryRows) {
    await appendRow("Price_History", historyRow);
  }

  // Mark the week so this can't be run twice.
  await updateRow("Weekly_Gameweek", "week_id", week_id, { prices_updated: "TRUE" });

  // Audit log.
  await logAdminAction({
    admin_id,
    action_type: "UPDATE_PLAYER_PRICES",
    entity_type: "WEEK",
    entity_id: week_id,
    details: `Price adjustment complete: ${result.updated_count} updated, ${result.no_change_count} unchanged, ${result.ignored_count} no stats`,
    status: "success",
  });

  return result;
}
