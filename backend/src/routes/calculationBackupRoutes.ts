import express from "express";
import { z } from "zod";
import { authenticate, requireAdmin, AuthRequest } from "../middleware/auth";
import { createCalculationBackup } from "../services/calculationBackupService";
import { rollbackLastCalculation } from "../services/restoreCalculationService";

const router = express.Router();
router.use(authenticate, requireAdmin);
const weekIdSchema = z.object({ week_id: z.string().min(1) });

router.post("/calculation-backup/create", async (req, res) => {
  try {
    const { week_id } = weekIdSchema.parse(req.body);
    const backup_id = await createCalculationBackup(week_id);
    res.status(201).json({ message: "Backup created", backup_id });
  } catch (err: any) {
    if (err.name === "ZodError") return res.status(400).json({ error: "Invalid input", details: err.errors });
    res.status(500).json({ error: err.message || "Failed to create backup" });
  }
});

router.post("/calculation-backup/rollback", async (req: AuthRequest, res) => {
  try {
    const { week_id } = weekIdSchema.parse(req.body);
    const result = await rollbackLastCalculation(week_id, req.user?.user_id || "admin");
    res.json({ message: "Last calculation successfully rolled back.", ...result });
  } catch (err: any) {
    if (err.name === "ZodError") return res.status(400).json({ error: "Invalid input", details: err.errors });
    res.status(400).json({ error: err.message || "Failed to roll back calculation" });
  }
});

export default router;
