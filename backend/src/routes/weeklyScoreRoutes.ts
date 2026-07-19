import express from "express";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { authenticate, requireAdmin, AuthRequest } from "../middleware/auth";
import { calculateWeeklyScores, WeeklyScoreCalculationError } from "../services/weeklyScoreCalculationService";
import {
  buildWatcherIndex,
  dispatchWatchlistFormNotifications,
} from "../services/watchlistNotificationProducer";
import { dispatchLeagueWeeklyNotifications } from "../services/leagueNotificationProducer";
import {
  buildPriceMovementMap,
  buildPlayerIntelligenceMap,
  enrichPlayers,
} from "../utils/playerAnalytics";
import { getSheetData } from "../services/sheetsService";

const router = express.Router();
router.use(authenticate, requireAdmin);
const weekIdSchema = z.object({ week_id: z.string().min(1) });

router.post("/calculate-weekly-scores", async (req: AuthRequest, res) => {
  try {
    const { week_id } = weekIdSchema.parse(req.body);
    const result = await calculateWeeklyScores(week_id, req.user?.user_id || "admin");

    // Fire-and-forget: watchlist form/performance notifications
    // Scores are already committed — notification failure cannot affect them
    const workflow_id = uuidv4();
    (async () => {
      try {
        const [allPlayers, allStats, priceHistory, watcherIndex] = await Promise.all([
          getSheetData("Players"),
          getSheetData("Player_Stats"),
          getSheetData("Price_History"),
          buildWatcherIndex(),
        ]);
        if (watcherIndex.size === 0) return; // no one is watching anything — skip

        const movementMap    = buildPriceMovementMap(priceHistory);
        const intelligenceMap = buildPlayerIntelligenceMap(allStats);
        const enriched       = enrichPlayers(allPlayers, movementMap, intelligenceMap);

        await dispatchWatchlistFormNotifications(enriched, watcherIndex, week_id, workflow_id);

        // League competition notifications — NOTIFY-006
        await dispatchLeagueWeeklyNotifications(week_id, workflow_id);
      } catch (err: any) {
        console.error("[weeklyScoreRoutes] Watchlist form producer error:", err?.message || err);
      }
    })();

    res.json({
      message: "Weekly scores calculated successfully.",
      leaderboard: result.ranked,
      backup_id: result.backup_id,
    });
  } catch (err: any) {
    if (err.name === "ZodError") return res.status(400).json({ error: "Invalid input", details: err.errors });
    if (err instanceof WeeklyScoreCalculationError) return res.status(400).json({ error: err.message });
    res.status(500).json({ error: "Failed to calculate weekly scores" });
  }
});

export default router;

