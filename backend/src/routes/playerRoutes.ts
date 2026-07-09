import express from "express";
import { filterPlayers, getSheetData } from "../services/sheetsService";

const router = express.Router();

// ─── Price Movement ────────────────────────────────────────────────────────

function buildPriceMovementMap(
  priceHistory: any[]
): Map<string, { previous_price: number; price_change: number; price_trend: "up" | "down" | "same" }> {
  const map = new Map<string, { previous_price: number; price_change: number; price_trend: "up" | "down" | "same" }>();
  const byPlayer = new Map<string, any[]>();
  for (const row of priceHistory) {
    const pid = row.player_id;
    if (!pid) continue;
    if (!byPlayer.has(pid)) byPlayer.set(pid, []);
    byPlayer.get(pid)!.push(row);
  }
  for (const [player_id, rows] of byPlayer.entries()) {
    const sorted = rows.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const latest = sorted[0];
    const previousPrice = Number(latest.old_price || 0);
    const newPrice = Number(latest.new_price || 0);
    const change = newPrice - previousPrice;
    const trend: "up" | "down" | "same" = change > 0 ? "up" : change < 0 ? "down" : "same";
    map.set(player_id, { previous_price: previousPrice, price_change: change, price_trend: trend });
  }
  return map;
}

// ─── Player Intelligence ───────────────────────────────────────────────────

type FormRating = "hot" | "good" | "average" | "cold";

function classifyForm(last5Avg: number): FormRating {
  if (last5Avg >= 25) return "hot";
  if (last5Avg >= 18) return "good";
  if (last5Avg >= 10) return "average";
  return "cold";
}

interface PlayerIntelligence {
  season_average_fantasy_points: number;
  games_played: number;
  last_5_fantasy_scores: number[];
  value_per_credit: number;
  form: FormRating;
}

/**
 * Computes all player intelligence from a single pre-fetched Player_Stats
 * array. One pass to group by player, then one pass per player to sort and
 * derive all analytics. No N+1 reads anywhere.
 */
function buildPlayerIntelligenceMap(
  allStats: any[]
): Map<string, PlayerIntelligence> {
  const map = new Map<string, PlayerIntelligence>();

  // Group stats by player_id
  const byPlayer = new Map<string, any[]>();
  for (const row of allStats) {
    const pid = row.player_id;
    if (!pid) continue;
    if (!byPlayer.has(pid)) byPlayer.set(pid, []);
    byPlayer.get(pid)!.push(row);
  }

  for (const [player_id, rows] of byPlayer.entries()) {
    // Sort newest first using stat_id insertion order is unreliable —
    // use game's created_at or fall back to array position.
    // Player_Stats rows don't have a date field directly, so we use
    // the implicit order they were appended (row index in sheet).
    // The rows are already in insertion order from getSheetData.
    const points = rows.map((r) => Number(r.fantasy_points || 0));
    const gamesPlayed = points.length;
    const totalPoints = points.reduce((s, p) => s + p, 0);
    const seasonAvg = gamesPlayed > 0 ? Math.round((totalPoints / gamesPlayed) * 100) / 100 : 0;

    // Last 5: take the last 5 appended rows (most recently imported = end of array)
    const last5 = points.slice(-5).reverse(); // newest first
    const last5Avg = last5.length > 0 ? last5.reduce((s, p) => s + p, 0) / last5.length : 0;

    map.set(player_id, {
      season_average_fantasy_points: seasonAvg,
      games_played: gamesPlayed,
      last_5_fantasy_scores: last5,
      value_per_credit: 0, // filled in per player below using live price
      form: classifyForm(last5Avg),
    });
  }

  return map;
}

// ─── Route ─────────────────────────────────────────────────────────────────

router.get("/", async (req, res) => {
  try {
    const { team_id, position, status } = req.query as Record<string, string>;
    const effectiveStatus = status === "all" ? undefined : (status || "active");

    // Three parallel reads — Players, Price_History, Player_Stats.
    // This is the only I/O in this handler; all analytics are computed
    // in memory after this point.
    const [players, priceHistory, allStats] = await Promise.all([
      filterPlayers({ team_id, position, status: effectiveStatus }),
      getSheetData("Price_History"),
      getSheetData("Player_Stats"),
    ]);

    const movementMap = buildPriceMovementMap(priceHistory);
    const intelligenceMap = buildPlayerIntelligenceMap(allStats);

    const enriched = players.map((p) => {
      const movement = movementMap.get(p.player_id);
      const intel = intelligenceMap.get(p.player_id);
      const currentPrice = Number(p.fantasy_price || 0);

      // value_per_credit is computed here because it needs the live price
      // from the Players sheet, which the intelligence map doesn't have.
      const valuePerCredit =
        intel && currentPrice > 0
          ? Math.round((intel.season_average_fantasy_points / currentPrice) * 100) / 100
          : 0;

      return {
        ...p,
        // Price movement (GAME-001)
        current_price: currentPrice,
        previous_price: movement?.previous_price ?? currentPrice,
        price_change: movement?.price_change ?? 0,
        price_trend: movement?.price_trend ?? "same",
        // Player intelligence (GAME-002)
        season_average_fantasy_points: intel?.season_average_fantasy_points ?? 0,
        games_played: intel?.games_played ?? 0,
        last_5_fantasy_scores: intel?.last_5_fantasy_scores ?? [],
        value_per_credit: valuePerCredit,
        form: intel?.form ?? "cold",
      };
    });

    res.json({ players: enriched });
  } catch (err) {
    console.error("Get players error:", err);
    res.status(500).json({ error: "Failed to fetch players" });
  }
});

export default router;
