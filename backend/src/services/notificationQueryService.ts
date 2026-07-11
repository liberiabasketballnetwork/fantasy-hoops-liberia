/**
 * Notification Query Service — ENGAGEMENT-003 Sprint 1
 *
 * Handles all read and status-update operations for the Notification Center.
 * Contains no event production logic, no analytics, no evaluation.
 *
 * ADL-036 compliance: if the Notifications sheet does not exist, all read
 * operations return safe empty results. Write operations return a friendly
 * error. The core platform is never affected.
 */

import { getSheetData, batchUpdateRows, getSetting } from "./sheetsService";
import { NotificationStatus } from "./notificationEventEngine";

const NOTIFICATIONS_SHEET = "Notifications";
const DEFAULT_RETENTION_DAYS = 90;

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface NotificationRow {
  notification_id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  link: string;
  status: NotificationStatus;
  priority: string;
  metadata: string;
  created_at: string;
  expires_at: string;
}

export interface PaginatedNotifications {
  notifications: NotificationRow[];
  total_unread: number;
  has_more: boolean;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

/** Returns true if a notification row is currently active (not expired, not archived). */
function isActive(row: NotificationRow): boolean {
  if (row.status === "archived") return false;
  if (!row.expires_at) return true;
  return new Date(row.expires_at) > new Date();
}

/** Returns true if a notification row is visible to the given user. */
function isVisibleTo(row: NotificationRow, user_id: string): boolean {
  return row.user_id === user_id || row.user_id === "ALL";
}

async function isEnabled(): Promise<boolean> {
  try {
    const flag = await getSetting("notifications_enabled", "true");
    return flag.toLowerCase() === "true";
  } catch {
    return true; // Default to enabled if setting unreadable
  }
}

async function fetchNotifications(): Promise<NotificationRow[]> {
  try {
    const rows = await getSheetData(NOTIFICATIONS_SHEET);
    return rows as NotificationRow[];
  } catch {
    // Sheet does not exist or is unavailable — ADL-036 graceful degradation
    return [];
  }
}

// ─── Unread count ─────────────────────────────────────────────────────────────

export async function getUnreadCount(user_id: string): Promise<number> {
  if (!(await isEnabled())) return 0;
  const rows = await fetchNotifications();
  return rows.filter(
    (r) => isVisibleTo(r, user_id) && isActive(r) && r.status === "unread"
  ).length;
}

// ─── Paginated query ──────────────────────────────────────────────────────────

export async function getNotifications(
  user_id: string,
  options: {
    limit?: number;
    offset?: number;
    unread_only?: boolean;
    type?: string;
  } = {}
): Promise<PaginatedNotifications> {
  if (!(await isEnabled())) {
    return { notifications: [], total_unread: 0, has_more: false };
  }

  const { limit = 20, offset = 0, unread_only = false, type } = options;

  const rows = await fetchNotifications();
  const userRows = rows.filter((r) => isVisibleTo(r, user_id) && isActive(r));

  // Apply filters
  let filtered = userRows;
  if (unread_only) filtered = filtered.filter((r) => r.status === "unread");
  if (type) filtered = filtered.filter((r) => r.type === type);

  // Sort: high priority first, then newest first
  filtered.sort((a, b) => {
    const priorityOrder: Record<string, number> = { high: 0, normal: 1, low: 2 };
    const pa = priorityOrder[a.priority] ?? 1;
    const pb = priorityOrder[b.priority] ?? 1;
    if (pa !== pb) return pa - pb;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const total_unread = userRows.filter((r) => r.status === "unread").length;
  const paginated = filtered.slice(offset, offset + limit);
  const has_more = filtered.length > offset + limit;

  return { notifications: paginated, total_unread, has_more };
}

// ─── Mark one notification read ───────────────────────────────────────────────

export async function markNotificationRead(
  notification_id: string,
  user_id: string
): Promise<{ success: boolean; reason?: string }> {
  if (!(await isEnabled())) return { success: false, reason: "Notifications are disabled." };

  const rows = await fetchNotifications();
  const rowIndex = rows.findIndex(
    (r) => r.notification_id === notification_id && isVisibleTo(r, user_id)
  );

  if (rowIndex === -1) {
    return { success: false, reason: "Notification not found." };
  }

  const row = rows[rowIndex];
  if (row.status === "read") return { success: true }; // Already read — idempotent

  try {
    // Row number in sheet: +2 for header row and 0-indexed → 1-indexed
    await batchUpdateRows(NOTIFICATIONS_SHEET, [
      { rowNumber: rowIndex + 2, data: { ...row, status: "read" } },
    ]);
    return { success: true };
  } catch (err: any) {
    return { success: false, reason: err?.message || "Failed to update notification." };
  }
}

// ─── Mark all read ─────────────────────────────────────────────────────────────

export async function markAllNotificationsRead(user_id: string): Promise<{ updated: number }> {
  if (!(await isEnabled())) return { updated: 0 };

  const rows = await fetchNotifications();
  const updates: { rowNumber: number; data: Record<string, any> }[] = [];

  rows.forEach((row, index) => {
    if (isVisibleTo(row, user_id) && isActive(row) && row.status === "unread") {
      updates.push({
        rowNumber: index + 2, // +1 for header, +1 for 0-index
        data: { ...row, status: "read" },
      });
    }
  });

  if (updates.length === 0) return { updated: 0 };

  try {
    await batchUpdateRows(NOTIFICATIONS_SHEET, updates);
  } catch (err) {
    console.error("[NotificationQueryService] markAllRead failed:", err);
  }

  return { updated: updates.length };
}

// ─── Archive notification ──────────────────────────────────────────────────────

export async function archiveNotification(
  notification_id: string,
  user_id: string
): Promise<{ success: boolean; reason?: string }> {
  if (!(await isEnabled())) return { success: false, reason: "Notifications are disabled." };

  const rows = await fetchNotifications();
  const rowIndex = rows.findIndex(
    (r) => r.notification_id === notification_id && isVisibleTo(r, user_id)
  );

  if (rowIndex === -1) {
    return { success: false, reason: "Notification not found." };
  }

  const row = rows[rowIndex];
  if (row.status === "archived") return { success: true }; // Already archived

  try {
    await batchUpdateRows(NOTIFICATIONS_SHEET, [
      { rowNumber: rowIndex + 2, data: { ...row, status: "archived" } },
    ]);
    return { success: true };
  } catch (err: any) {
    return { success: false, reason: err?.message || "Failed to archive notification." };
  }
}
