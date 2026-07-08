import express from "express";
import { filterPlayers, getSheetData } from "../services/sheetsService";

const router = express.Router();

/**
 * Computes price movement for every player in one pass, using a single
 * pre-fetched Price_History array. This avoids N+1 sheet reads.
 *
 * For each player we look at all of their Price_History rows, sort them
 * by created_at descending, and take the most recent one. The previous
 * price is old_price from that row; current_price is the player's live
 * fantasy_price value (which may differ if a manual edit happened).
 */
function buildPriceMovementMap(
  priceHistory: any[]
): Map<string, { previous_price: number; price_change: number; price_trend: "up" | "down" | "same" }> {
  const map = new Map<string, { previous_price: number; price_change: number; price_trend: "up" | "down" | "same" }>();

  // Group history rows by player_id
  const byPlayer = new Map<string, any[]>();
  for (const row of priceHistory) {
    const pid = row.player_id;
    if (!pid) continue;
    if (!byPlayer.has(pid)) byPlayer.set(pid, []);
    byPlayer.get(pid)!.push(row);
  }

  for (const [player_id, rows] of byPlayer.entries()) {
    // Most recent row first
    const sorted = rows.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    const latest = sorted[0];
    const previousPrice = Number(latest.old_price || 0);
    const newPrice = Number(latest.new_price || 0);
    const change = newPrice - previousPrice;
    const trend: "up" | "down" | "same" = change > 0 ? "up" : change < 0 ? "down" : "same";
    map.set(player_id, { previous_price: previousPrice, price_change: change, price_trend: trend });
  }

  return map;
}

router.get("/", async (req, res) => {
  try {
    const { team_id, position, status } = req.query as Record<string, string>;
    const effectiveStatus = status === "all" ? undefined : (status || "active");

    // Batch both reads in parallel - zero extra latency vs the old single read.
    const [players, priceHistory] = await Promise.all([
      filterPlayers({ team_id, position, status: effectiveStatus }),
      getSheetData("Price_History"),
    ]);

    const movementMap = buildPriceMovementMap(priceHistory);

    const enriched = players.map((p) => {
      const movement = movementMap.get(p.player_id);
      return {
        ...p,
        current_price: Number(p.fantasy_price || 0),
        previous_price: movement?.previous_price ?? Number(p.fantasy_price || 0),
        price_change: movement?.price_change ?? 0,
        price_trend: movement?.price_trend ?? "same",
      };
    });

    res.json({ players: enriched });
  } catch (err) {
    console.error("Get players error:", err);
    res.status(500).json({ error: "Failed to fetch players" });
  }
});

export default router;
