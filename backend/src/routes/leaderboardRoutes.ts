import express from "express";
import { getSheetData } from "../services/sheetsService";

const router = express.Router();

router.get("/", async (_req, res) => {
  try {
    const [leaderboard, users, weeks] = await Promise.all([getSheetData("Leaderboard"), getSheetData("Users"), getSheetData("Weekly_Gameweek")]);
    if (weeks.length === 0) return res.json({ week: null, leaderboard: [] });
    const latestWeek = weeks.sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime())[0];
    const filtered = leaderboard.filter((l) => String(l.week_id) === String(latestWeek.week_id));
    const weekLeaderboard = filtered.map((l) => {
      const user = users.find((u) => u.user_id === l.user_id);
      const { full_name: _fn, ...publicFields } = l as any;
      return { ...publicFields, display_name: user?.display_name || user?.full_name || "Unknown" };
    }).sort((a: any, b: any) => Number(a.rank) - Number(b.rank));
    res.json({ week: latestWeek, leaderboard: weekLeaderboard });
  } catch (err) { res.status(500).json({ error: "Failed to fetch leaderboard" }); }
});

router.get("/week/:weekId", async (req, res) => {
  try {
    const [leaderboard, users, weeks] = await Promise.all([getSheetData("Leaderboard"), getSheetData("Users"), getSheetData("Weekly_Gameweek")]);
    const week = weeks.find((w) => String(w.week_id) === String(req.params.weekId));
    if (!week) return res.status(404).json({ error: "Week not found" });
    const filtered = leaderboard.filter((l) => String(l.week_id) === String(req.params.weekId));
    const weekLeaderboard = filtered.map((l) => {
      const user = users.find((u) => u.user_id === l.user_id);
      const { full_name: _fn, ...publicFields } = l as any;
      return { ...publicFields, display_name: user?.display_name || user?.full_name || "Unknown" };
    }).sort((a: any, b: any) => Number(a.rank) - Number(b.rank));
    res.json({ week, leaderboard: weekLeaderboard });
  } catch (err) { res.status(500).json({ error: "Failed to fetch leaderboard" }); }
});

export default router;
