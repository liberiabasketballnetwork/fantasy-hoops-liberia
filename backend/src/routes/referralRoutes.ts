/**
 * Referral Routes — GEP-002.1
 *
 * GET  /referral/my-code           — authenticated user's referral code + link
 * GET  /referral/my-history        — list of users referred by this manager
 * GET  /referral/validate/:code    — public: is this code valid?
 */

import express from "express";
import { authenticate, AuthRequest } from "../middleware/auth";
import {
  ensureReferralCode,
  getReferralHistory,
  findReferrerByCode,
} from "../services/referralService";

const router  = express.Router();
const BASE_URL = process.env.FRONTEND_URL || "https://fantasyhoops.online";

// ─── My referral code + link ──────────────────────────────────────────────

router.get("/referral/my-code", authenticate, async (req: AuthRequest, res) => {
  try {
    const code = await ensureReferralCode(req.user!.user_id);
    res.json({
      referral_code: code,
      referral_link: `${BASE_URL}/register?ref=${code}`,
    });
  } catch (err: any) {
    res.status(500).json({ error: "Could not retrieve referral code." });
  }
});

// ─── My referral history ──────────────────────────────────────────────────

router.get("/referral/my-history", authenticate, async (req: AuthRequest, res) => {
  try {
    const history = await getReferralHistory(req.user!.user_id);
    res.json({ referrals: history, total: history.length });
  } catch {
    res.status(500).json({ error: "Could not load referral history." });
  }
});

// ─── Validate a code (public — used by registration page) ─────────────────

router.get("/referral/validate/:code", async (req, res) => {
  try {
    const code = req.params.code?.toUpperCase();
    const referrer_user_id = await findReferrerByCode(code);
    if (!referrer_user_id) {
      return res.status(404).json({ valid: false, error: "Referral code not found." });
    }
    res.json({ valid: true });
  } catch {
    res.status(500).json({ valid: false, error: "Validation failed." });
  }
});

export default router;
