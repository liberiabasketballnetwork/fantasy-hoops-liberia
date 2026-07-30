/**
 * Password Reset Request Routes — FEATURE-004
 *
 * POST /reset-request               — public, submit request
 * GET  /admin/reset-requests        — admin, list with filter
 * POST /admin/reset-requests/:id/complete — admin, reset + issue temp password
 * POST /admin/reset-requests/:id/reject   — admin, reject request
 */

import express from "express";
import { authenticate, requireAdmin, AuthRequest } from "../middleware/auth";
import { normalizePhoneNumber } from "../utils/phoneUtils";
import {
  submitResetRequest,
  completeResetRequest,
  rejectResetRequest,
  expireStaleRequests,
  maskPhone,
} from "../services/passwordResetRequestService";
import { getSheetData } from "../services/sheetsService";
import { normalizeSheetPhone } from "../utils/phoneUtils";

const router = express.Router();

// ─── Public: submit a reset request ──────────────────────────────────────

router.post("/reset-request", async (req, res) => {
  const { phone } = req.body;
  if (!phone?.trim())
    return res.status(400).json({ error: "Phone number is required." });

  try {
    // Always return success — never reveal whether phone exists
    const result = await submitResetRequest(phone);
    res.json({
      message:           "Password reset request submitted. An administrator will contact you shortly.",
      request_reference: result.request_reference,
    });
  } catch {
    // Return generic success even on internal error to prevent enumeration
    res.json({ message: "Password reset request submitted." });
  }
});

// ─── Admin: list requests ─────────────────────────────────────────────────

router.get("/admin/reset-requests", authenticate, requireAdmin, async (req: AuthRequest, res) => {
  try {
    // Run lazy expiry check on each admin view
    expireStaleRequests().catch(() => {});

    const { status = "pending" } = req.query as { status?: string };
    const [requests, users] = await Promise.all([
      getSheetData("Password_Reset_Requests"),
      getSheetData("Users"),
    ]);

    const userMap = new Map(users.map((u) => [u.user_id, u]));

    let filtered = status === "all"
      ? requests
      : requests.filter((r) => r.status === status);

    filtered = filtered.sort(
      (a, b) =>
        new Date(b.requested_at).getTime() - new Date(a.requested_at).getTime()
    );

    const enriched = filtered.map((r) => {
      const user = userMap.get(r.user_id);
      // Resolve display name — try user record first, fallback to phone
      const display_name = user?.display_name || user?.full_name || null;
      const last_login   = user?.last_login || null;
      const minutesAgo   = Math.floor(
        (Date.now() - new Date(r.requested_at).getTime()) / 60000
      );
      const timeAgo =
        minutesAgo < 60
          ? `${minutesAgo}m ago`
          : minutesAgo < 1440
          ? `${Math.floor(minutesAgo / 60)}h ago`
          : `${Math.floor(minutesAgo / 1440)}d ago`;

      return {
        request_id:        r.request_id,
        request_reference: r.request_reference,
        user_id:           r.user_id,
        phone_masked:      maskPhone(String(r.phone || "")),
        phone_full:        String(r.phone || ""),  // full number for admin use
        display_name,
        last_login,
        status:            r.status,
        requested_at:      r.requested_at,
        time_ago:          timeAgo,
        expires_at:        r.expires_at,
        admin_notes:       r.admin_notes,
      };
    });

    res.json({ requests: enriched, total: enriched.length });
  } catch {
    res.status(500).json({ error: "Failed to load reset requests." });
  }
});

// ─── Admin: complete (reset + issue temp password) ─────────────────────────

router.post(
  "/admin/reset-requests/:id/complete",
  authenticate,
  requireAdmin,
  async (req: AuthRequest, res) => {
    try {
      const result = await completeResetRequest(req.params.id, req.user!.user_id);
      res.json({
        message:           "Password reset successfully.",
        temp_password:     result.temp_password,
        request_reference: result.request_reference,
      });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || "Reset failed." });
    }
  }
);

// ─── Admin: reject ────────────────────────────────────────────────────────

router.post(
  "/admin/reset-requests/:id/reject",
  authenticate,
  requireAdmin,
  async (req: AuthRequest, res) => {
    const { admin_notes } = req.body;
    if (!admin_notes?.trim())
      return res.status(400).json({ error: "admin_notes is required for rejection." });
    try {
      await rejectResetRequest(req.params.id, req.user!.user_id, admin_notes);
      res.json({ message: "Request rejected." });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || "Rejection failed." });
    }
  }
);

export default router;
