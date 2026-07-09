import express from "express";
import { getSheetData } from "../services/sheetsService";
import {
  buildPriceMovementMap,
  buildPlayerIntelligenceMap,
  enrichPlayers,
  EnrichedPlayer,
} from "../utils/playerAnalytics";

const router = express.Router();

const TOP_N = 10; // max players per section

/**
 * GET /market
 *
 * Returns all six Fantasy Market dashboard sections in a single response.
 * Three parallel sheet reads (Players, Player_Stats, Price_History) —
 * everything else is computed in memory. No N+1 reads.
 */
router.get("/market", async (_req, res) => {
  try {
    const [allPlayers, allStats, priceHistory] = await Promise.all([
      getSheetData("Players"),
      getSheetData("Player_Stats"),
      getSheetData("Price_History"),
    ]);

    // Only expose active players on the public market page.
    const activePlayers = allPlayers.filter(
      (p) => String(p.status).toLowerCase() === "active"
    );

    const movementMap = buildPriceMovementMap(priceHistory);
    const intelligenceMap = buildPlayerIntelligenceMap(allStats);
    const enriched = enrichPlayers(activePlayers, movementMap, intelligenceMap);

    // Helper: get team name lookup from the players data itself
    // (team_id is present; the frontend already has teams from /teams)

    // ── Section 1: Trending (HOT form, sorted by season avg) ──────────────
    const trending = [...enriched]
      .filter((p) => p.form === "hot")
      .sort((a, b) => b.season_average_fantasy_points - a.season_average_fantasy_points)
      .slice(0, TOP_N);

    // ── Section 2: Biggest Price Risers ────────────────────────────────────
    const risers = [...enriched]
      .filter((p) => p.price_change > 0)
      .sort((a, b) => b.price_change - a.price_change)
      .slice(0, TOP_N);

    // ── Section 3: Biggest Price Fallers ───────────────────────────────────
    const fallers = [...enriched]
      .filter((p) => p.price_change < 0)
      .sort((a, b) => a.price_change - b.price_change)
      .slice(0, TOP_N);

    // ── Section 4: Best Value (value_per_credit, min 3 games) ─────────────
    const bestValue = [...enriched]
      .filter((p) => p.games_played >= 3 && p.value_per_credit > 0)
      .sort((a, b) => b.value_per_credit - a.value_per_credit)
      .slice(0, TOP_N);

    // ── Section 5: Hidden Gems (cheap, high average, min 3 games) ─────────
    const hiddenGems = [...enriched]
      .filter(
        (p) =>
          p.current_price <= 10 &&
          p.season_average_fantasy_points >= 18 &&
          p.games_played >= 3
      )
      .sort((a, b) => b.value_per_credit - a.value_per_credit)
      .slice(0, TOP_N);

    // ── Section 6: Form Watch (last-5 avg improved vs previous-5 avg) ──────
    const formWatch = [...enriched]
      .filter(
        (p) =>
          p.games_played >= 6 && // need at least 6 games to compare two blocks
          p.last_5_average > p.prev_5_average
      )
      .sort((a, b) => (b.last_5_average - b.prev_5_average) - (a.last_5_average - a.prev_5_average))
      .slice(0, TOP_N);

    // Strip bulky fields that the market page doesn't need to keep
    // the response lean — last_5_fantasy_scores is only needed for sparklines
    // on the player selection page, not the market dashboard.
    const slim = (players: EnrichedPlayer[]) =>
      players.map(({ last_5_fantasy_scores: _l, ...rest }) => rest);

    res.json({
      trending:   slim(trending),
      risers:     slim(risers),
      fallers:    slim(fallers),
      best_value: slim(bestValue),
      hidden_gems: slim(hiddenGems),
      form_watch: slim(formWatch),
    });
  } catch (err) {
    console.error("Get market error:", err);
    res.status(500).json({ error: "Failed to fetch market data" });
  }
});

export default router;
