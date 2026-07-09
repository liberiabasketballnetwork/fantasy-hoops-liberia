import express from "express";
import { authenticate, requireAdmin } from "../middleware/auth";
import { generateWeeklyReport } from "../services/fantasyReportService";
import { getSheetData } from "../services/sheetsService";

const router = express.Router();

/**
 * GET /reports/weekly/:weekId
 * Public — anyone can view the report for a completed week.
 * Admin-only would lock the report page for users, which contradicts
 * the intent of surfacing insights to help fantasy decisions.
 */
router.get("/reports/weekly/:weekId", async (req, res) => {
  try {
    const { weekId } = req.params;

    // Verify the week exists and scores have been calculated.
    const allWeeks = await getSheetData("Weekly_Gameweek");
    const week = allWeeks.find((w) => String(w.week_id) === String(weekId));
    if (!week) {
      return res.status(404).json({ error: "Gameweek not found." });
    }
    if (String(week.scores_calculated).toUpperCase() !== "TRUE") {
      return res.status(400).json({
        error: "Report not available yet. Scores must be calculated before a report can be generated.",
      });
    }

    const report = await generateWeeklyReport(weekId);
    res.json({ report, week });
  } catch (err) {
    console.error("Weekly report error:", err);
    res.status(500).json({ error: "Failed to generate weekly report." });
  }
});

/**
 * GET /admin/reports/weekly/:weekId
 * Admin only — same data but bypasses the scores_calculated guard so
 * admins can preview a report before publishing the week.
 */
router.get(
  "/admin/reports/weekly/:weekId",
  authenticate,
  requireAdmin,
  async (req, res) => {
    try {
      const { weekId } = req.params;
      const allWeeks = await getSheetData("Weekly_Gameweek");
      const week = allWeeks.find((w) => String(w.week_id) === String(weekId));
      if (!week) {
        return res.status(404).json({ error: "Gameweek not found." });
      }
      const report = await generateWeeklyReport(weekId);
      res.json({ report, week });
    } catch (err) {
      console.error("Admin weekly report error:", err);
      res.status(500).json({ error: "Failed to generate weekly report." });
    }
  }
);

export default router;
