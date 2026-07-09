import express from "express";
import { comparePlayersById } from "../services/playerComparisonService";

const router = express.Router();

/**
 * GET /player-comparison?playerA=<id>&playerB=<id>
 * Public — no auth required. Compares two players by ID.
 */
router.get("/player-comparison", async (req, res) => {
  try {
    const { playerA, playerB } = req.query as Record<string, string>;

    if (!playerA || !playerB) {
      return res.status(400).json({ error: "Both playerA and playerB query parameters are required." });
    }

    if (playerA === playerB) {
      return res.status(400).json({ error: "Select two different players to compare." });
    }

    const result = await comparePlayersById(playerA, playerB);
    res.json(result);
  } catch (err: any) {
    if (err.message?.includes("not found")) {
      return res.status(404).json({ error: err.message });
    }
    console.error("Player comparison error:", err);
    res.status(500).json({ error: "Failed to generate player comparison." });
  }
});

export default router;
