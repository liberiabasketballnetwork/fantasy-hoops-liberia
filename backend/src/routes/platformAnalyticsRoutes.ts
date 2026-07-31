/**
 * Platform Analytics Routes — GROWTH-001
 *
 * GET /admin/platform-analytics — admin only, returns full analytics payload
 */

import express from "express";
import { authenticate, requireAdmin, AuthRequest } from "../middleware/auth";
import { getPlatformAnalytics } from "../services/platformAnalyticsService";
import { logAdminAction } from "../services/adminActionLogger";

const router = express.Router();

router.get(
  "/admin/platform-analytics",
  authenticate,
  requireAdmin,
  async (req: AuthRequest, res) => {
    try {
      const analytics = await getPlatformAnalytics();

      // Audit log — fire-and-forget, never blocks the response
      logAdminAction({
        admin_id:    req.user!.user_id,
        action_type: "VIEW_ANALYTICS",
        entity_type: "PLATFORM",
        entity_id:   "analytics",
        details:     `Platform analytics generated. ${analytics.growth.totalManagers} managers, ${analytics.engagement.weeklyParticipation.length} gameweeks.`,
        status:      "success",
      }).catch(() => {});

      res.json(analytics);
    } catch (err: any) {
      res.status(500).json({ error: "Failed to generate analytics." });
    }
  }
);

export default router;
