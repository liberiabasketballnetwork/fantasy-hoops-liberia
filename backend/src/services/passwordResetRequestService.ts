/**
 * PasswordResetRequestService — FEATURE-004
 *
 * Central service for the Password Reset Request Queue.
 * Reuses the existing reset-password logic in adminRoutes.
 * Never stores plaintext temporary passwords.
 */

import { v4 as uuidv4 } from "uuid";
import bcrypt from "bcryptjs";
import * as crypto from "crypto";
import { getSheetData, appendRow, updateRow } from "./sheetsService";
import { logAdminAction } from "./adminActionLogger";
import { normalizeSheetPhone, normalizePhoneNumber } from "../utils/phoneUtils";
import { notificationEngine } from "./notificationEventEngine";
import { PS_KEYS } from "./platformSettingsService";

// ─── Settings ─────────────────────────────────────────────────────────────

async function getResetSettings() {
  const rows = await getSheetData("Platform_Settings").catch(() => [] as any[]);
  const get  = (key: string, fallback: string) => {
    const row = rows.find((r: any) => String(r.key) === key);
    return row ? String(row.value ?? fallback) : fallback;
  };
  return {
    maxPerDay:        Math.max(1, Number(get(PS_KEYS.PASSWORD_RESET_MAX_PER_DAY,   "3"))  || 3),
    expiryHours:      Math.max(1, Number(get(PS_KEYS.PASSWORD_RESET_EXPIRY_HOURS,  "48")) || 48),
    tempExpiryHours:  Math.max(1, Number(get(PS_KEYS.TEMP_PASSWORD_EXPIRY_HOURS,   "24")) || 24),
  };
}

// ─── Reference generation: PR-000001 ─────────────────────────────────────

async function generateRequestReference(): Promise<string> {
  const requests = await getSheetData("Password_Reset_Requests").catch(() => []);
  // Find highest existing reference number
  let max = 0;
  for (const r of requests) {
    const match = String(r.request_reference || "").match(/^PR-(\d+)$/);
    if (match) {
      const n = parseInt(match[1], 10);
      if (n > max) max = n;
    }
  }
  return `PR-${String(max + 1).padStart(6, "0")}`;
}

// ─── Temporary password generator ────────────────────────────────────────

function generateTempPassword(): string {
  // Exclude ambiguous characters: 0, O, l, 1, I
  const CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const bytes = crypto.randomBytes(6);
  const body = Array.from(bytes)
    .map((b) => CHARSET[(b as number) % CHARSET.length])
    .join("");
  return `FHL-${body}`;
}

// ─── Phone masking ────────────────────────────────────────────────────────

export function maskPhone(phone: string): string {
  const p = normalizePhoneNumber(phone);
  if (p.length < 7) return "***";
  return `${p.slice(0, 4)}***${p.slice(-3)}`;
}

// ─── Submit a reset request ───────────────────────────────────────────────

export async function submitResetRequest(rawPhone: string): Promise<{
  request_reference: string;
}> {
  const normalized = normalizePhoneNumber(rawPhone);
  const users      = await getSheetData("Users");
  const user       = users.find(
    (u) => normalizeSheetPhone(String(u.phone || "")) === normalized
  );

  const settings = await getResetSettings();
  const now      = new Date();
  const requests = await getSheetData("Password_Reset_Requests").catch(() => []);

  // Rate limit: max N pending/completed requests in last 24h for this phone
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const recentCount = requests.filter(
    (r) =>
      normalizePhoneNumber(String(r.phone || "")) === normalized &&
      new Date(r.requested_at) >= oneDayAgo
  ).length;

  // Always return same response regardless of whether phone exists (no enumeration)
  // If rate limited: silently return existing pending reference
  if (recentCount >= settings.maxPerDay) {
    const pendingRef = requests
      .filter(
        (r) =>
          normalizePhoneNumber(String(r.phone || "")) === normalized &&
          r.status === "pending"
      )
      .sort(
        (a, b) =>
          new Date(b.requested_at).getTime() - new Date(a.requested_at).getTime()
      )[0];
    return { request_reference: pendingRef?.request_reference ?? "PR-000000" };
  }

  // Idempotency: return existing pending request if one already exists
  const existingPending = requests.find(
    (r) =>
      normalizePhoneNumber(String(r.phone || "")) === normalized &&
      r.status === "pending"
  );
  if (existingPending) {
    return { request_reference: existingPending.request_reference };
  }

  // Create new request
  const request_reference = await generateRequestReference();
  const request_id        = uuidv4();
  const expires_at        = new Date(
    now.getTime() + settings.expiryHours * 60 * 60 * 1000
  ).toISOString();

  await appendRow("Password_Reset_Requests", {
    request_id,
    request_reference,
    user_id:      user?.user_id || "",
    phone:        normalized,
    status:       "pending",
    requested_at: now.toISOString(),
    actioned_at:  "",
    actioned_by:  "",
    admin_notes:  "",
    expires_at,
  });

  // Notify admin(s) — fire-and-forget
  notificationEngine.dispatch({
    user_id:        "admin",
    type:           "ADMIN",
    idempotencyKey: `RESET_REQUEST:${request_id}`,
    title:          "🔐 Password Reset Request",
    message:        `New password reset request ${request_reference} from ${maskPhone(normalized)}.`,
    link:           "/admin",
    priority:       "normal",
    metadata:       { event: "PASSWORD_RESET_REQUEST", request_id, request_reference },
  }).catch(() => {});

  return { request_reference };
}

// ─── Admin: reset password for a queued request ───────────────────────────

export async function completeResetRequest(
  request_id: string,
  admin_id: string
): Promise<{ temp_password: string; request_reference: string }> {
  const requests = await getSheetData("Password_Reset_Requests");
  const request  = requests.find((r) => r.request_id === request_id);
  if (!request) throw new Error("Request not found.");
  if (request.status !== "pending") throw new Error(`Cannot complete a request in "${request.status}" status.`);

  const users = await getSheetData("Users");
  // Resolve user by user_id or by phone
  const user = users.find(
    (u) =>
      (request.user_id && u.user_id === request.user_id) ||
      normalizeSheetPhone(String(u.phone || "")) === normalizePhoneNumber(String(request.phone))
  );
  if (!user) throw new Error("User not found — they may have deleted their account.");

  // Generate temp password — display ONCE, never store plaintext
  const tempPassword = generateTempPassword();
  const password_hash = await bcrypt.hash(tempPassword, 10);

  const settings = await getResetSettings();
  const tempExpiry = new Date(
    Date.now() + settings.tempExpiryHours * 60 * 60 * 1000
  ).toISOString();

  // Update user: set temp password + expiry flag
  await updateRow("Users", "user_id", user.user_id, {
    ...user,
    password_hash,
    password_temporary:        "TRUE",
    temp_password_expires_at:  tempExpiry,
  });

  // Mark request completed
  const now = new Date().toISOString();
  await updateRow("Password_Reset_Requests", "request_id", request_id, {
    ...request,
    status:      "completed",
    actioned_at: now,
    actioned_by: admin_id,
  });

  // Log
  await logAdminAction({
    admin_id,
    action_type: "COMPLETE_RESET_REQUEST",
    entity_type: "USER",
    entity_id:   user.user_id,
    details:     `Password reset completed for request ${request.request_reference}. Temp password expires: ${tempExpiry}`,
    status:      "success",
  });

  // Notify user (in-app, visible after they log in)
  notificationEngine.dispatch({
    user_id:        user.user_id,
    type:           "SYSTEM",
    idempotencyKey: `RESET_COMPLETE:${request_id}`,
    title:          "🔐 Password Reset",
    message:        "Your password has been reset. Use your temporary password to log in, then set a new password.",
    link:           "/login",
    priority:       "high",
    metadata:       { event: "PASSWORD_RESET_COMPLETED", request_id: request.request_reference },
  }).catch(() => {});

  return { temp_password: tempPassword, request_reference: request.request_reference };
}

// ─── Admin: reject a request ──────────────────────────────────────────────

export async function rejectResetRequest(
  request_id: string,
  admin_id: string,
  admin_notes: string
): Promise<void> {
  const requests = await getSheetData("Password_Reset_Requests");
  const request  = requests.find((r) => r.request_id === request_id);
  if (!request) throw new Error("Request not found.");

  const users = await getSheetData("Users");
  const user  = users.find((u) => u.user_id === request.user_id);

  await updateRow("Password_Reset_Requests", "request_id", request_id, {
    ...request,
    status:      "rejected",
    actioned_at: new Date().toISOString(),
    actioned_by: admin_id,
    admin_notes,
  });

  await logAdminAction({
    admin_id,
    action_type: "REJECT_RESET_REQUEST",
    entity_type: "USER",
    entity_id:   request.user_id || request.phone,
    details:     `Reset request ${request.request_reference} rejected. Reason: ${admin_notes}`,
    status:      "success",
  });

  // Notify user
  if (user) {
    notificationEngine.dispatch({
      user_id:        user.user_id,
      type:           "SYSTEM",
      idempotencyKey: `RESET_REJECTED:${request_id}`,
      title:          "Password Reset Request",
      message:        "Your password reset request could not be processed. Please contact support.",
      link:           "/login",
      priority:       "normal",
      metadata:       { event: "PASSWORD_RESET_REJECTED" },
    }).catch(() => {});
  }
}

// ─── Lazy expiry check ────────────────────────────────────────────────────

export async function expireStaleRequests(): Promise<number> {
  const requests = await getSheetData("Password_Reset_Requests").catch(() => []);
  const now = new Date();
  let expired = 0;
  for (const r of requests) {
    if (r.status === "pending" && r.expires_at && new Date(r.expires_at) < now) {
      await updateRow("Password_Reset_Requests", "request_id", r.request_id, {
        ...r,
        status: "expired",
      }).catch(() => {});
      expired++;
    }
  }
  return expired;
}
