import express from "express";
import { authenticate, AuthRequest } from "../middleware/auth";
import { simulateTransfer } from "../services/teamPlannerService";

const router = express.Router();

/**
 * POST /team-planner/simulate
 * Authenticated. Simulates swapping one player in the user's current
 * lineup for another. No database writes — pure simulation.
 */
router.post("/team-planner/simulate", authenticate, async (req: AuthRequest, res) => {
  try {
    const { remove_player_id, add_player_id } = req.body;

    const result = await simulateTransfer(
      req.user!.user_id,
      remove_player_id,
      add_player_id
    );

    res.json(result);
  } catch (err: any) {
    if (err.message === "NO_LINEUP") {
      return res.status(404).json({
        error: "No lineup found for the active gameweek. Submit your lineup first.",
        code: "NO_LINEUP",
      });
    }
    console.error("Team planner error:", err);
    res.status(400).json({ error: err.message || "Failed to simulate transfer." });
  }
});

export default router;
