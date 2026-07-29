/**
 * Team Routes — FEATURE-002
 *
 * GET  /teams                   — public, active teams (existing)
 * GET  /admin/teams             — admin, all teams with status
 * PATCH /admin/teams/:id/status — admin, update team status + log
 */

import express from "express";
import { getSheetData, updateRow } from "../services/sheetsService";
import { authenticate, requireAdmin, AuthRequest } from "../middleware/auth";
import { logAdminAction } from "../services/adminActionLogger";

const router = express.Router();

const VALID_STATUSES = ["Active", "Eliminated", "Suspended"] as const;
type TeamStatus = typeof VALID_STATUSES[number];

// ─── Public: active teams (existing behaviour preserved) ─────────────────

router.get("/teams", async (_req, res) => {
  try {
    const teams = await getSheetData("Teams");
    // Only return Active teams to the public endpoint
    const active = teams.filter(
      (t) => !t.status || String(t.status).trim() === "Active"
    );
    res.json({ teams: active });
  } catch {
    res.status(500).json({ error: "Failed to fetch teams." });
  }
});

// ─── Admin: all teams with status ─────────────────────────────────────────

router.get("/admin/teams", authenticate, requireAdmin, async (_req: AuthRequest, res) => {
  try {
    const teams = await getSheetData("Teams");
    res.json({ teams });
  } catch {
    res.status(500).json({ error: "Failed to fetch teams." });
  }
});

// ─── Admin: update team status ────────────────────────────────────────────

router.patch(
  "/admin/teams/:team_id/status",
  authenticate,
  requireAdmin,
  async (req: AuthRequest, res) => {
    const { team_id } = req.params;
    const { status }  = req.body as { status: string };

    if (!VALID_STATUSES.includes(status as TeamStatus)) {
      return res.status(400).json({
        error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}.`,
      });
    }

    try {
      const teams   = await getSheetData("Teams");
      const team    = teams.find((t) => String(t.team_id) === String(team_id));
      if (!team) return res.status(404).json({ error: "Team not found." });

      const previousStatus = String(team.status || "Active");

      await updateRow("Teams", "team_id", team_id, {
        ...team,
        status,
      });

      // FEATURE-002: audit log every status change
      await logAdminAction({
        admin_id:    req.user!.user_id,
        action_type: "UPDATE_TEAM_STATUS",
        entity_type: "TEAM",
        entity_id:   team_id,
        details:     `Team "${team.team_name}" status changed from "${previousStatus}" to "${status}".`,
        status:      "success",
      });

      res.json({
        message:         `Team status updated to "${status}".`,
        team_id,
        team_name:       team.team_name,
        previous_status: previousStatus,
        new_status:      status,
      });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to update team status." });
    }
  }
);

export default router;
