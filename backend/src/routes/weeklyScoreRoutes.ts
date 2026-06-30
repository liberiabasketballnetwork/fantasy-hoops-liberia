import express from "express";
import { z } from "zod";
import { authenticate, requireAdmin } from "../middleware/auth";
import { calculateWeeklyScores, WeeklyScoreCalculationError } from "../services/weeklyScoreCalculationService";

const router = express.Router();

router.use(authenticate, requireAdmin);

const weekIdSchema = z.object({
  week_id: z.string().min(1),
});

/**
 * POST /admin/calculate-weekly-scores
 *
 * Manually triggered only (no automatic calculation anywhere). Backs up
 * current state first via calculationBackupService, blocks if scores were
 * already calculated for this week, then computes cumulative weekly
 * fantasy scores per the locked gameplay rules and saves the leaderboard.
 *
 * This is a new, separate endpoint from /admin/calculate-scores (which
 * still uses scoringEngine.ts and the Fantasy_Scoring sheet, untouched).
 */
router.post("/calculate-weekly-scores", async (req, res) => {
  try {
    const { week_id } = weekIdSchema.parse(req.body);
    const result = await calculateWeeklyScores(week_id);
    res.json({
      message: "Weekly scores calculated successfully.",
      leaderboard: result.ranked,
      backup_id: result.backup_id,
    });
  } catch (err: any) {
    if (err.name === "ZodError") {
      return res.status(400).json({ error: "Invalid input", details: err.errors });
    }
    if (err instanceof WeeklyScoreCalculationError) {
      return res.status(400).json({ error: err.message });
    }
    console.error("Calculate weekly scores error:", err);
    res.status(500).json({ error: "Failed to calculate weekly scores" });
  }
});

export default router;
