/**
 * Push Routes — PWA-003
 *
 * Per-route authenticate middleware (HOTFIX-003b rule — never router.use).
 *
 * Endpoints:
 *   GET  /push/vapid-key     — returns VAPID public key (unauthenticated)
 *   GET  /push/status        — current subscription status for authenticated user
 *   POST /push/subscribe     — register a push subscription
 *   DELETE /push/unsubscribe — remove a push subscription
 *   GET  /push/preferences   — load user notification preferences
 *   POST /push/preferences   — save user notification preferences
 */

import express from "express";
import { v4 as uuidv4 } from "uuid";
import { authenticate, AuthRequest } from "../middleware/auth";
import { getSheetData, appendRow, updateRow, deleteRow } from "../services/sheetsService";

const router = express.Router();

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "";

// ─── VAPID public key (public endpoint — no auth needed) ──────────────────────

router.get("/push/vapid-key", (_req, res) => {
  if (!VAPID_PUBLIC_KEY) {
    return res.status(503).json({ error: "Push notifications not configured." });
  }
  res.json({ vapidPublicKey: VAPID_PUBLIC_KEY });
});

// ─── Subscription status ──────────────────────────────────────────────────────

router.get("/push/status", authenticate, async (req: AuthRequest, res) => {
  try {
    const rows = await getSheetData("Push_Subscriptions");
    const subs = rows.filter(
      (s) => s.user_id === req.user!.user_id && s.status === "active"
    );
    res.json({
      subscribed:    subs.length > 0,
      device_count:  subs.length,
      subscriptions: subs.map((s) => ({
        subscription_id: s.subscription_id,
        device_label:    s.device_label || "Unknown device",
        created_at:      s.created_at,
      })),
    });
  } catch {
    res.status(500).json({ error: "Failed to fetch subscription status." });
  }
});

// ─── Subscribe ────────────────────────────────────────────────────────────────

router.post("/push/subscribe", authenticate, async (req: AuthRequest, res) => {
  const { subscription, device_label } = req.body;

  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    return res.status(400).json({ error: "Invalid subscription object." });
  }

  if (!VAPID_PUBLIC_KEY) {
    return res.status(503).json({ error: "Push notifications not configured on this server." });
  }

  try {
    const allSubs = await getSheetData("Push_Subscriptions");
    const existing = allSubs.find(
      (s) => s.user_id === req.user!.user_id && s.endpoint === subscription.endpoint
    );

    if (existing) {
      // Re-activate if it was previously expired
      if (existing.status !== "active") {
        await updateRow("Push_Subscriptions", "subscription_id", existing.subscription_id, {
          ...existing,
          status:       "active",
          last_used_at: new Date().toISOString(),
        });
      }
      return res.json({ message: "Subscription updated.", subscription_id: existing.subscription_id });
    }

    const subscription_id = uuidv4();
    await appendRow("Push_Subscriptions", {
      subscription_id,
      user_id:      req.user!.user_id,
      endpoint:     subscription.endpoint,
      p256dh:       subscription.keys.p256dh,
      auth:         subscription.keys.auth,
      device_label: device_label || "",
      user_agent:   req.headers["user-agent"]?.slice(0, 200) || "",
      created_at:   new Date().toISOString(),
      last_used_at: new Date().toISOString(),
      status:       "active",
    });

    res.status(201).json({ message: "Subscription registered.", subscription_id });
  } catch {
    res.status(500).json({ error: "Failed to register subscription." });
  }
});

// ─── Unsubscribe ──────────────────────────────────────────────────────────────

router.delete("/push/unsubscribe", authenticate, async (req: AuthRequest, res) => {
  const { endpoint } = req.body;

  try {
    const allSubs = await getSheetData("Push_Subscriptions");
    const sub = allSubs.find(
      (s) => s.user_id === req.user!.user_id && s.endpoint === endpoint
    );

    if (!sub) return res.status(404).json({ error: "Subscription not found." });

    await deleteRow("Push_Subscriptions", "subscription_id", sub.subscription_id);
    res.json({ message: "Unsubscribed successfully." });
  } catch {
    res.status(500).json({ error: "Failed to unsubscribe." });
  }
});

// ─── Preferences ──────────────────────────────────────────────────────────────

router.get("/push/preferences", authenticate, async (req: AuthRequest, res) => {
  try {
    const rows = await getSheetData("Notification_Preferences");
    const pref = rows.find((r) => r.user_id === req.user!.user_id);

    if (!pref) {
      return res.json({
        push_enabled:      true,
        categories:        ["achievements","weekly_report","league_champion","price_alerts","watchlist_trending","deadline_reminder"],
        quiet_hours_start: "",
        quiet_hours_end:   "",
      });
    }

    res.json({
      push_enabled:      String(pref.push_enabled).toLowerCase() !== "false",
      categories:        (() => { try { return JSON.parse(pref.categories); } catch { return []; } })(),
      quiet_hours_start: pref.quiet_hours_start || "",
      quiet_hours_end:   pref.quiet_hours_end   || "",
    });
  } catch {
    res.status(500).json({ error: "Failed to load preferences." });
  }
});

router.post("/push/preferences", authenticate, async (req: AuthRequest, res) => {
  const { push_enabled, categories, quiet_hours_start, quiet_hours_end } = req.body;

  try {
    const rows = await getSheetData("Notification_Preferences");
    const existing = rows.find((r) => r.user_id === req.user!.user_id);
    const updated_at = new Date().toISOString();

    if (existing) {
      await updateRow("Notification_Preferences", "pref_id", existing.pref_id, {
        ...existing,
        push_enabled:      push_enabled ?? existing.push_enabled,
        categories:        JSON.stringify(categories ?? []),
        quiet_hours_start: quiet_hours_start ?? existing.quiet_hours_start,
        quiet_hours_end:   quiet_hours_end   ?? existing.quiet_hours_end,
        updated_at,
      });
    } else {
      await appendRow("Notification_Preferences", {
        pref_id:           uuidv4(),
        user_id:           req.user!.user_id,
        push_enabled:      push_enabled ?? true,
        categories:        JSON.stringify(categories ?? []),
        quiet_hours_start: quiet_hours_start ?? "",
        quiet_hours_end:   quiet_hours_end   ?? "",
        updated_at,
      });
    }

    res.json({ message: "Preferences saved." });
  } catch {
    res.status(500).json({ error: "Failed to save preferences." });
  }
});

export default router;
