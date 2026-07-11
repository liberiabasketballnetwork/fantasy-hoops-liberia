/**
 * Notification Center Writer — ENGAGEMENT-003 Sprint 1
 *
 * First destination handler. Accepts a NotificationEvent from the engine,
 * performs an idempotency check against the Notifications sheet, and writes
 * the row if the event has not already been persisted.
 *
 * Contains no business logic, no analytics, no evaluation rules.
 * It is a persistence adapter only.
 */

import { v4 as uuidv4 } from "uuid";
import { getSheetData, appendRow } from "./sheetsService";
import {
  NotificationDestination,
  NotificationEvent,
} from "./notificationEventEngine";

const NOTIFICATIONS_SHEET = "Notifications";

export const notificationCenterWriter: NotificationDestination = {
  name: "notification-center-writer",

  async handle(event: NotificationEvent): Promise<void> {
    // ── Idempotency check ───────────────────────────────────────────────────
    // Read the sheet and check whether a row with this idempotencyKey already
    // exists in the metadata column. We store idempotencyKey in metadata so the
    // core schema remains clean and extensible.
    let existingRows: any[] = [];
    try {
      existingRows = await getSheetData(NOTIFICATIONS_SHEET);
    } catch (err) {
      // If the sheet does not yet exist (tab not created), treat as empty.
      // This follows ADL-036: graceful degradation — never throw on missing sheet.
      console.warn("[NotificationCenterWriter] Notifications sheet unavailable — skipping write.");
      return;
    }

    // Parse metadata from each row to find idempotency key match
    const isDuplicate = existingRows.some((row) => {
      try {
        const meta = row.metadata ? JSON.parse(row.metadata) : {};
        return meta._idempotencyKey === event.idempotencyKey;
      } catch {
        return false;
      }
    });

    if (isDuplicate) {
      // Idempotent — this event has already been persisted. Skip.
      return;
    }

    // ── Persist the notification ────────────────────────────────────────────
    const metadata = {
      ...((event.metadata as Record<string, unknown>) || {}),
      _idempotencyKey: event.idempotencyKey,
    };

    await appendRow(NOTIFICATIONS_SHEET, {
      notification_id: uuidv4(),
      user_id:         event.user_id,
      type:            event.type,
      title:           event.title,
      message:         event.message,
      link:            event.link ?? "",
      status:          "unread",
      priority:        event.priority ?? "normal",
      metadata:        JSON.stringify(metadata),
      created_at:      new Date().toISOString(),
      expires_at:      event.expires_at ?? "",
    });
  },
};

// Register the writer as a destination on the singleton engine at import time.
// Future destinations are registered in their own modules or in a bootstrap file.
import { notificationEngine } from "./notificationEventEngine";
notificationEngine.registerDestination(notificationCenterWriter);
