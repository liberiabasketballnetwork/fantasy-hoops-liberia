import express from "express";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import crypto from "crypto";
import bcrypt from "bcryptjs";
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
import { calculatePlayerFantasyScore } from "../services/scoringEngine";

const router = express.Router();
router.use(authenticate, requireAdmin);

// Settings
router.get("/settings", async (_req, res) => {
  try {
    const salary_cap_enabled = (await getSetting("salary_cap_enabled", "true")).toLowerCase() === "true";
    const budget_cap = Number(await getSetting("budget_cap", "100"));
    res.json({ salary_cap_enabled, budget_cap });
  } catch (err) { res.status(500).json({ error: "Failed to fetch settings" }); }
});

router.post("/settings", async (req, res) => {
  try {
    const { salary_cap_enabled, budget_cap } = req.body;
    if (salary_cap_enabled !== undefined) await setSetting("salary_cap_enabled", String(salary_cap_enabled));
    if (budget_cap !== undefined) await setSetting("budget_cap", String(budget_cap));
    res.json({ message: "Settings updated" });
  } catch (err) { res.status(500).json({ error: "Failed to update settings" }); }
});

// Teams
router.post("/add-team", async (req, res) => {
  try {
    const { team_name, division } = req.body;
    if (!team_name) return res.status(400).json({ error: "team_name is required" });
    const team = { team_id: uuidv4(), team_name, division: division || "", logo_url: "", created_at: new Date().toISOString() };
    await appendRow("Teams", team);
    res.status(201).json({ team });
  } catch (err) { res.status(500).json({ error: "Failed to add team" }); }
});

// Players
router.post("/add-player", async (req, res) => {
  try {
    const { full_name, team_id, position, fantasy_price, status } = req.body;
    if (!full_name || !team_id) return res.status(400).json({ error: "full_name and team_id are required" });
    const player = { player_id: uuidv4(), full_name, team_id, position: position || "PG", fantasy_price: fantasy_price || 6, status: status || "active", games_played: 0, average_points: 0, average_rebounds: 0, average_assists: 0, photo_url: "", import_alias: "", source: "admin", created_at: new Date().toISOString() };
    await appendRow("Players", player);
    res.status(201).json({ player });
  } catch (err) { res.status(500).json({ error: "Failed to add player" }); }
});

const POSITIONS = ["PG", "SG", "SF", "PF", "C"] as const;

router.patch("/players/:id", async (req, res) => {
  try {
    // Only these fields may be updated
    const { full_name, team_id, position, fantasy_price, status } = req.body;
    const updates: Record<string, any> = {};

    if (full_name !== undefined) {
      if (!String(full_name).trim()) return res.status(400).json({ error: "Player name is required." });
      updates.full_name = String(full_name).trim();
    }
    if (team_id !== undefined) updates.team_id = team_id;
    if (position !== undefined) {
      if (!(POSITIONS as readonly string[]).includes(position))
        return res.status(400).json({ error: `Position must be one of: ${POSITIONS.join(", ")}.` });
      updates.position = position;
    }
    if (fantasy_price !== undefined) {
      const price = Number(fantasy_price);
      if (isNaN(price) || price < 5 || price > 30)
        return res.status(400).json({ error: "Fantasy price must be between 5 and 30." });
      updates.fantasy_price = price;
    }
    if (status !== undefined) {
      if (!["active", "inactive"].includes(String(status).toLowerCase()))
        return res.status(400).json({ error: "Status must be 'active' or 'inactive'." });
      updates.status = String(status).toLowerCase();
    }

    if (Object.keys(updates).length === 0)
      return res.status(400).json({ error: "No valid fields provided to update." });

    const updated = await updateRow("Players", "player_id", req.params.id, updates);
    if (!updated) return res.status(404).json({ error: "Player not found." });
    res.json({ player: updated, message: "Player updated successfully." });
  } catch (err) { res.status(500).json({ error: "Failed to update player." }); }
});

router.put("/players/:id", async (req, res) => {
  try {
    const updated = await updateRow("Players", "player_id", req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: "Player not found" });
    res.json({ player: updated });
  } catch (err) { res.status(500).json({ error: "Failed to update player" }); }
});

router.delete("/delete-player/:id", async (req, res) => {
  try {
    const ok = await deleteRow("Players", "player_id", req.params.id);
    if (!ok) return res.status(404).json({ error: "Player not found" });
    res.json({ message: "Player deleted" });
  } catch (err) { res.status(500).json({ error: "Failed to delete player" }); }
});

// Weeks
router.post("/create-week", async (req, res) => {
  try {
    const { start_date, end_date, submission_deadline } = req.body;
    if (!start_date || !end_date || !submission_deadline) return res.status(400).json({ error: "start_date, end_date, and submission_deadline are required" });
    const week = { week_id: uuidv4(), start_date, end_date, submission_deadline, is_locked: "FALSE", scores_calculated: "FALSE", prices_updated: "FALSE", created_at: new Date().toISOString() };
    await appendRow("Weekly_Gameweek", week);
    res.status(201).json({ week });
  } catch (err) { res.status(500).json({ error: "Failed to create week" }); }
});

router.post("/lock-week", async (req, res) => {
  try {
    const { week_id } = req.body;
    if (!week_id) return res.status(400).json({ error: "week_id is required" });
    await lockWeekFn(week_id);
    res.json({ message: "Week locked" });
  } catch (err) { res.status(500).json({ error: "Failed to lock week" }); }
});

router.post("/reset-week", async (req: AuthRequest, res) => {
  try {
    const { week_id } = req.body;
    if (!week_id) return res.status(400).json({ error: "week_id is required" });
    await resetWeekFn(week_id);
    await logAdminAction({ admin_id: req.user?.user_id || "admin", action_type: "RESET_WEEK", entity_type: "WEEK", entity_id: week_id, details: "Week reset completed", status: "success" });
    res.json({ message: "Week reset successfully" });
  } catch (err) { res.status(500).json({ error: "Failed to reset week" }); }
});

// Games
router.post("/add-game", async (req, res) => {
  try {
    const schema = z.object({ home_team: z.string(), away_team: z.string(), game_date: z.string(), status: z.string().optional().default("scheduled") });
    const data = schema.parse(req.body);
    const game = { game_id: uuidv4(), ...data };
    await appendRow("Games", game);
    res.status(201).json({ game });
  } catch (err: any) { res.status(400).json({ error: "Failed to add game", details: err.errors || err.message }); }
});

router.post("/force-add-game", async (req: AuthRequest, res) => {
  try {
    const schema = z.object({ home_team: z.string().min(1), away_team: z.string().min(1), game_date: z.string().min(1), week_id: z.string().min(1), status: z.string().optional().default("scheduled") });
    const data = schema.parse(req.body);
    const week = await getSheetData("Weekly_Gameweek");
    const targetWeek = week.find((w) => String(w.week_id) === String(data.week_id));
    if (!targetWeek) return res.status(404).json({ error: "Gameweek not found." });
    if (String(targetWeek.is_locked).toUpperCase() !== "TRUE") return res.status(400).json({ error: "This week is not locked. Use the normal Add Game route instead." });
    const { week_id: _w, ...gameData } = data;
    const game = { game_id: uuidv4(), ...gameData };
    await appendRow("Games", game);
    await logAdminAction({ admin_id: req.user?.user_id || "admin", action_type: "FORCE_ADD_GAME", entity_type: "GAME", entity_id: game.game_id, details: `Game added after week lock: ${data.home_team} vs ${data.away_team} on ${data.game_date}`, status: "success" });
    res.status(201).json({ game, message: "Game added successfully via admin override. Week remains locked for users." });
  } catch (err: any) {
    if (err.name === "ZodError") return res.status(400).json({ error: "Invalid input", details: err.errors });
    res.status(500).json({ error: "Failed to add game via override" });
  }
});

// Stats
router.post("/input-stats", async (req, res) => {
  try {
    const { game_id, player_id, points, rebounds, assists, steals, blocks, turnovers, minutes_played } = req.body;
    if (!game_id || !player_id) return res.status(400).json({ error: "game_id and player_id are required" });
    const rawStats = { points: points || 0, rebounds: rebounds || 0, assists: assists || 0, steals: steals || 0, blocks: blocks || 0, turnovers: turnovers || 0 };
    const fantasy_points = calculatePlayerFantasyScore(rawStats);
    const stat = { stat_id: uuidv4(), game_id, player_id, ...rawStats, minutes_played: minutes_played || 0, fantasy_points: fantasy_points.toFixed(2) };
    await appendRow("Player_Stats", stat);
    res.status(201).json({ stat });
  } catch (err) { res.status(500).json({ error: "Failed to add stat" }); }
});

// Selection stats
router.get("/selection-stats", async (_req, res) => {
  try {
    const weeks = await getSheetData("Weekly_Gameweek");
    if (weeks.length === 0) return res.json({ total_managers: 0, stats: [] });
    const latestWeek = weeks.sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime())[0];
    const [lineups, lineupPlayers, players] = await Promise.all([getSheetData("User_Lineups"), getSheetData("Lineup_Players"), getSheetData("Players")]);
    const weekLineups = lineups.filter((l) => String(l.week_id) === String(latestWeek.week_id));
    const totalManagers = weekLineups.length;
    const lineupIds = new Set(weekLineups.map((l) => l.lineup_id));
    const counts: Record<string, number> = {};
    for (const lp of lineupPlayers) { if (lineupIds.has(lp.lineup_id)) counts[lp.player_id] = (counts[lp.player_id] || 0) + 1; }
    const stats = Object.entries(counts).map(([player_id, count]) => {
      const player = players.find((p) => p.player_id === player_id);
      return { player_id, full_name: player?.full_name || "Unknown", count, percentage: totalManagers > 0 ? Math.round((count / totalManagers) * 100) : 0 };
    }).sort((a, b) => b.percentage - a.percentage);
    res.json({ week: latestWeek, total_managers: totalManagers, stats });
  } catch (err) { res.status(500).json({ error: "Failed to fetch selection stats" }); }
});

// Users
router.get("/users", async (_req, res) => {
  try {
    const users = await getSheetData("Users");
    const safeUsers = users.map(({ password_hash, ...rest }) => rest);
    res.json({ users: safeUsers });
  } catch (err) { res.status(500).json({ error: "Failed to fetch users" }); }
});

// ADMIN-009: Raw data endpoints for Score Verification Console
router.get("/data/user-lineups",     async (_req, res) => { try { res.json({ rows: await getSheetData("User_Lineups") });     } catch { res.status(500).json({ error: "Failed" }); } });
router.get("/data/lineup-players",   async (_req, res) => { try { res.json({ rows: await getSheetData("Lineup_Players") });   } catch { res.status(500).json({ error: "Failed" }); } });
router.get("/data/player-stats",     async (_req, res) => { try { res.json({ rows: await getSheetData("Player_Stats") });     } catch { res.status(500).json({ error: "Failed" }); } });
router.get("/data/leaderboard",      async (_req, res) => { try { res.json({ rows: await getSheetData("Leaderboard") });      } catch { res.status(500).json({ error: "Failed" }); } });
router.get("/data/games",            async (_req, res) => { try { res.json({ rows: await getSheetData("Games") });            } catch { res.status(500).json({ error: "Failed" }); } });
router.get("/data/weekly-gameweek",  async (_req, res) => { try { res.json({ rows: await getSheetData("Weekly_Gameweek") }); } catch { res.status(500).json({ error: "Failed" }); } });

router.delete("/users/:id", async (req, res) => {
  try {
    const ok = await deleteRow("Users", "user_id", req.params.id);
    if (!ok) return res.status(404).json({ error: "User not found" });
    res.json({ message: "User deleted" });
  } catch (err) { res.status(500).json({ error: "Failed to delete user" }); }
});

router.patch("/users/:id/display-name", async (req: AuthRequest, res) => {
  try {
    const { display_name } = req.body;
    if (!display_name) return res.status(400).json({ error: "display_name is required" });
    const { validateDisplayName, isDisplayNameTaken } = await import("../utils/displayNameUtils");
    const validation = validateDisplayName(display_name);
    if (!validation.valid) return res.status(400).json({ error: validation.error });
    const allUsers = await getSheetData("Users");
    if (isDisplayNameTaken(validation.trimmed!, allUsers, req.params.id)) return res.status(409).json({ error: `The display name "${validation.trimmed}" is already taken.` });
    const updated = await updateRow("Users", "user_id", req.params.id, { display_name: validation.trimmed });
    if (!updated) return res.status(404).json({ error: "User not found" });
    res.json({ message: "Display name updated.", display_name: validation.trimmed });
  } catch (err) { res.status(500).json({ error: "Failed to update display name" }); }
});

router.post("/users/:id/reset-password", async (req: AuthRequest, res) => {
  try {
    const allUsers = await getSheetData("Users");
    const user = allUsers.find((u) => u.user_id === req.params.id);
    if (!user) return res.status(404).json({ error: "User not found" });
    const CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
    const randomBytes = crypto.randomBytes(12);
    const tempPassword = Array.from(randomBytes).map((b) => CHARSET[(b as number) % CHARSET.length]).join("");
    const password_hash = await bcrypt.hash(tempPassword, 10);
    await updateRow("Users", "user_id", req.params.id, { password_hash });
    await logAdminAction({ admin_id: req.user?.user_id || "admin", action_type: "RESET_PASSWORD", entity_type: "USER", entity_id: req.params.id, details: `Password reset for user ${user.display_name || user.full_name}`, status: "success" });
    res.json({ message: "Password reset successfully.", temp_password: tempPassword });
  } catch (err) { res.status(500).json({ error: "Failed to reset password" }); }
});

// Sponsors
router.post("/add-sponsor", async (req, res) => {
  try {
    const { name, logo_url, website_url } = req.body;
    if (!name) return res.status(400).json({ error: "name is required" });
    await appendRow("Sponsors", { sponsor_id: uuidv4(), name, logo_url: logo_url || "", website_url: website_url || "", created_at: new Date().toISOString() });
    res.status(201).json({ message: "Sponsor added" });
  } catch (err) { res.status(500).json({ error: "Failed to add sponsor" }); }
});

export default router;
