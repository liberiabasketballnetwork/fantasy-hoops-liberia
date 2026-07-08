import { v4 as uuidv4 } from "uuid";
import { getSheetData, appendRow, updateRow, batchUpdateRows } from "./sheetsService";
import { logAdminAction } from "./adminActionLogger";

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
  changes: { player_id: string; full_name: string; old_price: number; new_price: number; weekly_fantasy_points: number }[];
}

export async function adjustPlayerPrices(week_id: string, admin_id: string = "admin"): Promise<PriceAdjustmentResult> {
  if (!week_id) throw new PriceAdjustmentError("week_id is required");

  const allWeeks = await getSheetData("Weekly_Gameweek");
  const week = allWeeks.find((w) => String(w.week_id) === String(week_id));
  if (!week) throw new PriceAdjustmentError("Gameweek not found.");

  console.log("[priceAdjustmentService] week row read from sheet:", { week_id: week.week_id, scores_calculated: week.scores_calculated, prices_updated: week.prices_updated, start_date: week.start_date, end_date: week.end_date });

  if (String(week.prices_updated).toUpperCase() === "TRUE") throw new PriceAdjustmentError("Player prices have already been updated for this week.");
  if (String(week.scores_calculated).toUpperCase() !== "TRUE") { console.log("[priceAdjustmentService] blocked: scores_calculated =", week.scores_calculated); throw new PriceAdjustmentError("Weekly scores must be calculated before adjusting prices. Run 'Calculate Weekly Scores' first."); }

  const allGames = await getSheetData("Games");
  const startDate = new Date(week.start_date);
  const endDate = new Date(week.end_date);
  endDate.setHours(23, 59, 59, 999);

  const validGameIds = new Set(allGames.filter((g) => { if (String(g.status).toLowerCase() !== "completed") return false; const d = new Date(g.game_date); return d >= startDate && d <= endDate; }).map((g) => g.game_id));
  console.log("[priceAdjustmentService] validGameIds in week:", [...validGameIds]);

  const allStats = await getSheetData("Player_Stats");
  const cumulativeByPlayer: Record<string, number> = {};
  for (const stat of allStats) {
    if (!validGameIds.has(stat.game_id)) continue;
    cumulativeByPlayer[stat.player_id] = (cumulativeByPlayer[stat.player_id] || 0) + Number(stat.fantasy_points || 0);
  }
  console.log("[priceAdjustmentService] players with stats this week:", Object.keys(cumulativeByPlayer).length);

  const allPlayers = await getSheetData("Players");
  const result: PriceAdjustmentResult = { updated_count: 0, no_change_count: 0, ignored_count: 0, changes: [] };
  const playerBatchUpdates: { rowNumber: number; data: Record<string, any> }[] = [];
  const priceHistoryRows: Record<string, any>[] = [];

  for (let i = 0; i < allPlayers.length; i++) {
    const player = allPlayers[i];
    if (!(player.player_id in cumulativeByPlayer)) { result.ignored_count++; continue; }
    const weeklyPoints = cumulativeByPlayer[player.player_id];
    const delta = priceAdjustment(weeklyPoints);
    if (delta === 0) { result.no_change_count++; continue; }
    const oldPrice = Number(player.fantasy_price || 0);
    const newPrice = Math.max(PRICE_FLOOR, Math.min(PRICE_CEILING, oldPrice + delta));
    if (newPrice === oldPrice) { result.no_change_count++; continue; }
    playerBatchUpdates.push({ rowNumber: i + 2, data: { ...player, fantasy_price: newPrice } });
    priceHistoryRows.push({ price_history_id: uuidv4(), player_id: player.player_id, week_id, old_price: oldPrice, new_price: newPrice, weekly_fantasy_points: weeklyPoints.toFixed(2), created_at: new Date().toISOString() });
    result.updated_count++;
    result.changes.push({ player_id: player.player_id, full_name: player.full_name, old_price: oldPrice, new_price: newPrice, weekly_fantasy_points: weeklyPoints });
  }

  if (playerBatchUpdates.length > 0) await batchUpdateRows("Players", playerBatchUpdates);
  for (const historyRow of priceHistoryRows) await appendRow("Price_History", historyRow);
  await updateRow("Weekly_Gameweek", "week_id", week_id, { prices_updated: "TRUE" });
  await logAdminAction({ admin_id, action_type: "UPDATE_PLAYER_PRICES", entity_type: "WEEK", entity_id: week_id, details: `Price adjustment complete: ${result.updated_count} updated, ${result.no_change_count} unchanged, ${result.ignored_count} no stats`, status: "success" });

  return result;
}
