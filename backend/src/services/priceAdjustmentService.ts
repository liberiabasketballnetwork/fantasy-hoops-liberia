import { v4 as uuidv4 } from "uuid";
import { getSheetData, appendRow, updateRow } from "./sheetsService";
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

  // Prevent double adjustment for the same week.
  if (String(week.prices_updated).toUpperCase() === "TRUE") {
    throw new PriceAdjustmentError("Player prices have already been updated for this week.");
  }

  // Require scores to have been calculated first — prices are based on
  // that week's performance, so calculating before scores exist would
  // adjust from zero for everyone.
  if (String(week.scores_calculated).toUpperCase() !== "TRUE") {
    throw new PriceAdjustmentError(
      "Weekly scores must be calculated before adjusting prices. Run 'Calculate Weekly Scores' first."
    );
  }

  // Scope to completed games within the week's date range — same logic
  // as weeklyScoreCalculationService.ts to keep consistency.
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

  // Sum fantasy_points from Player_Stats for each player, scoped to the week.
  const allStats = await getSheetData("Player_Stats");
  const cumulativeByPlayer: Record<string, number> = {};
  for (const stat of allStats) {
    if (!validGameIds.has(stat.game_id)) continue;
    const pid = stat.player_id;
    cumulativeByPlayer[pid] = (cumulativeByPlayer[pid] || 0) + Number(stat.fantasy_points || 0);
  }

  // Load current players and apply adjustments.
  const allPlayers = await getSheetData("Players");
  const result: PriceAdjustmentResult = {
    updated_count: 0,
    no_change_count: 0,
    ignored_count: 0,
    changes: [],
  };

  for (const player of allPlayers) {
    // Requirement 2: ignore players with no stats for this week.
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

    // If clamping means the price doesn't actually change, skip.
    if (newPrice === oldPrice) {
      result.no_change_count++;
      continue;
    }

    // Update the player's price.
    await updateRow("Players", "player_id", player.player_id, {
      fantasy_price: newPrice,
    });

    // Record in Price_History.
    await appendRow("Price_History", {
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
