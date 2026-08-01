/**
 * prizePayoutRoutes.ts — BUSINESS-002
 *
 * Rewards & Prize Management API.
 * All admin routes require authenticate + requireAdmin.
 * User history route requires authenticate only.
 */

import express from "express";
import { authenticate, requireAdmin, AuthRequest } from "../middleware/auth";
import {
  createPayout, listPayouts, getPayoutSummary, toPublicPayout,
  approvePayout, rejectPayout, markPayoutPaid, completePayout,
  cancelPayout, reversePayout, generateWeeklyPrizePayouts,
  getPrizeAnalytics, SOURCE_LABELS,
} from "../services/prizePayoutService";
import { getSheetData } from "../services/sheetsService";

const router = express.Router();

// ─── Summary (before /:id to avoid route collision) ───────────────────────

router.get("/admin/prize-payouts/summary", authenticate, requireAdmin, async (_req, res) => {
  try {
    const summary = await getPayoutSummary();
    res.json(summary);
  } catch {
    res.status(500).json({ error: "Failed to load summary." });
  }
});

// ─── Generate weekly prizes (before /:id) ────────────────────────────────

router.post("/admin/prize-payouts/generate-weekly/:week_id", authenticate, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const result = await generateWeeklyPrizePayouts(req.params.week_id, req.user!.user_id);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err?.message || "Generation failed." });
  }
});

// ─── List ─────────────────────────────────────────────────────────────────

router.get("/admin/prize-payouts", authenticate, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { status, week_id, source_type, sponsor_id } = req.query as Record<string, string>;
    const payouts = await listPayouts({ status, week_id, source_type, sponsor_id });
    res.json({ payouts, total: payouts.length });
  } catch {
    res.status(500).json({ error: "Failed to load payouts." });
  }
});

// ─── Create ───────────────────────────────────────────────────────────────

router.post("/admin/prize-payouts", authenticate, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const payout = await createPayout({ ...req.body, created_by: req.user!.user_id });
    res.status(201).json({ payout });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || "Creation failed." });
  }
});

// ─── Get single ───────────────────────────────────────────────────────────

router.get("/admin/prize-payouts/:id", authenticate, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const rows   = await getSheetData("Prize_Payouts");
    const payout = rows.find((p) => p.payout_id === req.params.id);
    if (!payout) return res.status(404).json({ error: "Payout not found." });
    res.json({ payout });
  } catch {
    res.status(500).json({ error: "Failed to load payout." });
  }
});

// ─── Lifecycle transitions ────────────────────────────────────────────────

router.post("/admin/prize-payouts/:id/approve", authenticate, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const result = await approvePayout(req.params.id, req.user!.user_id, req.body.admin_notes);
    res.json(result);
  } catch (err: any) { res.status(400).json({ error: err?.message }); }
});

router.post("/admin/prize-payouts/:id/reject", authenticate, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const result = await rejectPayout(req.params.id, req.user!.user_id, req.body.admin_notes);
    res.json(result);
  } catch (err: any) { res.status(400).json({ error: err?.message }); }
});

router.post("/admin/prize-payouts/:id/mark-paid", authenticate, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const result = await markPayoutPaid(req.params.id, req.user!.user_id, req.body.payment_reference, req.body.admin_notes);
    res.json(result);
  } catch (err: any) { res.status(400).json({ error: err?.message }); }
});

router.post("/admin/prize-payouts/:id/complete", authenticate, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const result = await completePayout(req.params.id, req.user!.user_id);
    res.json(result);
  } catch (err: any) { res.status(400).json({ error: err?.message }); }
});

router.post("/admin/prize-payouts/:id/cancel", authenticate, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const result = await cancelPayout(req.params.id, req.user!.user_id, req.body.admin_notes);
    res.json(result);
  } catch (err: any) { res.status(400).json({ error: err?.message }); }
});

router.post("/admin/prize-payouts/:id/reverse", authenticate, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const result = await reversePayout(req.params.id, req.user!.user_id, req.body.admin_notes);
    res.json(result);
  } catch (err: any) { res.status(400).json({ error: err?.message }); }
});

// ─── User history (own prizes only — no sensitive fields) ─────────────────

router.get("/user/prizes/my-history", authenticate, async (req: AuthRequest, res) => {
  try {
    const rows  = await getSheetData("Prize_Payouts");
    const mine  = rows
      .filter((p) => p.recipient_user_id === req.user!.user_id)
      .map(toPublicPayout)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    res.json({ prizes: mine, total: mine.length });
  } catch {
    res.status(500).json({ error: "Failed to load prize history." });
  }
});

export default router;
