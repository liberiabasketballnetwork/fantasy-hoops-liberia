import express from "express";
import { authenticate, AuthRequest } from "../middleware/auth";
import { optimizeLineup, Strategy } from "../services/teamOptimizerService";

const router = express.Router();

const VALID_STRATEGIES: Strategy[] = ["balanced", "value", "stars"];

router.post("/team-optimizer", authenticate, async (req: AuthRequest, res) => {
  try {
    const raw = req.body?.strategy || "balanced";
    const strategy: Strategy = VALID_STRATEGIES.includes(raw) ? raw : "balanced";
    const result = await optimizeLineup(req.user!.user_id, strategy);
    res.json(result);
  } catch (err: any) {
    if (err.message === "NO_LINEUP") {
      return res.status(404).json({
        error: "Could not build a valid lineup with the active player pool.",
        code: "NO_LINEUP",
      });
    }
    console.error("Team optimizer error:", err);
    res.status(500).json({ error: err.message || "Failed to generate optimized lineup." });
  }
});

export default router;
