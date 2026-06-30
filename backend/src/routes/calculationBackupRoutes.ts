import express from "express";
import { z } from "zod";
import { authenticate, requireAdmin } from "../middleware/auth";
import { createCalculationBackup } from "../services/calculationBackupService";
import { rollbackLastCalculation } from "../services/restoreCalculationService";

const router = express.Router();

router.use(authenticate, requireAdmin);

const weekIdSchema = z.object({
  week_id: z.string().min(1),
});

/**
 * Creates a backup of the current week's Leaderboard, User_Lineups, and
 * Weekly_Gameweek state. This is exposed so it can be called before a
 * future score-calculation step runs - it is NOT currently called by
 * anything automatically, since score calculation itself isn't being
 * built yet. Safe to call any time; it only reads and snapshots, never
 * modifies, the sheets it backs up.
 */
router.post("/calculation-backup/create", async (req, res) => {
  try {
    const { week_id } = weekIdSchema.parse(req.body);
    const backup_id = await createCalculationBackup(week_id);
    res.status(201).json({ message: "Backup created", backup_id });
  } catch (err: any) {
    if (err.name === "ZodError") {
      return res.status(400).json({ error: "Invalid input", details: err.errors });
    }
    console.error("Create calculation backup error:", err);
    res.status(500).json({ error: err.message || "Failed to create backup" });
  }
});

/**
 * Rolls back the most recent calculation backup for a given week, fully
 * restoring Leaderboard, User_Lineups, and Weekly_Gameweek to their
 * pre-calculation state.
 */
router.post("/calculation-backup/rollback", async (req, res) => {
  try {
    const { week_id } = weekIdSchema.parse(req.body);
    const result = await rollbackLastCalculation(week_id);
    res.json({
      message: "Last calculation successfully rolled back.",
      ...result,
    });
  } catch (err: any) {
    if (err.name === "ZodError") {
      return res.status(400).json({ error: "Invalid input", details: err.errors });
    }
    console.error("Rollback calculation error:", err);
    res.status(400).json({ error: err.message || "Failed to roll back calculation" });
  }
});

export default router;
