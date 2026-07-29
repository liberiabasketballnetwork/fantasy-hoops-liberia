/**
 * Referral Reward Routes — FEATURE-003
 *
 * GET  /referral/my-rewards       — user's reward history
 * GET  /admin/referral-rewards    — admin: all rewards
 * POST /admin/referral-rewards/:id/approve  — approve
 * POST /admin/referral-rewards/:id/reject   — reject
 * POST /admin/referral-rewards/:id/mark-paid — mark paid
 */

import express from "express";
import { authenticate, requireAdmin, AuthRequest } from "../middleware/auth";
import {
  approveReward,
  rejectReward,
  markRewardPaid,
  getReferralRewardHistory,
} from "../services/referralRewardService";
import { getSheetData } from "../services/sheetsService";
import { logAdminAction } from "../services/adminActionLogger";

const router = express.Router();

// ─── User: my reward history ──────────────────────────────────────────────

router.get("/referral/my-rewards", authenticate, async (req: AuthRequest, res) => {
  try {
    const data = await getReferralRewardHistory(req.user!.user_id);
    res.json(data);
  } catch {
    res.status(500).json({ error: "Failed to load reward history." });
  }
});

// ─── Admin: list all rewards ──────────────────────────────────────────────

router.get("/admin/referral-rewards", authenticate, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { status } = req.query as { status?: string };
    const [rewards, users] = await Promise.all([
      getSheetData("Referral_Rewards"),
      getSheetData("Users"),
    ]);
    const userMap = new Map(users.map((u) => [u.user_id, u]));

    let filtered = rewards;
    if (status) filtered = filtered.filter((r) => r.status === status);
    filtered = filtered.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    const enriched = filtered.map((r) => {
      const referrer = userMap.get(r.referrer_user_id);
      const referred = userMap.get(r.referred_user_id);
      return {
        ...r,
        referrer_name: referrer?.display_name || referrer?.full_name || "Unknown",
        referred_name: referred?.display_name || referred?.full_name || "Unknown",
      };
    });

    res.json({ rewards: enriched, total: enriched.length });
  } catch {
    res.status(500).json({ error: "Failed to load rewards." });
  }
});

// ─── Admin: approve ───────────────────────────────────────────────────────

router.post(
  "/admin/referral-rewards/:id/approve",
  authenticate,
  requireAdmin,
  async (req: AuthRequest, res) => {
    const { id }          = req.params;
    const { admin_notes } = req.body;
    const result = await approveReward(id, req.user!.user_id, admin_notes || "");
    if (!result.ok) return res.status(400).json({ error: result.error });

    await logAdminAction({
      admin_id:    req.user!.user_id,
      action_type: "APPROVE_REFERRAL_REWARD",
      entity_type: "REFERRAL_REWARD",
      entity_id:   id,
      details:     `Reward ${id} approved. Notes: ${admin_notes || "none"}`,
      status:      "success",
    });

    res.json({ message: "Reward approved." });
  }
);

// ─── Admin: reject ────────────────────────────────────────────────────────

router.post(
  "/admin/referral-rewards/:id/reject",
  authenticate,
  requireAdmin,
  async (req: AuthRequest, res) => {
    const { id }          = req.params;
    const { admin_notes } = req.body;
    if (!admin_notes?.trim())
      return res.status(400).json({ error: "admin_notes is required for rejection." });

    const result = await rejectReward(id, req.user!.user_id, admin_notes);
    if (!result.ok) return res.status(400).json({ error: result.error });

    await logAdminAction({
      admin_id:    req.user!.user_id,
      action_type: "REJECT_REFERRAL_REWARD",
      entity_type: "REFERRAL_REWARD",
      entity_id:   id,
      details:     `Reward ${id} rejected. Reason: ${admin_notes}`,
      status:      "success",
    });

    res.json({ message: "Reward rejected." });
  }
);

// ─── Admin: mark paid ─────────────────────────────────────────────────────

router.post(
  "/admin/referral-rewards/:id/mark-paid",
  authenticate,
  requireAdmin,
  async (req: AuthRequest, res) => {
    const { id }                           = req.params;
    const { payment_reference, admin_notes } = req.body;

    const result = await markRewardPaid(id, req.user!.user_id, payment_reference, admin_notes || "");
    if (!result.ok) return res.status(400).json({ error: result.error });

    await logAdminAction({
      admin_id:    req.user!.user_id,
      action_type: "MARK_REFERRAL_REWARD_PAID",
      entity_type: "REFERRAL_REWARD",
      entity_id:   id,
      details:     `Reward ${id} marked paid. Reference: ${payment_reference}`,
      status:      "success",
    });

    res.json({ message: "Reward marked as paid." });
  }
);

export default router;
