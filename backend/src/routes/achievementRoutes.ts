import express from "express";
import { v4 as uuidv4 } from "uuid";
import { authenticate, requireAdmin, AuthRequest } from "../middleware/auth";
import {
  getUserAchievements,
  getPublicAchievements,
  evaluateAchievements,
  BADGE_CATALOG,
} from "../services/achievementService";
import { dispatchAchievementNotifications } from "../services/achievementNotificationProducer";

const router = express.Router();

/** GET /achievements — my badges + locked catalog */
router.get("/achievements", authenticate, async (req: AuthRequest, res) => {
  try {
    const data = await getUserAchievements(req.user!.user_id);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch achievements." });
  }
});

/** GET /achievements/catalog — full badge catalog (public) */
router.get("/achievements/catalog", async (_req, res) => {
  res.json({ badges: BADGE_CATALOG });
});

/** GET /achievements/user/:userId — public badges for a user (for leaderboard profiles) */
router.get("/achievements/user/:userId", async (req, res) => {
  try {
    const data = await getPublicAchievements(req.params.userId);
    if (data === null) return res.json({ hidden: true, badges: [] });
    res.json({ badges: data });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch user achievements." });
  }
});

/** POST /admin/achievements/evaluate/:weekId — admin triggers evaluation */
router.post(
  "/admin/achievements/evaluate/:weekId",
  authenticate,
  requireAdmin,
  async (req: AuthRequest, res) => {
    try {
      const { weekId } = req.params;
      const result = await evaluateAchievements(weekId);

      // Fire-and-forget: dispatch achievement notifications.
      // A workflow_id is generated per admin evaluation run for tracing.
      // Any notification failure is logged inside the producer — it never
      // affects badge persistence or this response.
      const workflow_id = uuidv4();
      dispatchAchievementNotifications(result.awarded, workflow_id).catch((err) => {
        console.error("[achievementRoutes] Achievement producer dispatch error:", err);
      });

      res.json({
        message: `Achievement evaluation complete. ${result.awarded.length} badge${result.awarded.length !== 1 ? "s" : ""} awarded.`,
        awarded: result.awarded,
        week_id: weekId,
      });
    } catch (err: any) {
      console.error("Achievement evaluation error:", err);
      res.status(500).json({ error: err.message || "Failed to evaluate achievements." });
    }
  }
);

export default router;
