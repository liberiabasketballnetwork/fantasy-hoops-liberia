/**
 * Sponsor Routes — BUSINESS-001
 *
 * GET    /admin/sponsors
 * POST   /admin/sponsors
 * GET    /admin/sponsors/:id
 * PATCH  /admin/sponsors/:id
 * GET    /admin/sponsors/:id/analytics
 * POST   /admin/sponsors/:id/deactivate
 * PATCH  /admin/weeks/:week_id/sponsor    — assign sponsor to gameweek
 */

import express from "express";
import { authenticate, requireAdmin, AuthRequest } from "../middleware/auth";
import {
  createSponsor, updateSponsor, deactivateSponsor,
  getSponsor, listSponsors, getSponsorAnalytics, toPublicSponsor,
} from "../services/sponsorService";
import { getSheetData, updateRow } from "../services/sheetsService";
import { logAdminAction } from "../services/adminActionLogger";

const router = express.Router();

// ─── List ─────────────────────────────────────────────────────────────────

router.get("/admin/sponsors", authenticate, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const sponsors = await listSponsors();
    res.json({ sponsors: sponsors.map(toPublicSponsor), total: sponsors.length });
  } catch {
    res.status(500).json({ error: "Failed to load sponsors." });
  }
});

// ─── Create ───────────────────────────────────────────────────────────────

router.post("/admin/sponsors", authenticate, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const sponsor = await createSponsor(req.body, req.user!.user_id);
    res.status(201).json({ sponsor: toPublicSponsor(sponsor) });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || "Failed to create sponsor." });
  }
});

// ─── Get ──────────────────────────────────────────────────────────────────

router.get("/admin/sponsors/:id", authenticate, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const sponsor = await getSponsor(req.params.id);
    if (!sponsor) return res.status(404).json({ error: "Sponsor not found." });
    res.json({ sponsor: toPublicSponsor(sponsor) });
  } catch {
    res.status(500).json({ error: "Failed to load sponsor." });
  }
});

// ─── Update ───────────────────────────────────────────────────────────────

router.patch("/admin/sponsors/:id", authenticate, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const sponsor = await updateSponsor(req.params.id, req.body, req.user!.user_id);
    res.json({ sponsor: toPublicSponsor(sponsor) });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || "Failed to update sponsor." });
  }
});

// ─── Analytics ────────────────────────────────────────────────────────────

router.get("/admin/sponsors/:id/analytics", authenticate, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const analytics = await getSponsorAnalytics(req.params.id);
    res.json(analytics);
  } catch (err: any) {
    res.status(400).json({ error: err?.message || "Failed to load analytics." });
  }
});

// ─── Deactivate ───────────────────────────────────────────────────────────

router.post("/admin/sponsors/:id/deactivate", authenticate, requireAdmin, async (req: AuthRequest, res) => {
  try {
    await deactivateSponsor(req.params.id, req.user!.user_id);
    res.json({ message: "Sponsor deactivated." });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || "Failed to deactivate." });
  }
});

// ─── Assign sponsor to gameweek ───────────────────────────────────────────

router.patch("/admin/weeks/:week_id/sponsor", authenticate, requireAdmin, async (req: AuthRequest, res) => {
  const { sponsor_id } = req.body;
  try {
    const weeks = await getSheetData("Weekly_Gameweek");
    const week  = weeks.find((w) => String(w.week_id) === String(req.params.week_id));
    if (!week) return res.status(404).json({ error: "Gameweek not found." });

    // Validate sponsor exists if assigning (allow null to clear)
    let sponsorName = "";
    if (sponsor_id) {
      const sponsor = await getSponsor(sponsor_id);
      if (!sponsor) return res.status(404).json({ error: "Sponsor not found." });
      sponsorName = sponsor.company_name;
    }

    await updateRow("Weekly_Gameweek", "week_id", req.params.week_id, {
      ...week,
      sponsor_id: sponsor_id || "",
    });

    await logAdminAction({
      admin_id:    req.user!.user_id,
      action_type: "ASSIGN_SPONSOR",
      entity_type: "WEEK",
      entity_id:   req.params.week_id,
      details:     sponsor_id
        ? `Gameweek sponsored by "${sponsorName}".`
        : "Sponsor removed from gameweek.",
      status: "success",
    });

    res.json({
      message: sponsor_id
        ? `Gameweek now sponsored by "${sponsorName}".`
        : "Sponsor removed.",
      week_id: req.params.week_id,
      sponsor_id: sponsor_id || null,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to assign sponsor." });
  }
});

export default router;
