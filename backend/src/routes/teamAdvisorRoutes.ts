import express from "express";
import { authenticate, AuthRequest } from "../middleware/auth";
import { getTeamAdvice } from "../services/teamAdvisorService";

const router = express.Router();

/**
 * GET /team-advisor
 * Authenticated users only. Evaluates the user's current submitted lineup
 * for the active gameweek and returns personalised recommendations.
 */
router.get("/team-advisor", authenticate, async (req: AuthRequest, res) => {
  try {
    const advice = await getTeamAdvice(req.user!.user_id);
    res.json(advice);
  } catch (err) {
    console.error("Team advisor error:", err);
    res.status(500).json({ error: "Failed to generate team advice." });
  }
});

export default router;
