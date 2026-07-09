/**
 * Shared player analytics used by both GET /players and GET /market.
 * All functions are pure (no I/O) and operate on pre-fetched arrays,
 * so callers can batch all sheet reads in a single Promise.all.
 */

export type PriceTrend = "up" | "down" | "same";
export type FormRating = "hot" | "good" | "average" | "cold";

export interface PriceMovement {
  previous_price: number;
  price_change: number;
  price_trend: PriceTrend;
}

export interface PlayerIntelligence {
  season_average_fantasy_points: number;
  games_played: number;
  last_5_fantasy_scores: number[];
  last_5_average: number;
  prev_5_average: number;
  value_per_credit: number;
  form: FormRating;
}

export interface EnrichedPlayer extends Record<string, any> {
  current_price: number;
  previous_price: number;
  price_change: number;
  price_trend: PriceTrend;
  season_average_fantasy_points: number;
  games_played: number;
  last_5_fantasy_scores: number[];
  last_5_average: number;
  prev_5_average: number;
  value_per_credit: number;
  form: FormRating;
}

export function classifyForm(last5Avg: number): FormRating {
  if (last5Avg >= 25) return "hot";
  if (last5Avg >= 18) return "good";
  if (last5Avg >= 10) return "average";
  return "cold";
}

/**
 * Builds a price movement map from a pre-fetched Price_History array.
 * One pass to group, one sort per player — O(n log n) total.
 */
export function buildPriceMovementMap(
  priceHistory: any[]
): Map<string, PriceMovement> {
  const map = new Map<string, PriceMovement>();
  const byPlayer = new Map<string, any[]>();

  for (const row of priceHistory) {
    if (!row.player_id) continue;
    if (!byPlayer.has(row.player_id)) byPlayer.set(row.player_id, []);
    byPlayer.get(row.player_id)!.push(row);
  }

  for (const [player_id, rows] of byPlayer.entries()) {
    const sorted = rows.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    const latest = sorted[0];
    const previousPrice = Number(latest.old_price || 0);
    const newPrice = Number(latest.new_price || 0);
    const change = newPrice - previousPrice;
    map.set(player_id, {
      previous_price: previousPrice,
      price_change: change,
      price_trend: change > 0 ? "up" : change < 0 ? "down" : "same",
    });
  }

  return map;
}

/**
 * Builds a player intelligence map from a pre-fetched Player_Stats array.
 * Rows are assumed to be in insertion order (newest = last in array).
 */
export function buildPlayerIntelligenceMap(
  allStats: any[]
): Map<string, PlayerIntelligence> {
  const map = new Map<string, PlayerIntelligence>();
  const byPlayer = new Map<string, any[]>();

  for (const row of allStats) {
    if (!row.player_id) continue;
    if (!byPlayer.has(row.player_id)) byPlayer.set(row.player_id, []);
    byPlayer.get(row.player_id)!.push(row);
  }

  for (const [player_id, rows] of byPlayer.entries()) {
    const points = rows.map((r) => Number(r.fantasy_points || 0));
    const gamesPlayed = points.length;
    const totalPoints = points.reduce((s, p) => s + p, 0);
    const seasonAvg =
      gamesPlayed > 0 ? Math.round((totalPoints / gamesPlayed) * 100) / 100 : 0;

    // Last 5 and previous 5 (newest = end of array)
    const last5 = points.slice(-5).reverse();
    const prev5 = points.slice(-10, -5).reverse();
    const last5Avg =
      last5.length > 0 ? last5.reduce((s, p) => s + p, 0) / last5.length : 0;
    const prev5Avg =
      prev5.length > 0 ? prev5.reduce((s, p) => s + p, 0) / prev5.length : 0;

    map.set(player_id, {
      season_average_fantasy_points: seasonAvg,
      games_played: gamesPlayed,
      last_5_fantasy_scores: last5,
      last_5_average: Math.round(last5Avg * 100) / 100,
      prev_5_average: Math.round(prev5Avg * 100) / 100,
      value_per_credit: 0, // filled in per-player once we have the price
      form: classifyForm(last5Avg),
    });
  }

  return map;
}

/**
 * Merges base player data with movement and intelligence maps.
 * value_per_credit is computed here since it requires the live price.
 */
export function enrichPlayers(
  players: any[],
  movementMap: Map<string, PriceMovement>,
  intelligenceMap: Map<string, PlayerIntelligence>
): EnrichedPlayer[] {
  return players.map((p) => {
    const movement = movementMap.get(p.player_id);
    const intel = intelligenceMap.get(p.player_id);
    const currentPrice = Number(p.fantasy_price || 0);
    const seasonAvg = intel?.season_average_fantasy_points ?? 0;
    const valuePerCredit =
      intel && currentPrice > 0
        ? Math.round((seasonAvg / currentPrice) * 100) / 100
        : 0;

    return {
      ...p,
      current_price: currentPrice,
      previous_price: movement?.previous_price ?? currentPrice,
      price_change: movement?.price_change ?? 0,
      price_trend: movement?.price_trend ?? "same",
      season_average_fantasy_points: seasonAvg,
      games_played: intel?.games_played ?? 0,
      last_5_fantasy_scores: intel?.last_5_fantasy_scores ?? [],
      last_5_average: intel?.last_5_average ?? 0,
      prev_5_average: intel?.prev_5_average ?? 0,
      value_per_credit: valuePerCredit,
      form: intel?.form ?? "cold",
    } as EnrichedPlayer;
  });
}
