import express from "express";
import { getSheetData } from "../services/sheetsService";

const router = express.Router();

router.get("/teams", async (_req, res) => {
  try { const teams = await getSheetData("Teams"); res.json({ teams }); }
  catch (err) { res.status(500).json({ error: "Failed to fetch teams" }); }
});

router.get("/sponsors", async (_req, res) => {
  try { const sponsors = await getSheetData("Sponsors"); res.json({ sponsors }); }
  catch (err) { res.status(500).json({ error: "Failed to fetch sponsors" }); }
});

router.get("/settings", async (_req, res) => {
  try {
    const rows = await getSheetData("Settings");
    const obj: Record<string, any> = {};
    for (const row of rows) { obj[row.setting_key] = row.setting_value; }
    const salary_cap_enabled = String(obj.salary_cap_enabled || "true").toLowerCase() === "true";
    const budget_cap = Number(obj.budget_cap || 100);
    res.json({ salary_cap_enabled, budget_cap });
  } catch (err) { res.status(500).json({ error: "Failed to fetch settings" }); }
});

router.get("/selection-stats", async (_req, res) => {
  try {
    const weeks = await getSheetData("Weekly_Gameweek");
    if (weeks.length === 0) return res.json({ locked: true, week: null, total_managers: 0, stats: [] });
    const latestWeek = weeks.sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime())[0];
    const deadlinePassed = new Date() >= new Date(latestWeek.submission_deadline);
    if (!deadlinePassed) return res.json({ locked: true, week: latestWeek, unlock_at: latestWeek.submission_deadline, total_managers: 0, stats: [] });
    const [lineups, lineupPlayers, players] = await Promise.all([getSheetData("User_Lineups"), getSheetData("Lineup_Players"), getSheetData("Players")]);
    const weekLineups = lineups.filter((l) => String(l.week_id) === String(latestWeek.week_id));
    const totalManagers = weekLineups.length;
    const lineupIds = new Set(weekLineups.map((l) => l.lineup_id));
    const counts: Record<string, number> = {};
    for (const lp of lineupPlayers) { if (lineupIds.has(lp.lineup_id)) counts[lp.player_id] = (counts[lp.player_id] || 0) + 1; }
    const stats = Object.entries(counts).map(([player_id, count]) => {
      const player = players.find((p) => p.player_id === player_id);
      return { player_id, display_name: player?.display_name || player?.full_name || "Unknown", count, percentage: totalManagers > 0 ? Math.round((count / totalManagers) * 100) : 0 };
    }).sort((a, b) => b.percentage - a.percentage);
    res.json({ locked: false, week: latestWeek, total_managers: totalManagers, stats });
  } catch (err) { res.status(500).json({ error: "Failed to fetch selection stats" }); }
});

export default router;
