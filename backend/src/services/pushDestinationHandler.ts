/**
 * Push Destination Handler — PWA-003
 *
 * Second registered destination alongside notificationCenterWriter.
 * Receives every NotificationEvent dispatched by the engine.
 * Applies per-user preferences, quiet hours, and rate limiting before
 * delivering via the Web Push protocol.
 *
 * ADL-039: receives NotificationEvent — never reads Notifications sheet.
 * ADL-042: any delivery failure is logged and discarded; engine is unaffected.
 *
 * Required environment variables:
 *   VAPID_SUBJECT        — "mailto:admin@fantasyhoops.online" or your domain
 *   VAPID_PUBLIC_KEY     — from `npx web-push generate-vapid-keys`
 *   VAPID_PRIVATE_KEY    — from `npx web-push generate-vapid-keys`
 */

import webpush from "web-push";
import { v4 as uuidv4 } from "uuid";
import { getSheetData, updateRow, deleteRow } from "./sheetsService";
import {
  NotificationDestination,
  NotificationEvent,
  NotificationPriority,
} from "./notificationEventEngine";
import { notificationEngine } from "./notificationEventEngine";

// ─── VAPID setup ──────────────────────────────────────────────────────────────

const VAPID_SUBJECT     = process.env.VAPID_SUBJECT     || "mailto:admin@fantasyhoops.online";
const VAPID_PUBLIC_KEY  = process.env.VAPID_PUBLIC_KEY  || "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
} else {
  console.warn("[PushHandler] VAPID keys not set — push delivery disabled.");
}

// ─── Category mapping ─────────────────────────────────────────────────────────

// Notification types that are eligible for push by default
const DEFAULT_PUSH_TYPES = new Set([
  "ACHIEVEMENT",
  "REPORT",
  "LEAGUE",
  "PRICE",
  "WATCHLIST",
  "ADVISOR",
]);

// High-volume / low-signal events excluded from push by default
// (user can opt in via preferences)
const EXCLUDED_BY_DEFAULT = new Set([
  "SYSTEM",
  "ADMIN",
]);

// Metadata subevents that are excluded from push even when the type is enabled
const EXCLUDED_EVENTS = new Set([
  "VALUE_PLAYER",           // too low-signal for lock screen
  "PRICE_INCREASE",         // 1-credit changes (minor)
  "PRICE_DECREASE",         // 1-credit changes (minor)
  "LEAGUE_RANK_CHANGE",     // too frequent in active leagues
  "LEAGUE_MEMBER_JOINED",   // owner-only, low urgency
  "LEAGUE_CAPACITY_REACHED",
]);

function shouldPushByDefault(event: NotificationEvent): boolean {
  if (EXCLUDED_BY_DEFAULT.has(event.type)) return false;
  if (!DEFAULT_PUSH_TYPES.has(event.type)) return false;

  // Check metadata subtype
  const subEvent = (event.metadata as any)?.event as string | undefined;
  if (subEvent && EXCLUDED_EVENTS.has(subEvent)) return false;

  return true;
}

// ─── In-memory rate limiter (per-user, hourly) ────────────────────────────────

const HOURLY_CAP = 10;
const hourlyCounters = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(user_id: string): boolean {
  const now   = Date.now();
  const entry = hourlyCounters.get(user_id);
  if (!entry || entry.resetAt < now) {
    hourlyCounters.set(user_id, { count: 1, resetAt: now + 60 * 60 * 1000 });
    return false;
  }
  if (entry.count >= HOURLY_CAP) return true;
  entry.count++;
  return false;
}

// ─── Quiet hours check ────────────────────────────────────────────────────────

function isInQuietHours(start: string, end: string): boolean {
  if (!start || !end) return false;
  try {
    const now  = new Date();
    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    const nowMins  = now.getHours() * 60 + now.getMinutes();
    const startMin = sh * 60 + sm;
    const endMin   = eh * 60 + em;

    if (startMin <= endMin) {
      return nowMins >= startMin && nowMins < endMin;
    } else {
      // Crosses midnight (e.g. 22:00–07:00)
      return nowMins >= startMin || nowMins < endMin;
    }
  } catch {
    return false;
  }
}

// ─── Preference loader ────────────────────────────────────────────────────────

interface UserPreferences {
  push_enabled:       boolean;
  categories:         string[];
  quiet_hours_start:  string;
  quiet_hours_end:    string;
}

const DEFAULT_PREFS: UserPreferences = {
  push_enabled: true,
  categories:   ["achievements", "weekly_report", "league_champion", "price_alerts", "watchlist_trending", "deadline_reminder"],
  quiet_hours_start: "",
  quiet_hours_end:   "",
};

async function getUserPreferences(user_id: string): Promise<UserPreferences> {
  try {
    const rows = await getSheetData("Notification_Preferences");
    const row  = rows.find((r) => r.user_id === user_id);
    if (!row) return DEFAULT_PREFS;

    return {
      push_enabled:      String(row.push_enabled).toLowerCase() !== "false",
      categories:        (() => { try { return JSON.parse(row.categories); } catch { return DEFAULT_PREFS.categories; } })(),
      quiet_hours_start: row.quiet_hours_start ?? "",
      quiet_hours_end:   row.quiet_hours_end   ?? "",
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

// ─── Push payload builder ─────────────────────────────────────────────────────

function buildPushPayload(event: NotificationEvent): object {
  const subEvent = (event.metadata as any)?.event as string ?? event.type;

  return {
    title:  event.title,
    body:   event.message,
    icon:   "/icon-192.png",
    badge:  "/icon-96-badge.png",
    tag:    `${event.type}-${subEvent}`,   // prevents stacking on device
    data: {
      url:             event.link ?? "/dashboard",
      notification_id: (event.metadata as any)?.notification_id ?? "",
      type:            event.type,
    },
  };
}

// ─── Single-subscription delivery ────────────────────────────────────────────

async function deliverToSubscription(
  subscription: any,
  payload: string
): Promise<"delivered" | "expired" | "error"> {
  const pushSubscription = {
    endpoint: subscription.endpoint,
    keys: {
      p256dh: subscription.p256dh,
      auth:   subscription.auth,
    },
  };

  try {
    await webpush.sendNotification(pushSubscription, payload);

    // Update last_used_at
    await updateRow("Push_Subscriptions", "subscription_id", subscription.subscription_id, {
      ...subscription,
      last_used_at: new Date().toISOString(),
    }).catch(() => { /* non-fatal */ });

    return "delivered";
  } catch (err: any) {
    const statusCode = err?.statusCode;

    if (statusCode === 410 || statusCode === 404) {
      // Subscription permanently expired — remove it
      await deleteRow("Push_Subscriptions", "subscription_id", subscription.subscription_id)
        .catch(() => { /* non-fatal */ });
      return "expired";
    }

    if (statusCode === 429) {
      console.warn(`[PushHandler] Rate limited by push service for endpoint: ${subscription.endpoint.slice(0, 40)}...`);
      return "error";
    }

    // 5xx — retry once after 2 seconds
    if (statusCode >= 500) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      try {
        await webpush.sendNotification(pushSubscription, payload);
        return "delivered";
      } catch {
        return "error";
      }
    }

    console.error(`[PushHandler] Push failed (${statusCode}):`, err?.body ?? err?.message);
    return "error";
  }
}

// ─── Destination handler ──────────────────────────────────────────────────────

export const pushDestinationHandler: NotificationDestination = {
  name: "push-destination-handler",

  async handle(event: NotificationEvent): Promise<void> {
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return;

    // Global push eligibility check
    if (!shouldPushByDefault(event)) return;

    // Skip "ALL" broadcasts — push is always per-user
    if (event.user_id === "ALL") return;

    // Rate limit
    if (isRateLimited(event.user_id)) return;

    // Load user preferences
    const prefs = await getUserPreferences(event.user_id);
    if (!prefs.push_enabled) return;

    // Quiet hours
    if (isInQuietHours(prefs.quiet_hours_start, prefs.quiet_hours_end)) return;

    // Load subscriptions for this user
    let subscriptions: any[] = [];
    try {
      const allSubs = await getSheetData("Push_Subscriptions");
      subscriptions = allSubs.filter(
        (s) => s.user_id === event.user_id && s.status === "active"
      );
    } catch {
      return; // Push_Subscriptions sheet missing — graceful degradation
    }

    if (subscriptions.length === 0) return;

    const payload = JSON.stringify(buildPushPayload(event));
    const results = await Promise.allSettled(
      subscriptions.map((sub) => deliverToSubscription(sub, payload))
    );

    const delivered = results.filter((r) => r.status === "fulfilled" && r.value === "delivered").length;
    const expired   = results.filter((r) => r.status === "fulfilled" && r.value === "expired").length;
    if (delivered + expired > 0) {
      console.log(`[PushHandler] User ${event.user_id}: ${delivered} delivered, ${expired} expired.`);
    }
  },
};

// ─── Auto-register with the engine ───────────────────────────────────────────

import { notificationEngine as engine } from "./notificationEventEngine";
engine.registerDestination(pushDestinationHandler);
