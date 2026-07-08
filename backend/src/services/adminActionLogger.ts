import { v4 as uuidv4 } from "uuid";
import { appendRow } from "./sheetsService";

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
    console.error("adminActionLogger: failed to write audit log entry:", err);
  }
}
