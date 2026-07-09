import express from "express";
import { filterPlayers, getSheetData } from "../services/sheetsService";
import {
  buildPriceMovementMap,
  buildPlayerIntelligenceMap,
  enrichPlayers,
} from "../utils/playerAnalytics";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const { team_id, position, status } = req.query as Record<string, string>;
    const effectiveStatus = status === "all" ? undefined : (status || "active");

    const [players, priceHistory, allStats] = await Promise.all([
      filterPlayers({ team_id, position, status: effectiveStatus }),
      getSheetData("Price_History"),
      getSheetData("Player_Stats"),
    ]);

    const movementMap = buildPriceMovementMap(priceHistory);
    const intelligenceMap = buildPlayerIntelligenceMap(allStats);
    const enriched = enrichPlayers(players, movementMap, intelligenceMap);

    res.json({ players: enriched });
  } catch (err) {
    console.error("Get players error:", err);
    res.status(500).json({ error: "Failed to fetch players" });
  }
});

export default router;
