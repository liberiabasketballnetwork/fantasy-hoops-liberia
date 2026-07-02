import express from "express";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { AuthRequest, authenticate, requireAdmin } from "../middleware/auth";
import {
  appendRow,
  getSheetData,
  updateRow,
  deleteRow,
  lockWeek as lockWeekFn,
  resetWeek as resetWeekFn,
  getSetting,
  setSetting,
} from "../services/sheetsService";
import { logAdminAction } from "../services/adminActionLogger";

const router = express.Router();

router.use(authenticate, requireAdmin);

// ---------- Settings ----------
router.get("/settings", async (_req, res) => {
  try {
    const salaryCapEnabled = await getSetting("salary_cap_enabled", "true");
    const budgetCap = await getSetting("budget_cap", "100");
    res.json({
      salary_cap_enabled: salaryCapEnabled.toLowerCase() === "true",
      budget_cap: Number(budgetCap),
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch settings" });
  }
});

router.post("/settings", async (req, res) => {
  try {
    const schema = z.object({
      salary_cap_enabled: z.boolean().optional(),
      budget_cap: z.number().optional(),
    });
    const data = schema.parse(req.body);

    if (data.salary_cap_enabled !== undefined) {
      await setSetting("salary_cap_enabled", String(data.salary_cap_enabled));
    }
    if (data.budget_cap !== undefined) {
      await setSetting("budget_cap", String(data.budget_cap));
    }

    res.json({ message: "Settings updated" });
  } catch (err: any) {
    res.status(400).json({ error: "Failed to update settings", details: err.errors || err.message });
  }
});

// ---------- Teams ----------
router.post("/add-team", async (req, res) => {
  try {
    const schema = z.object({
      team_name: z.string().min(1),
      division: z.string().optional().default(""),
      logo_url: z.string().optional().default(""),
    });
    const data = schema.parse(req.body);
    const team = {
      team_id: uuidv4(),
      ...data,
      created_at: new Date().toISOString(),
    };
    await appendRow("Teams", team);
    res.status(201).json({ team });
  } catch (err: any) {
    res.status(400).json({ error: "Failed to add team", details: err.errors || err.message });
  }
});

// ---------- Players ----------
router.post("/add-player", async (req, res) => {
  try {
    const schema = z.object({
      full_name: z.string().min(1),
      team_id: z.string(),
      position: z.string(),
      fantasy_price: z.number().optional().default(0),
      status: z.string().optional().default("active"),
      average_points: z.number().optional().default(0),
      average_rebounds: z.number().optional().default(0),
      average_assists: z.number().optional().default(0),
      photo_url: z.string().optional().default(""),
    });
    const data = schema.parse(req.body);
    const player = {
      player_id: uuidv4(),
      ...data,
      created_at: new Date().toISOString(),
    };
    await appendRow("Players", player);
    res.status(201).json({ player });
  } catch (err: any) {
    res.status(400).json({ error: "Failed to add player", details: err.errors || err.message });
  }
});

router.put("/edit-player/:id", async (req, res) => {
  try {
    const updated = await updateRow("Players", "player_id", req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: "Player not found" });
    res.json({ player: updated });
  } catch (err) {
    res.status(500).json({ error: "Failed to update player" });
  }
});

router.delete("/delete-player/:id", async (req, res) => {
  try {
    const ok = await deleteRow("Players", "player_id", req.params.id);
    if (!ok) return res.status(404).json({ error: "Player not found" });
    res.json({ message: "Player deleted" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete player" });
  }
});

// ---------- Gameweeks ----------
router.post("/create-week", async (req, res) => {
  try {
    const schema = z.object({
      start_date: z.string(),
      end_date: z.string(),
      submission_deadline: z.string(),
    });
    const data = schema.parse(req.body);
    const week = {
      week_id: uuidv4(),
      ...data,
      is_locked: "FALSE",
      created_at: new Date().toISOString(),
    };
    await appendRow("Weekly_Gameweek", week);
    res.status(201).json({ week });
  } catch (err: any) {
    res.status(400).json({ error: "Failed to create week", details: err.errors || err.message });
  }
});

router.post("/lock-week", async (req, res) => {
  try {
    const { week_id } = req.body;
    if (!week_id) return res.status(400).json({ error: "week_id is required" });
    const week = await lockWeekFn(week_id);
    if (!week) return res.status(404).json({ error: "Week not found" });
    res.json({ week });
  } catch (err) {
    res.status(500).json({ error: "Failed to lock week" });
  }
});

router.post("/reset-week", async (req: AuthRequest, res) => {
  try {
    const { week_id } = req.body;
    if (!week_id) return res.status(400).json({ error: "week_id is required" });
    await resetWeekFn(week_id);

    // TASK 5: audit log.
    await logAdminAction({
      admin_id: req.user?.user_id || "admin",
      action_type: "RESET_WEEK",
      entity_type: "WEEK",
      entity_id: week_id,
      details: "Week reset completed",
      status: "success",
    });

    res.json({ message: "Week reset successfully" });
  } catch (err) {
    res.status(500).json({ error: "Failed to reset week" });
  }
});

// ---------- Games & Stats ----------
router.post("/add-game", async (req, res) => {
  try {
    const schema = z.object({
      home_team: z.string(),
      away_team: z.string(),
      game_date: z.string(),
      status: z.string().optional().default("scheduled"),
    });
    const data = schema.parse(req.body);
    const game = { game_id: uuidv4(), ...data };
    await appendRow("Games", game);
    res.status(201).json({ game });
  } catch (err: any) {
    res.status(400).json({ error: "Failed to add game", details: err.errors || err.message });
  }
});

router.post("/input-stats", async (req, res) => {
  try {
    const schema = z.object({
      game_id: z.string(),
      player_id: z.string(),
      points: z.number().default(0),
      rebounds: z.number().default(0),
      assists: z.number().default(0),
      steals: z.number().default(0),
      blocks: z.number().default(0),
      turnovers: z.number().default(0),
      minutes_played: z.number().default(0),
    });
    const data = schema.parse(req.body);
    const stat = { stat_id: uuidv4(), ...data };
    await appendRow("Player_Stats", stat);
    res.status(201).json({ stat });
  } catch (err: any) {
    res.status(400).json({ error: "Failed to input stats", details: err.errors || err.message });
  }
});

// ---------- Selection Percentage ----------
// GET /admin/selection-stats?week_id=...
// Shows what % of managers (users who submitted a lineup that week) picked
// each player. Helps admins (and eventually users) see herd behavior -
// e.g. "Fedolph Marshall - Selected by 63% of managers."
router.get("/selection-stats", async (req, res) => {
  try {
    const weekId = req.query.week_id as string;
    if (!weekId) return res.status(400).json({ error: "week_id is required" });

    const [lineups, lineupPlayers, players] = await Promise.all([
      getSheetData("User_Lineups"),
      getSheetData("Lineup_Players"),
      getSheetData("Players"),
    ]);

    const weekLineups = lineups.filter((l) => String(l.week_id) === String(weekId));
    const totalManagers = weekLineups.length;
    const lineupIds = new Set(weekLineups.map((l) => l.lineup_id));

    const counts: Record<string, number> = {};
    for (const lp of lineupPlayers) {
      if (lineupIds.has(lp.lineup_id)) {
        counts[lp.player_id] = (counts[lp.player_id] || 0) + 1;
      }
    }

    const stats = Object.entries(counts)
      .map(([player_id, count]) => {
        const player = players.find((p) => p.player_id === player_id);
        return {
          player_id,
          full_name: player?.full_name || "Unknown player",
          count,
          percentage: totalManagers > 0 ? Math.round((count / totalManagers) * 100) : 0,
        };
      })
      .sort((a, b) => b.percentage - a.percentage);

    res.json({ total_managers: totalManagers, stats });
  } catch (err) {
    console.error("Get selection stats error:", err);
    res.status(500).json({ error: "Failed to fetch selection stats" });
  }
});

// ---------- Users ----------
router.get("/users", async (_req, res) => {
  try {
    const users = await getSheetData("Users");
    const safeUsers = users.map(({ password_hash, ...rest }) => rest);
    res.json({ users: safeUsers });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

router.delete("/users/:id", async (req, res) => {
  try {
    const ok = await deleteRow("Users", "user_id", req.params.id);
    if (!ok) return res.status(404).json({ error: "User not found" });
    res.json({ message: "User deleted" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete user" });
  }
});

// ---------- Sponsors ----------
router.post("/add-sponsor", async (req, res) => {
  try {
    const schema = z.object({
      company_name: z.string(),
      prize: z.string(),
      week_id: z.string(),
    });
    const data = schema.parse(req.body);
    const sponsor = { sponsor_id: uuidv4(), ...data };
    await appendRow("Sponsors", sponsor);
    res.status(201).json({ sponsor });
  } catch (err: any) {
    res.status(400).json({ error: "Failed to add sponsor", details: err.errors || err.message });
  }
});

export default router;
