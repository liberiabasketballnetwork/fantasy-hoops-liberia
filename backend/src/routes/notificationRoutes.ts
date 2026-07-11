/**
 * Notification Routes — ENGAGEMENT-003 Sprint 1
 *
 * Per-route authenticate middleware only.
 * Never router.use(authenticate) — ADL-HOTFIX-003b rule.
 *
 * All routes degrade gracefully if the Notifications sheet is unavailable.
 */

import express from "express";
import { authenticate, AuthRequest } from "../middleware/auth";
import {
  getUnreadCount,
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  archiveNotification,
} from "../services/notificationQueryService";

// Bootstrap the writer destination registration on server startup
import "../services/notificationCenterWriter";

const router = express.Router();

/**
 * GET /notifications/count
 * Returns unread notification count for the authenticated user.
 * Lightweight — uses cached sheet data. Safe for frequent calls.
 */
router.get("/notifications/count", authenticate, async (req: AuthRequest, res) => {
  try {
    const count = await getUnreadCount(req.user!.user_id);
    res.json({ count });
  } catch (err) {
    // Graceful degradation: return 0 rather than an error
    console.error("[notificationRoutes] count error:", err);
    res.json({ count: 0 });
  }
});

/**
 * GET /notifications
 * Returns paginated notifications for the authenticated user.
 * Query params: limit (default 20), offset (default 0), unread_only, type
 */
router.get("/notifications", authenticate, async (req: AuthRequest, res) => {
  try {
    const limit  = Math.min(Number(req.query.limit)  || 20, 50);
    const offset = Number(req.query.offset) || 0;
    const unread_only = req.query.unread_only === "true";
    const type = req.query.type as string | undefined;

    const result = await getNotifications(req.user!.user_id, {
      limit,
      offset,
      unread_only,
      type,
    });

    res.json(result);
  } catch (err) {
    console.error("[notificationRoutes] GET /notifications error:", err);
    res.json({ notifications: [], total_unread: 0, has_more: false });
  }
});

/**
 * PATCH /notifications/read-all
 * Marks all unread notifications as read for the authenticated user.
 * Uses batchUpdateRows for efficiency.
 *
 * IMPORTANT: Must be declared before /notifications/:id/read so Express
 * does not match the literal string "read-all" as an :id parameter.
 */
router.patch("/notifications/read-all", authenticate, async (req: AuthRequest, res) => {
  try {
    const result = await markAllNotificationsRead(req.user!.user_id);
    res.json({ updated: result.updated, message: `${result.updated} notification(s) marked as read.` });
  } catch (err) {
    res.status(500).json({ error: "Failed to mark all notifications as read." });
  }
});

/**
 * PATCH /notifications/:id/read
 * Marks a single notification as read for the authenticated user.
 */
router.patch("/notifications/:id/read", authenticate, async (req: AuthRequest, res) => {
  try {
    const result = await markNotificationRead(req.params.id, req.user!.user_id);
    if (!result.success) {
      return res.status(404).json({ error: result.reason || "Notification not found." });
    }
    res.json({ message: "Notification marked as read." });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to mark notification as read." });
  }
});

/**
 * PATCH /notifications/:id/archive
 * Archives a single notification for the authenticated user.
 * Archived notifications are excluded from standard queries but retained in the sheet.
 */
router.patch("/notifications/:id/archive", authenticate, async (req: AuthRequest, res) => {
  try {
    const result = await archiveNotification(req.params.id, req.user!.user_id);
    if (!result.success) {
      return res.status(404).json({ error: result.reason || "Notification not found." });
    }
    res.json({ message: "Notification archived." });
  } catch (err) {
    res.status(500).json({ error: "Failed to archive notification." });
  }
});

export default router;
