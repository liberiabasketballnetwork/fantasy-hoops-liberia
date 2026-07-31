/**
 * Campaign Routes — GROWTH-002
 *
 * GET  /admin/campaigns                  — list all campaigns
 * POST /admin/campaigns                  — create draft campaign
 * GET  /admin/campaigns/:id              — campaign details + delivery status
 * GET  /admin/campaigns/:id/preview      — audience preview (no notifications written)
 * POST /admin/campaigns/:id/send         — trigger async delivery
 * POST /admin/campaigns/:id/cancel       — cancel draft
 * GET  /admin/campaigns/users/search     — user search for SINGLE_USER selection
 */

import express from "express";
import { authenticate, requireAdmin, AuthRequest } from "../middleware/auth";
import { logAdminAction } from "../services/adminActionLogger";
import {
  createCampaign,
  listCampaigns,
  getCampaign,
  previewCampaign,
  sendCampaign,
  cancelCampaign,
  searchUsers,
  AUDIENCE_LABELS,
} from "../services/campaignService";

const router = express.Router();

// ─── User search (must be before /:id routes) ─────────────────────────────

router.get("/admin/campaigns/users/search", authenticate, requireAdmin, async (req: AuthRequest, res) => {
  const { q } = req.query as { q?: string };
  if (!q || q.length < 2) return res.json({ users: [] });
  try {
    const users = await searchUsers(q);
    res.json({ users });
  } catch {
    res.status(500).json({ error: "Search failed." });
  }
});

// ─── List ─────────────────────────────────────────────────────────────────

router.get("/admin/campaigns", authenticate, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const campaigns = await listCampaigns();
    res.json({ campaigns, total: campaigns.length });
  } catch {
    res.status(500).json({ error: "Failed to load campaigns." });
  }
});

// ─── Create ───────────────────────────────────────────────────────────────

router.post("/admin/campaigns", authenticate, requireAdmin, async (req: AuthRequest, res) => {
  const { title, subject, message, notification_type, audience_type, audience_filter, link, priority } = req.body;
  if (!title?.trim())           return res.status(400).json({ error: "title is required." });
  if (!subject?.trim())         return res.status(400).json({ error: "subject is required." });
  if (!message?.trim())         return res.status(400).json({ error: "message is required." });
  if (!notification_type)       return res.status(400).json({ error: "notification_type is required." });
  if (!audience_type)           return res.status(400).json({ error: "audience_type is required." });
  if (!(audience_type in AUDIENCE_LABELS))
    return res.status(400).json({ error: `Invalid audience_type: ${audience_type}` });

  try {
    const result = await createCampaign({
      title, subject, message, notification_type, audience_type, audience_filter, link, priority,
      created_by: req.user!.user_id,
    });

    await logAdminAction({
      admin_id:    req.user!.user_id,
      action_type: "CREATE_CAMPAIGN",
      entity_type: "CAMPAIGN",
      entity_id:   result.campaign_id,
      details:     `Campaign "${title}" created. Audience: ${audience_type}.`,
      status:      "success",
    });

    res.status(201).json(result);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to create campaign." });
  }
});

// ─── Details ─────────────────────────────────────────────────────────────

router.get("/admin/campaigns/:id", authenticate, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const campaign = await getCampaign(req.params.id);
    if (!campaign) return res.status(404).json({ error: "Campaign not found." });
    res.json({ campaign });
  } catch {
    res.status(500).json({ error: "Failed to load campaign." });
  }
});

// ─── Preview ─────────────────────────────────────────────────────────────

router.get("/admin/campaigns/:id/preview", authenticate, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const preview = await previewCampaign(req.params.id, req.user!.user_id);
    res.json(preview);
  } catch (err: any) {
    res.status(400).json({ error: err?.message || "Preview failed." });
  }
});

// ─── Send ─────────────────────────────────────────────────────────────────

router.post("/admin/campaigns/:id/send", authenticate, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const result = await sendCampaign(req.params.id, req.user!.user_id);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err?.message || "Send failed." });
  }
});

// ─── Cancel ──────────────────────────────────────────────────────────────

router.post("/admin/campaigns/:id/cancel", authenticate, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const result = await cancelCampaign(req.params.id, req.user!.user_id);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err?.message || "Cancel failed." });
  }
});

export default router;
