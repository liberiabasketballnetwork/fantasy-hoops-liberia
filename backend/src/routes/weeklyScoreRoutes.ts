import express from "express";
import { z } from "zod";
import { authenticate, requireAdmin, AuthRequest } from "../middleware/auth";
import { calculateWeeklyScores, WeeklyScoreCalculationError } from "../services/weeklyScoreCalculationService";

const router = express.Router();
router.use(authenticate, requireAdmin);
const weekIdSchema = z.object({ week_id: z.string().min(1) });

router.post("/calculate-weekly-scores", async (req: AuthRequest, res) => {
  try {
    const { week_id } = weekIdSchema.parse(req.body);
    const result = await calculateWeeklyScores(week_id, req.user?.user_id || "admin");
    res.json({ message: "Weekly scores calculated successfully.", leaderboard: result.ranked, backup_id: result.backup_id });
  } catch (err: any) {
    if (err.name === "ZodError") return res.status(400).json({ error: "Invalid input", details: err.errors });
    if (err instanceof WeeklyScoreCalculationError) return res.status(400).json({ error: err.message });
    res.status(500).json({ error: "Failed to calculate weekly scores" });
  }
});

export default router;
