import express from "express";
import { authenticate, AuthRequest } from "../middleware/auth";
import {
  createLeague,
  joinLeague,
  getMyLeagues,
  getLeagueDetails,
  leaveLeague,
} from "../services/leagueService";

const router = express.Router();
router.use(authenticate);

// POST /leagues — create a new league
router.post("/leagues", async (req: AuthRequest, res) => {
  try {
    const { league_name, description } = req.body;
    const league = await createLeague(req.user!.user_id, league_name, description);
    res.status(201).json({ league, message: `League "${league.league_name}" created! Invite code: ${league.invite_code}` });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Failed to create league." });
  }
});

// POST /leagues/join — join via invite code
router.post("/leagues/join", async (req: AuthRequest, res) => {
  try {
    const { invite_code } = req.body;
    if (!invite_code) return res.status(400).json({ error: "invite_code is required." });
    const league = await joinLeague(req.user!.user_id, invite_code);
    res.json({ league, message: `You have joined "${league.league_name}".` });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Failed to join league." });
  }
});

// GET /leagues — my leagues
router.get("/leagues", async (req: AuthRequest, res) => {
  try {
    const leagues = await getMyLeagues(req.user!.user_id);
    res.json({ leagues });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to fetch leagues." });
  }
});

// GET /leagues/:leagueId — league details + standings
router.get("/leagues/:leagueId", async (req: AuthRequest, res) => {
  try {
    const result = await getLeagueDetails(req.params.leagueId, req.user!.user_id);
    res.json(result);
  } catch (err: any) {
    const status = err.message?.includes("not found") || err.message?.includes("not a member") ? 404 : 400;
    res.status(status).json({ error: err.message || "Failed to fetch league." });
  }
});

// POST /leagues/:leagueId/leave — leave a league
router.post("/leagues/:leagueId/leave", async (req: AuthRequest, res) => {
  try {
    await leaveLeague(req.params.leagueId, req.user!.user_id);
    res.json({ message: "You have left the league." });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Failed to leave league." });
  }
});

export default router;
