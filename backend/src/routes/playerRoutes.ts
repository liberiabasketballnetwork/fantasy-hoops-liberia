import express from "express";
import { filterPlayers } from "../services/sheetsService";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const { team_id, position, status } = req.query as Record<string, string>;
    const effectiveStatus = status === "all" ? undefined : (status || "active");
    const players = await filterPlayers({ team_id, position, status: effectiveStatus });
    res.json({ players });
  } catch (err) { res.status(500).json({ error: "Failed to fetch players" }); }
});

export default router;
