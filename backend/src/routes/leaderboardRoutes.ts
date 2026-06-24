import express from "express";
import { getSheetData } from "../services/sheetsService";

const router = express.Router();

// GET /leaderboard - latest week's leaderboard
router.get("/", async (_req, res) => {
  try {
    const weeks = await getSheetData("Weekly_Gameweek");
    if (weeks.length === 0) return res.json({ leaderboard: [], week: null });

    const latestWeek = weeks.sort(
      (a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime()
    )[0];

    const leaderboard = await getSheetData("Leaderboard");
    const users = await getSheetData("Users");

    const filtered = leaderboard.filter((l) => String(l.week_id) === String(latestWeek.week_id));
    const weekLeaderboard: any[] = filtered
      .map((l) => {
        const user = users.find((u) => u.user_id === l.user_id);
        return { ...l, full_name: user?.full_name || "Unknown" };
      })
      .sort((a: any, b: any) => Number(a.rank) - Number(b.rank));

    res.json({ leaderboard: weekLeaderboard, week: latestWeek });
  } catch (err) {
    console.error("Get leaderboard error:", err);
    res.status(500).json({ error: "Failed to fetch leaderboard" });
  }
});

// GET /leaderboard/week/:weekId
router.get("/week/:weekId", async (req, res) => {
  try {
    const leaderboard = await getSheetData("Leaderboard");
    const users = await getSheetData("Users");

    const filtered = leaderboard.filter((l) => String(l.week_id) === String(req.params.weekId));
    const weekLeaderboard: any[] = filtered
      .map((l) => {
        const user = users.find((u) => u.user_id === l.user_id);
        return { ...l, full_name: user?.full_name || "Unknown" };
      })
      .sort((a: any, b: any) => Number(a.rank) - Number(b.rank));

    res.json({ leaderboard: weekLeaderboard });
  } catch (err) {
    console.error("Get leaderboard by week error:", err);
    res.status(500).json({ error: "Failed to fetch leaderboard" });
  }
});

export default router;
