/**
 * Achievement Notification Producer — ENGAGEMENT-003 Sprint 2A
 *
 * Converts newly awarded Achievement records into NotificationEvents and
 * dispatches them through the Notification Event Engine.
 *
 * ADL-039 compliance: this producer has no knowledge of destinations.
 *   It imports only the engine, never the writer or any sheet service.
 *
 * ADL-041 compliance: this producer is incremental.
 *   It only processes the achievements returned by the current evaluation run.
 *   It never rescans the Achievements sheet.
 *
 * The achievementService remains the sole authority for:
 *   - badge eligibility
 *   - badge evaluation
 *   - badge idempotency
 * This producer adds no badge logic.
 */

import { getSetting } from "./sheetsService";
import {
  notificationEngine,
  NotificationEvent,
  buildIdempotencyKey,
} from "./notificationEventEngine";
import { Achievement } from "./achievementService";
import { BADGE_MAP } from "./achievementService";

// ─── Notification mapping ─────────────────────────────────────────────────────

/**
 * Maps one Achievement record to a NotificationEvent.
 *
 * Mapping decisions:
 *  type:     ACHIEVEMENT — broad category, per TDR v2 schema
 *  priority: high — badge unlocks are milestone events that deserve prominence
 *  expires_at: "" (no expiry) — achievement notifications are permanent records
 *  link:     /achievements — direct path to the achievements page
 *
 * Idempotency key format:
 *   ACHIEVEMENT:{user_id}:{badge_key}:{week_id}   (repeatable badges)
 *   ACHIEVEMENT:{user_id}:{badge_key}              (non-repeatable badges)
 *
 * This mirrors the achievementService's own deduplication rules:
 * a non-repeatable badge cannot be earned twice, so its notification
 * cannot be emitted twice regardless of week_id.
 */
function achievementToEvent(
  achievement: Achievement,
  workflow_id: string
): NotificationEvent {
  const badge = BADGE_MAP.get(achievement.badge_key);
  const icon = badge?.icon ?? "🏅";
  const repeatable = badge?.repeatable ?? false;

  // Idempotency key — mirrors badge deduplication logic
  const idempotencyKey = repeatable
    ? buildIdempotencyKey("ACHIEVEMENT", achievement.user_id, achievement.badge_key, achievement.week_id)
    : buildIdempotencyKey("ACHIEVEMENT", achievement.user_id, achievement.badge_key);

  return {
    idempotencyKey,
    user_id: achievement.user_id,
    type: "ACHIEVEMENT",
    title: `${icon} Achievement Unlocked!`,
    message: `${achievement.badge_name}: ${achievement.description}`,
    link: "/achievements",
    priority: "high",
    expires_at: "", // Permanent — no expiry for achievement notifications
    metadata: {
      event:          "ACHIEVEMENT_UNLOCKED",
      badge_key:      achievement.badge_key,
      badge_name:     achievement.badge_name,
      badge_icon:     icon,
      achievement_id: achievement.achievement_id,
      week_id:        achievement.week_id,
      source_module:  "achievementService",
      correlation_id: achievement.week_id,
      workflow_id,
      version:        "1",
    },
  };
}

// ─── Producer ─────────────────────────────────────────────────────────────────

/**
 * dispatchAchievementNotifications
 *
 * Called after evaluateAchievements() completes.
 * Receives the awarded array and dispatches one NotificationEvent per badge.
 *
 * Fire-and-forget: any failure is logged but never propagated back to the
 * admin workflow or the badge evaluation result.
 *
 * @param awarded   - Array of Achievement objects returned by evaluateAchievements()
 * @param workflow_id - UUID identifying the current admin workflow execution
 */
export async function dispatchAchievementNotifications(
  awarded: Achievement[],
  workflow_id: string
): Promise<void> {
  // ── Feature flag check ────────────────────────────────────────────────────
  try {
    const flag = await getSetting("notifications_enabled", "true");
    if (flag.toLowerCase() !== "true") {
      // Notifications disabled — skip silently. Achievement evaluation continues.
      return;
    }
  } catch {
    // If the Settings read fails, default to enabled.
  }

  // ── Short-circuit for empty result ────────────────────────────────────────
  if (!awarded || awarded.length === 0) return;

  // ── Map achievements to NotificationEvents ───────────────────────────────
  const events: NotificationEvent[] = awarded.map((a) =>
    achievementToEvent(a, workflow_id)
  );

  // ── Dispatch — fire-and-forget ────────────────────────────────────────────
  try {
    const result = await notificationEngine.dispatchMany(events);
    console.log(
      `[AchievementProducer] Dispatched ${result.dispatched} notification(s), ` +
      `skipped ${result.skipped}, errors: ${result.errors.length}.`
    );
    if (result.errors.length > 0) {
      result.errors.forEach((e) => console.error(`[AchievementProducer] ${e}`));
    }
  } catch (err: any) {
    // Engine-level failure — log and return. Achievements are unaffected.
    console.error(`[AchievementProducer] Dispatch failed: ${err?.message || err}`);
  }
}
