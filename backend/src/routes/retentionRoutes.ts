/**
 * Retention Routes — GROWTH-003
 *
 * POST /admin/retention/generate       — evaluate rules, create pending recommendations
 * GET  /admin/retention/recommendations — list all recommendations
 * POST /admin/retention/:id/convert    — convert to campaign draft
 * POST /admin/retention/:id/dismiss    — dismiss recommendation
 * GET  /admin/retention/analytics      — recommendation performance metrics
 */

import express from "express";
import { authenticate, requireAdmin, AuthRequest } from "../middleware/auth";
import {
  generateRecommendations,
  listRecommendations,
  convertToCampaign,
  dismissRecommendation,
  getRetentionAnalytics,
} from "../services/retentionRecommendationService";

const router = express.Router();

// ─── Analytics (before /:id to avoid route collision) ────────────────────

router.get("/admin/retention/analytics", authenticate, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const analytics = await getRetentionAnalytics();
    res.json(analytics);
  } catch {
    res.status(500).json({ error: "Failed to load retention analytics." });
  }
});

// ─── Generate ─────────────────────────────────────────────────────────────

router.post("/admin/retention/generate", authenticate, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const recommendations = await generateRecommendations(req.user!.user_id);
    res.json({ generated: recommendations.length, recommendations });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Generation failed." });
  }
});

// ─── List ─────────────────────────────────────────────────────────────────

router.get("/admin/retention/recommendations", authenticate, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { status } = req.query as { status?: string };
    let recs = await listRecommendations();
    if (status) recs = recs.filter((r) => r.status === status);
    res.json({ recommendations: recs, total: recs.length });
  } catch {
    res.status(500).json({ error: "Failed to load recommendations." });
  }
});

// ─── Convert ──────────────────────────────────────────────────────────────

router.post("/admin/retention/:id/convert", authenticate, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const result = await convertToCampaign(req.params.id, req.user!.user_id);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err?.message || "Conversion failed." });
  }
});

// ─── Dismiss ──────────────────────────────────────────────────────────────

router.post("/admin/retention/:id/dismiss", authenticate, requireAdmin, async (req: AuthRequest, res) => {
  try {
    await dismissRecommendation(req.params.id, req.user!.user_id);
    res.json({ message: "Recommendation dismissed." });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || "Dismiss failed." });
  }
});

export default router;
