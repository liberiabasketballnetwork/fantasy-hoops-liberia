/**
 * Platform Settings Routes — ADMIN-014
 *
 * GET /platform-settings         — public, returns all settings
 * PUT /admin/platform-settings   — admin only, partial update
 */

import express from "express";
import { authenticate, requireAdmin, AuthRequest } from "../middleware/auth";
import {
  getPlatformSettings,
  updatePlatformSettings,
} from "../services/platformSettingsService";

const router = express.Router();

// ─── Public: read all settings ────────────────────────────────────────────

router.get("/platform-settings", async (_req, res) => {
  try {
    const settings = await getPlatformSettings();
    res.json(settings);
  } catch (err: any) {
    res.status(500).json({ error: "Failed to load platform settings." });
  }
});

// ─── Admin: update settings ───────────────────────────────────────────────

router.put(
  "/admin/platform-settings",
  authenticate,
  requireAdmin,
  async (req: AuthRequest, res) => {
    try {
      const result = await updatePlatformSettings(req.body);
      if (result.errors?.length) {
        return res.status(400).json({ errors: result.errors });
      }
      const updated = await getPlatformSettings();
      res.json({ message: "Platform settings updated.", settings: updated });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to update platform settings." });
    }
  }
);

export default router;
