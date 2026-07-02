import { v4 as uuidv4 } from "uuid";
import { appendRow } from "./sheetsService";

/**
 * Automatic audit logging for admin actions in Fantasy Hoops Liberia.
 *
 * Every call appends one row to the Admin_Actions_Log Google Sheet.
 * Logging is intentionally fire-and-forget (errors are caught and logged
 * to console only) — a logging failure should never interrupt the primary
 * action that triggered it. No frontend, no UI, no gameplay logic is
 * touched by this service.
 */
export interface AdminActionLog {
  admin_id: string;
  action_type: string;
  entity_type: string;
  entity_id: string;
  details: string;
  status: "success" | "failure";
}

export async function logAdminAction(entry: AdminActionLog): Promise<void> {
  try {
    await appendRow("Admin_Actions_Log", {
      action_id: uuidv4(),
      admin_id: entry.admin_id,
      action_type: entry.action_type,
      entity_type: entry.entity_type,
      entity_id: entry.entity_id,
      details: entry.details,
      status: entry.status,
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    // Never let a logging failure crash or block the calling flow.
    console.error("adminActionLogger: failed to write audit log entry:", err);
  }
}
