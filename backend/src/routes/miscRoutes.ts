import express from "express";
import { getSheetData, getSetting } from "../services/sheetsService";

const router = express.Router();

router.get("/teams", async (_req, res) => {
  try {
    const teams = await getSheetData("Teams");
    res.json({ teams });
  } catch (err) {
    console.error("Get teams error:", err);
    res.status(500).json({ error: "Failed to fetch teams" });
  }
});

router.get("/sponsors", async (_req, res) => {
  try {
    const sponsors = await getSheetData("Sponsors");
    res.json({ sponsors });
  } catch (err) {
    console.error("Get sponsors error:", err);
    res.status(500).json({ error: "Failed to fetch sponsors" });
  }
});

// GET /settings - public settings the frontend needs (e.g. is the salary cap on?)
router.get("/settings", async (_req, res) => {
  try {
    const salaryCapEnabled = await getSetting("salary_cap_enabled", "true");
    const budgetCap = await getSetting("budget_cap", "100");
    res.json({
      salary_cap_enabled: salaryCapEnabled.toLowerCase() === "true",
      budget_cap: Number(budgetCap),
    });
  } catch (err) {
    console.error("Get settings error:", err);
    res.status(500).json({ error: "Failed to fetch settings" });
  }
});

export default router;
