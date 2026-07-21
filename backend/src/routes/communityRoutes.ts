/**
 * Community Routes — FEATURE-001
 *
 * GET  /community/settings          — public, returns enabled flag + whatsapp_url + card_text
 * POST /community/analytics         — public, records card events (shown/join_clicked/dismissed)
 * GET  /community/admin/settings    — admin, full settings
 * POST /community/admin/settings    — admin, save settings
 * GET  /community/admin/analytics   — admin, aggregated conversion stats
 */

import express from "express";
import { v4 as uuidv4 } from "uuid";
import { authenticate, requireAdmin, AuthRequest } from "../middleware/auth";
import { getSetting, setSetting, getSheetData, appendRow } from "../services/sheetsService";

const router = express.Router();

// ─── Setting keys ──────────────────────────────────────────────────────────

const SK = {
  ENABLED:          "community_enabled",
  WHATSAPP_URL:     "community_whatsapp_url",
  REMINDER_DAYS:    "community_reminder_days",
  CARD_TEXT:        "community_card_text",
} as const;

// ─── Public: settings for the frontend card ────────────────────────────────

router.get("/community/settings", async (_req, res) => {
  try {
    const [enabled, url, days, text] = await Promise.all([
      getSetting(SK.ENABLED,       "false"),
      getSetting(SK.WHATSAPP_URL,  ""),
      getSetting(SK.REMINDER_DAYS, "7"),
      getSetting(SK.CARD_TEXT,     ""),
    ]);
    res.json({
      enabled:       enabled.toLowerCase() === "true",
      whatsapp_url:  url,
      reminder_days: Number(days),
      card_text:     text,
    });
  } catch {
    res.status(500).json({ error: "Failed to load community settings." });
  }
});

// ─── Public: analytics event ingestion ────────────────────────────────────

router.post("/community/analytics", async (req, res) => {
  const { event, timestamp } = req.body;
  const validEvents = ["shown", "join_clicked", "dismissed"];
  if (!validEvents.includes(event)) {
    return res.status(400).json({ error: "Invalid event type." });
  }
  try {
    await appendRow("Community_Analytics", {
      event_id:   uuidv4(),
      event,
      timestamp:  timestamp || new Date().toISOString(),
      created_at: new Date().toISOString(),
    });
    res.json({ ok: true });
  } catch {
    // Non-fatal — analytics should never break the user experience
    res.json({ ok: true });
  }
});

// ─── Admin: get full settings ──────────────────────────────────────────────

router.get("/community/admin/settings", authenticate, requireAdmin, async (_req: AuthRequest, res) => {
  try {
    const [enabled, url, days, text] = await Promise.all([
      getSetting(SK.ENABLED,       "false"),
      getSetting(SK.WHATSAPP_URL,  ""),
      getSetting(SK.REMINDER_DAYS, "7"),
      getSetting(SK.CARD_TEXT,     ""),
    ]);
    res.json({ enabled, whatsapp_url: url, reminder_days: days, card_text: text });
  } catch {
    res.status(500).json({ error: "Failed to load settings." });
  }
});

// ─── Admin: save settings ─────────────────────────────────────────────────

router.post("/community/admin/settings", authenticate, requireAdmin, async (req: AuthRequest, res) => {
  const { enabled, whatsapp_url, reminder_days, card_text } = req.body;
  try {
    await Promise.all([
      enabled       !== undefined && setSetting(SK.ENABLED,       String(enabled)),
      whatsapp_url  !== undefined && setSetting(SK.WHATSAPP_URL,  whatsapp_url),
      reminder_days !== undefined && setSetting(SK.REMINDER_DAYS, String(reminder_days)),
      card_text     !== undefined && setSetting(SK.CARD_TEXT,     card_text),
    ].filter(Boolean) as Promise<any>[]);
    res.json({ message: "Community settings saved." });
  } catch {
    res.status(500).json({ error: "Failed to save settings." });
  }
});

// ─── Admin: analytics summary ─────────────────────────────────────────────

router.get("/community/admin/analytics", authenticate, requireAdmin, async (_req: AuthRequest, res) => {
  try {
    const rows = await getSheetData("Community_Analytics");
    const shown        = rows.filter((r) => r.event === "shown").length;
    const join_clicked = rows.filter((r) => r.event === "join_clicked").length;
    const dismissed    = rows.filter((r) => r.event === "dismissed").length;
    const conversion   = shown > 0 ? ((join_clicked / shown) * 100).toFixed(1) : "0.0";
    res.json({ shown, join_clicked, dismissed, conversion_rate: `${conversion}%`, total_events: rows.length });
  } catch {
    res.status(500).json({ error: "Failed to load analytics." });
  }
});

export default router;
