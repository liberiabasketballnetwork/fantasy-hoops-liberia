import express from "express";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { AuthRequest, authenticate } from "../middleware/auth";
import {
  appendRow,
  getSheetData,
  findRowById,
} from "../services/sheetsService";

const router = express.Router();

const lineupSchema = z.object({
  week_id: z.string(),
  player_ids: z.array(z.string()).length(5, "You must select exactly 5 players"),
  captain_player_id: z.string(),
});

// POST /submit-lineup
router.post("/submit-lineup", authenticate, async (req: AuthRequest, res) => {
  try {
    const parsed = lineupSchema.parse(req.body);

    if (!parsed.player_ids.includes(parsed.captain_player_id)) {
      return res.status(400).json({ error: "Captain must be one of the 5 selected players" });
    }

    const week = await findRowById("Weekly_Gameweek", "week_id", parsed.week_id);
    if (!week) return res.status(404).json({ error: "Gameweek not found" });
    if (String(week.is_locked).toUpperCase() === "TRUE") {
      return res.status(403).json({ error: "Submissions are locked for this gameweek" });
    }

    // Prevent duplicate submissions in the same week
    const lineups = await getSheetData("User_Lineups");
    const existing = lineups.find(
      (l) => String(l.user_id) === String(req.user!.user_id) && String(l.week_id) === String(parsed.week_id)
    );
    if (existing) {
      return res.status(409).json({ error: "You have already submitted a lineup for this gameweek" });
    }

    const lineup_id = uuidv4();
    await appendRow("User_Lineups", {
      lineup_id,
      user_id: req.user!.user_id,
      week_id: parsed.week_id,
      captain_player_id: parsed.captain_player_id,
      total_score: "",
      submitted_at: new Date().toISOString(),
    });

    for (const playerId of parsed.player_ids) {
      await appendRow("Lineup_Players", { lineup_id, player_id: playerId });
    }

    res.status(201).json({ message: "Lineup submitted", lineup_id });
  } catch (err: any) {
    if (err.name === "ZodError") {
      return res.status(400).json({ error: "Invalid input", details: err.errors });
    }
    console.error("Submit lineup error:", err);
    res.status(500).json({ error: "Failed to submit lineup" });
  }
});

// GET /my-lineup?week_id=
router.get("/my-lineup", authenticate, async (req: AuthRequest, res) => {
  try {
    const weekId = req.query.week_id as string;
    const lineups = await getSheetData("User_Lineups");
    const lineup = lineups.find(
      (l) => String(l.user_id) === String(req.user!.user_id) && String(l.week_id) === String(weekId)
    );
    if (!lineup) return res.json({ lineup: null });

    const lineupPlayers = await getSheetData("Lineup_Players");
    const playerIds = lineupPlayers
      .filter((lp) => String(lp.lineup_id) === String(lineup.lineup_id))
      .map((lp) => lp.player_id);

    const allPlayers = await getSheetData("Players");
    const players = allPlayers.filter((p) => playerIds.includes(p.player_id));

    res.json({ lineup, players });
  } catch (err) {
    console.error("Get lineup error:", err);
    res.status(500).json({ error: "Failed to fetch lineup" });
  }
});

export default router;
