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

export const notificationCenterWriter: NotificationDestination & {
  handleMany(events: NotificationEvent[]): Promise<void>;
} = {
  name: "notification-center-writer",

  async handle(event: NotificationEvent): Promise<void> {
    await this.handleMany([event]);
  },

  async handleMany(events: NotificationEvent[]): Promise<void> {
    let existingRows: any[] = [];
    try {
      existingRows = await getSheetData(NOTIFICATIONS_SHEET);
    } catch (err) {
      console.warn("[NotificationCenterWriter] Notifications sheet unavailable — skipping write.");
      return;
    }

    // Build a set of existing idempotency keys for O(1) lookup
    const existingKeys = new Set<string>();
    for (const row of existingRows) {
      try {
        const meta = row.metadata ? JSON.parse(row.metadata) : {};
        if (meta._idempotencyKey) existingKeys.add(meta._idempotencyKey);
      } catch {
        // malformed metadata — ignore
      }
    }

    // Filter to only novel events
    const toWrite = events.filter((event) => !existingKeys.has(event.idempotencyKey));
    if (toWrite.length === 0) return;

    // Write all new notifications — appendRow is called per row (no batch insert API
    // in googleapis for values.append across multiple rows). Future optimisation:
    // use values.batchUpdate to write all rows in a single API call.
    for (const event of toWrite) {
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
    }
  },
};

// Register the writer as a destination on the singleton engine at import time.
// Future destinations are registered in their own modules or in a bootstrap file.
import { notificationEngine } from "./notificationEventEngine";
notificationEngine.registerDestination(notificationCenterWriter);
