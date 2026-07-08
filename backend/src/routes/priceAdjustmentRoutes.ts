import express from "express";
import { z } from "zod";
import { authenticate, requireAdmin, AuthRequest } from "../middleware/auth";
import { adjustPlayerPrices, PriceAdjustmentError } from "../services/priceAdjustmentService";

const router = express.Router();

router.use(authenticate, requireAdmin);

const weekIdSchema = z.object({ week_id: z.string().min(1) });

router.post("/update-player-prices", async (req: AuthRequest, res) => {
  try {
    const { week_id } = weekIdSchema.parse(req.body);
    const result = await adjustPlayerPrices(week_id, req.user?.user_id || "admin");
    res.json({
      message: `Player prices updated: ${result.updated_count} changed, ${result.no_change_count} unchanged, ${result.ignored_count} had no stats this week.`,
      ...result,
    });
  } catch (err: any) {
    if (err.name === "ZodError") {
      return res.status(400).json({ error: "Invalid input", details: err.errors });
    }
    if (err instanceof PriceAdjustmentError) {
      return res.status(400).json({ error: err.message });
    }
    console.error("Update player prices error:", err);
    res.status(500).json({ error: "Failed to update player prices" });
  }
});

export default router;
