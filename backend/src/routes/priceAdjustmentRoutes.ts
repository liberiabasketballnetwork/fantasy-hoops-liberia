import express from "express";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { authenticate, requireAdmin, AuthRequest } from "../middleware/auth";
import { adjustPlayerPrices, PriceAdjustmentError } from "../services/priceAdjustmentService";
import { dispatchPricingNotifications } from "../services/pricingNotificationProducer";
import {
  buildWatcherIndex,
  dispatchWatchlistPriceNotifications,
} from "../services/watchlistNotificationProducer";

const router = express.Router();
router.use(authenticate, requireAdmin);
const weekIdSchema = z.object({ week_id: z.string().min(1) });

router.post("/update-player-prices", async (req: AuthRequest, res) => {
  try {
    console.log("[priceAdjustmentRoutes] /update-player-prices called, body:", req.body);
    const { week_id } = weekIdSchema.parse(req.body);
    const result = await adjustPlayerPrices(week_id, req.user?.user_id || "admin");

    // Fire-and-forget: lineup price notifications (existing)
    const workflow_id = uuidv4();
    dispatchPricingNotifications(result, week_id, workflow_id).catch((err) => {
      console.error("[priceAdjustmentRoutes] Pricing producer error:", err);
    });

    // Fire-and-forget: watchlist price notifications (NOTIFY-004)
    // Shares the same workflow_id so aggregation can merge with form events if present
    buildWatcherIndex().then((watcherIndex) => {
      if (watcherIndex.size === 0) return;
      return dispatchWatchlistPriceNotifications(result, watcherIndex, week_id, workflow_id);
    }).catch((err) => {
      console.error("[priceAdjustmentRoutes] Watchlist price producer error:", err);
    });

    res.json({ message: `Player prices updated: ${result.updated_count} changed, ${result.no_change_count} unchanged, ${result.ignored_count} had no stats this week.`, ...result });
  } catch (err: any) {
    console.error("[priceAdjustmentRoutes] error:", err?.message || err);
    if (err.name === "ZodError") return res.status(400).json({ error: "Invalid input", details: err.errors });
    if (err instanceof PriceAdjustmentError) return res.status(400).json({ error: err.message });
    res.status(500).json({ error: err?.message || "Failed to update player prices" });
  }
});

export default router;
