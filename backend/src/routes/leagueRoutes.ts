import express from "express";
import { authenticate, AuthRequest } from "../middleware/auth";
import {
  createLeague,
  joinLeague,
  getMyLeagues,
  getLeagueDetails,
  leaveLeague,
} from "../services/leagueService";
import { getSheetData } from "../services/sheetsService";
import { dispatchLeagueMembershipNotification } from "../services/leagueNotificationProducer";

const router = express.Router();

// POST /leagues — create a new league
router.post("/leagues", authenticate, async (req: AuthRequest, res) => {
  try {
    const { league_name, description } = req.body;
    const league = await createLeague(req.user!.user_id, league_name, description);
    res.status(201).json({ league, message: `League "${league.league_name}" created! Invite code: ${league.invite_code}` });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Failed to create league." });
  }
});

// POST /leagues/join — join via invite code
router.post("/leagues/join", authenticate, async (req: AuthRequest, res) => {
  try {
    const { invite_code } = req.body;
    if (!invite_code) return res.status(400).json({ error: "invite_code is required." });
    const league = await joinLeague(req.user!.user_id, invite_code);

    // Fire-and-forget: notify league owner of new member — NOTIFY-006
    (async () => {
      try {
        // Fetch the joining user's display name for the notification title
        const users = await getSheetData("Users");
        const joiningUser = users.find((u) => u.user_id === req.user!.user_id);
        const memberName = joiningUser?.display_name || joiningUser?.full_name || "A manager";

        // Count current members (after join)
        const allMembers = await getSheetData("League_Members");
        const memberCount = allMembers.filter((m) => m.league_id === league.league_id).length;

        await dispatchLeagueMembershipNotification(
          league as any,
          req.user!.user_id,
          memberName,
          memberCount
        );
      } catch (err: any) {
        console.error("[leagueRoutes] Membership producer error:", err?.message || err);
      }
    })();

    res.json({ league, message: `You have joined "${league.league_name}".` });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Failed to join league." });
  }
});

// GET /leagues — my leagues
router.get("/leagues", authenticate, async (req: AuthRequest, res) => {
  try {
    const leagues = await getMyLeagues(req.user!.user_id);
    res.json({ leagues });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to fetch leagues." });
  }
});

// GET /leagues/:leagueId — league details + standings
router.get("/leagues/:leagueId", authenticate, async (req: AuthRequest, res) => {
  try {
    const result = await getLeagueDetails(req.params.leagueId, req.user!.user_id);
    res.json(result);
  } catch (err: any) {
    const status = err.message?.includes("not found") || err.message?.includes("not a member") ? 404 : 400;
    res.status(status).json({ error: err.message || "Failed to fetch league." });
  }
});

// POST /leagues/:leagueId/leave — leave a league
router.post("/leagues/:leagueId/leave", authenticate, async (req: AuthRequest, res) => {
  try {
    await leaveLeague(req.params.leagueId, req.user!.user_id);
    res.json({ message: "You have left the league." });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Failed to leave league." });
  }
});

export default router;
