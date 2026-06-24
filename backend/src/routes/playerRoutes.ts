import express from "express";
import { filterPlayers, findRowById } from "../services/sheetsService";

const router = express.Router();

// GET /players?team_id=&position=&status=
router.get("/", async (req, res) => {
  try {
    const { team_id, position, status } = req.query as Record<string, string>;
    const players = await filterPlayers({ team_id, position, status });
    res.json({ players });
  } catch (err) {
    console.error("Get players error:", err);
    res.status(500).json({ error: "Failed to fetch players" });
  }
});

// GET /players/:id
router.get("/:id", async (req, res) => {
  try {
    const player = await findRowById("Players", "player_id", req.params.id);
    if (!player) return res.status(404).json({ error: "Player not found" });
    res.json({ player });
  } catch (err) {
    console.error("Get player error:", err);
    res.status(500).json({ error: "Failed to fetch player" });
  }
});

export default router;
