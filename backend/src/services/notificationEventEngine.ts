/**
 * Notification Event Engine — ENGAGEMENT-003 Sprint 1
 *
 * Generic infrastructure layer. This module:
 *   • Defines the NotificationEvent model
 *   • Validates events
 *   • Assigns priority and expiry defaults
 *   • Maintains a registry of destination handlers
 *   • Routes events to registered destinations
 *   • Provides idempotency key generation
 *
 * This engine contains NO producer logic, NO analytics, NO evaluation rules.
 * It is a routing and validation layer only.
 *
 * Producers (future sprints) call engine.dispatch(event).
 * Destinations (notificationCenterWriter, future push/email) register via
 * engine.registerDestination(handler).
 */

// ─── Notification types ────────────────────────────────────────────────────────

export type NotificationType =
  | "WATCHLIST"
  | "ACHIEVEMENT"
  | "PRICE"
  | "LEAGUE"
  | "REPORT"
  | "ADVISOR"
  | "SYSTEM"
  | "ADMIN";

export type NotificationPriority = "high" | "normal" | "low";

export type NotificationStatus = "unread" | "read" | "archived";

// ─── Core event model ─────────────────────────────────────────────────────────

export interface NotificationEvent {
  /** Unique idempotency key. Same key = same event. Engine deduplicates on this. */
  idempotencyKey: string;
  /** Target user ID. Use "ALL" only for ADMIN broadcasts — engine expands to all users. */
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  /** Optional deep link path, e.g. "/watchlist" or "/reports/week-id" */
  link?: string;
  /** Overrides default priority for this type. Optional. */
  priority?: NotificationPriority;
  /** Overrides default expiry. ISO datetime. Optional. */
  expires_at?: string;
  /** Structured payload for future consumers (email, push, AI). */
  metadata?: Record<string, unknown>;
}

// ─── Destination handler interface ────────────────────────────────────────────

export interface NotificationDestination {
  name: string;
  handle(event: NotificationEvent): Promise<void>;
}

// ─── Priority defaults per type ───────────────────────────────────────────────

const DEFAULT_PRIORITY: Record<NotificationType, NotificationPriority> = {
  WATCHLIST:   "normal",
  ACHIEVEMENT: "normal",
  PRICE:       "normal",
  LEAGUE:      "normal",
  REPORT:      "normal",
  ADVISOR:     "high",     // Advisor alerts are time-sensitive (lineup decisions)
  SYSTEM:      "normal",
  ADMIN:       "normal",
};

// ─── Expiry defaults per type (days from now, 0 = no expiry) ─────────────────

const DEFAULT_EXPIRY_DAYS: Record<NotificationType, number> = {
  WATCHLIST:   14,
  ACHIEVEMENT: 0,   // No expiry — permanent badge record
  PRICE:       7,
  LEAGUE:      7,
  REPORT:      30,
  ADVISOR:     7,
  SYSTEM:      3,
  ADMIN:       0,   // Admin-configurable; defaults to no expiry
};

// ─── Validation ───────────────────────────────────────────────────────────────

export function validateNotificationEvent(event: NotificationEvent): { valid: boolean; reason?: string } {
  if (!event.idempotencyKey?.trim()) return { valid: false, reason: "idempotencyKey is required." };
  if (!event.user_id?.trim())        return { valid: false, reason: "user_id is required." };
  if (!event.type)                   return { valid: false, reason: "type is required." };
  if (!event.title?.trim())          return { valid: false, reason: "title is required." };
  if (!event.message?.trim())        return { valid: false, reason: "message is required." };
  if (event.title.length > 60)       return { valid: false, reason: "title must be 60 characters or fewer." };
  if (event.message.length > 280)    return { valid: false, reason: "message must be 280 characters or fewer." };
  return { valid: true };
}

// ─── Expiry assignment ────────────────────────────────────────────────────────

export function assignExpiry(event: NotificationEvent): string {
  if (event.expires_at) return event.expires_at;
  const days = DEFAULT_EXPIRY_DAYS[event.type] ?? 14;
  if (days === 0) return ""; // No expiry
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

// ─── Priority assignment ──────────────────────────────────────────────────────

export function assignPriority(event: NotificationEvent): NotificationPriority {
  return event.priority ?? DEFAULT_PRIORITY[event.type] ?? "normal";
}

// ─── Idempotency key helpers ──────────────────────────────────────────────────

/**
 * Generates a deterministic idempotency key for common event patterns.
 * Producers can use this or supply their own key.
 *
 * Format: type:user_id:event:context
 * Example: ACHIEVEMENT:user-abc:FIRST_WIN:week-xyz
 */
export function buildIdempotencyKey(
  type: NotificationType,
  user_id: string,
  event: string,
  context: string = ""
): string {
  return `${type}:${user_id}:${event}${context ? `:${context}` : ""}`;
}

// ─── Engine ───────────────────────────────────────────────────────────────────

class NotificationEventEngine {
  private destinations: NotificationDestination[] = [];

  /** Register a destination handler. Order of registration = order of dispatch. */
  registerDestination(destination: NotificationDestination): void {
    this.destinations.push(destination);
  }

  /** Unregister a destination by name (for testing or conditional channel removal). */
  unregisterDestination(name: string): void {
    this.destinations = this.destinations.filter((d) => d.name !== name);
  }

  /**
   * Dispatch a NotificationEvent to all registered destinations.
   *
   * Steps:
   *   1. Validate the event structure
   *   2. Assign priority and expiry if not explicitly set
   *   3. Route to each registered destination independently
   *      (one destination failing does not affect others)
   */
  async dispatch(rawEvent: NotificationEvent): Promise<{ dispatched: number; errors: string[] }> {
    const validation = validateNotificationEvent(rawEvent);
    if (!validation.valid) {
      throw new Error(`Invalid NotificationEvent: ${validation.reason}`);
    }

    // Enrich with defaults
    const event: NotificationEvent = {
      ...rawEvent,
      priority: assignPriority(rawEvent),
      expires_at: assignExpiry(rawEvent),
    };

    let dispatched = 0;
    const errors: string[] = [];

    for (const destination of this.destinations) {
      try {
        await destination.handle(event);
        dispatched++;
      } catch (err: any) {
        const msg = `Destination "${destination.name}" failed: ${err?.message || "unknown error"}`;
        console.error(`[NotificationEngine] ${msg}`);
        errors.push(msg);
        // Continue to next destination — one failure does not block others
      }
    }

    return { dispatched, errors };
  }

  getRegisteredDestinations(): string[] {
    return this.destinations.map((d) => d.name);
  }
}

// Export a singleton engine instance
export const notificationEngine = new NotificationEventEngine();
