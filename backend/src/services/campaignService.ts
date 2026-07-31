/**
 * campaignService.ts — GROWTH-002
 *
 * Single source of truth for Admin Communications & Campaign Manager.
 *
 * Delivery always goes through notificationEventEngine — there is exactly
 * one notification pipeline in the platform.
 */

import { v4 as uuidv4 } from "uuid";
import { getSheetData, appendRow, updateRow } from "./sheetsService";
import { normalizeSheetPhone } from "../utils/phoneUtils";
import { logAdminAction } from "./adminActionLogger";
import { deliverCampaign } from "./communicationHub";
import type { ChannelId } from "./adapters/channelAdapter";
import type { NotificationType, NotificationPriority } from "./notificationEventEngine";

// ─── Audience types ───────────────────────────────────────────────────────

export type AudienceType =
  | "ALL_MANAGERS"
  | "ACTIVE_THIS_WEEK"
  | "INACTIVE_TWO_WEEKS"
  | "NEVER_DRAFTED"
  | "NO_ACHIEVEMENTS"
  | "REFERRED_USERS"
  | "SINGLE_USER";

export const AUDIENCE_LABELS: Record<AudienceType, string> = {
  ALL_MANAGERS:       "All Registered Managers",
  ACTIVE_THIS_WEEK:   "Active Managers This Week",
  INACTIVE_TWO_WEEKS: "Inactive for 2+ Weeks",
  NEVER_DRAFTED:      "Never Submitted a Lineup",
  NO_ACHIEVEMENTS:    "No Badges Earned",
  REFERRED_USERS:     "Referred Managers",
  SINGLE_USER:        "Single Manager",
};

// ─── Campaign status ──────────────────────────────────────────────────────

export type CampaignStatus = "draft" | "sending" | "sent" | "cancelled";

// ─── Audience resolution ──────────────────────────────────────────────────

interface Recipient { user_id: string; display_name: string; phone_masked: string; }

export async function resolveAudience(
  audienceType: AudienceType,
  audienceFilter: Record<string, any> = {}
): Promise<Recipient[]> {
  const [users, lineups, weeks, achievements] = await Promise.all([
    getSheetData("Users"),
    getSheetData("User_Lineups"),
    getSheetData("Weekly_Gameweek"),
    getSheetData("Achievements"),
  ]);

  const maskPhone = (raw: string) => {
    const p = normalizeSheetPhone(raw);
    if (p.length < 7) return "***";
    return `${p.slice(0, 4)}***${p.slice(-3)}`;
  };

  const toRecipient = (u: any): Recipient => ({
    user_id:      u.user_id,
    display_name: u.display_name || u.full_name || "Manager",
    phone_masked: maskPhone(String(u.phone || "")),
  });

  const sortedWeeks = [...weeks].sort(
    (a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime()
  );
  const latestWeek    = sortedWeeks[0];
  const prevTwoWeeks  = sortedWeeks
    .filter((w) => String(w.scores_calculated).toUpperCase() === "TRUE")
    .slice(0, 2)
    .map((w) => w.week_id);

  switch (audienceType) {

    case "ALL_MANAGERS":
      return users.map(toRecipient);

    case "ACTIVE_THIS_WEEK": {
      if (!latestWeek) return [];
      const activeIds = new Set(
        lineups.filter((l) => String(l.week_id) === String(latestWeek.week_id)).map((l) => l.user_id)
      );
      return users.filter((u) => activeIds.has(u.user_id)).map(toRecipient);
    }

    case "INACTIVE_TWO_WEEKS": {
      if (prevTwoWeeks.length < 2) return [];
      const recentIds = new Set(
        lineups.filter((l) => prevTwoWeeks.includes(String(l.week_id))).map((l) => l.user_id)
      );
      return users.filter((u) => !recentIds.has(u.user_id)).map(toRecipient);
    }

    case "NEVER_DRAFTED": {
      const draftedIds = new Set(lineups.map((l) => l.user_id));
      return users.filter((u) => !draftedIds.has(u.user_id)).map(toRecipient);
    }

    case "NO_ACHIEVEMENTS": {
      const earnedIds = new Set(achievements.map((a) => a.user_id));
      return users.filter((u) => !earnedIds.has(u.user_id)).map(toRecipient);
    }

    case "REFERRED_USERS": {
      return users.filter((u) => !!u.referred_by).map(toRecipient);
    }

    case "SINGLE_USER": {
      const targetId = audienceFilter.user_id;
      if (!targetId) return [];
      const user = users.find((u) => u.user_id === targetId);
      return user ? [toRecipient(user)] : [];
    }

    default:
      return [];
  }
}

// ─── Search users for SINGLE_USER selection ───────────────────────────────

export async function searchUsers(query: string): Promise<Recipient[]> {
  const users = await getSheetData("Users");
  const q = query.toLowerCase().trim();
  if (!q || q.length < 2) return [];
  const maskPhone = (raw: string) => {
    const p = normalizeSheetPhone(raw);
    if (p.length < 7) return "***";
    return `${p.slice(0, 4)}***${p.slice(-3)}`;
  };
  return users
    .filter((u) =>
      (u.display_name || u.full_name || "").toLowerCase().includes(q)
    )
    .slice(0, 10)
    .map((u) => ({
      user_id:      u.user_id,
      display_name: u.display_name || u.full_name || "Manager",
      phone_masked: maskPhone(String(u.phone || "")),
    }));
}

// ─── Create campaign ──────────────────────────────────────────────────────

interface CreateCampaignInput {
  title:             string;
  subject:           string;
  message:           string;
  notification_type: NotificationType;
  audience_type:     AudienceType;
  audience_filter?:  Record<string, any>;
  link?:             string;
  priority?:         NotificationPriority;
  created_by:        string;
  channels?:         ChannelId[];  // GROWTH-004: default ["notification"]
}

export async function createCampaign(input: CreateCampaignInput) {
  const campaign_id = uuidv4();
  const now         = new Date().toISOString();

  await appendRow("Campaigns", {
    campaign_id,
    title:             input.title,
    subject:           input.subject,
    message:           input.message,
    notification_type: input.notification_type,
    audience_type:     input.audience_type,
    audience_filter:   input.audience_filter ? JSON.stringify(input.audience_filter) : "",
    status:            "draft",
    recipient_count:   "",
    scheduled_at:      "",
    sent_at:           "",
    created_by:        input.created_by,
    created_at:        now,
    link:              input.link || "",
    priority:          input.priority || "normal",
    channels:          JSON.stringify(input.channels ?? ["notification"]),
    delivery_results:  "",
    whatsapp_queue_status: "",
    delivery_duration_ms:  "",
  });

  return { campaign_id, status: "draft", created_at: now };
}

// ─── Get campaign ─────────────────────────────────────────────────────────

export async function getCampaign(campaign_id: string) {
  const campaigns = await getSheetData("Campaigns");
  return campaigns.find((c) => c.campaign_id === campaign_id) ?? null;
}

// ─── List campaigns ───────────────────────────────────────────────────────

export async function listCampaigns() {
  const campaigns = await getSheetData("Campaigns");
  return campaigns.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

// ─── Preview campaign (no notifications written) ──────────────────────────

export async function previewCampaign(campaign_id: string, admin_id: string) {
  const campaign = await getCampaign(campaign_id);
  if (!campaign) throw new Error("Campaign not found.");
  if (campaign.status !== "draft") throw new Error("Only draft campaigns can be previewed.");

  const filter = campaign.audience_filter ? JSON.parse(campaign.audience_filter) : {};
  const recipients = await resolveAudience(campaign.audience_type as AudienceType, filter);

  const sample = recipients.slice(0, 5).map((r) => ({
    display_name: r.display_name,
    phone_masked: r.phone_masked,
  }));

  await logAdminAction({
    admin_id,
    action_type: "PREVIEW_CAMPAIGN",
    entity_type: "CAMPAIGN",
    entity_id:   campaign_id,
    details:     `Campaign "${campaign.title}" previewed. Audience: ${campaign.audience_type}. Recipients: ${recipients.length}.`,
    status:      "success",
  });

  return {
    campaign_id,
    audience_type:        campaign.audience_type,
    audience_label:       AUDIENCE_LABELS[campaign.audience_type as AudienceType] ?? campaign.audience_type,
    recipient_count:      recipients.length,
    sample,
  };
}

// ─── Send campaign (async, fire-and-forget after returning) ───────────────

export async function sendCampaign(campaign_id: string, admin_id: string) {
  const campaign = await getCampaign(campaign_id);
  if (!campaign) throw new Error("Campaign not found.");
  if (campaign.status !== "draft") throw new Error("Only draft campaigns can be sent.");

  // Transition to sending immediately — prevents double-sends
  await updateRow("Campaigns", "campaign_id", campaign_id, {
    ...campaign,
    status: "sending",
  });

  await logAdminAction({
    admin_id,
    action_type: "SEND_CAMPAIGN",
    entity_type: "CAMPAIGN",
    entity_id:   campaign_id,
    details:     `Campaign "${campaign.title}" send initiated. Audience: ${campaign.audience_type}.`,
    status:      "success",
  });

  // Start delivery asynchronously — do not await this
  _deliverCampaign(campaign, campaign_id, admin_id).catch((err) => {
    console.error(`[Campaign] Delivery error for ${campaign_id}:`, err?.message);
  });

  return { campaign_id, status: "sending" };
}

// ─── Internal delivery loop ───────────────────────────────────────────────

async function _deliverCampaign(
  campaign: any,
  campaign_id: string,
  admin_id: string
) {
  const startMs    = Date.now();
  const filter     = campaign.audience_filter ? JSON.parse(campaign.audience_filter) : {};
  const recipients = await resolveAudience(campaign.audience_type as AudienceType, filter);
  const channels   = campaign.channels
    ? (JSON.parse(campaign.channels) as ChannelId[])
    : ["notification" as ChannelId];

  // ── GROWTH-004: delegate to CommunicationHub ──────────────────────────
  const { summary, whatsappLinks, duration_ms } = await deliverCampaign(
    campaign, recipients, channels
  );

  const notifDelivered = (summary["notification"]?.confirmed ?? 0);
  const durationMs     = duration_ms;

  // Update campaign with unified delivery results
  const refreshed = await getCampaign(campaign_id);
  await updateRow("Campaigns", "campaign_id", campaign_id, {
    ...refreshed,
    status:               "sent",
    recipient_count:      notifDelivered,
    sent_at:              new Date().toISOString(),
    delivery_duration_ms: durationMs,
    delivery_results:     JSON.stringify(summary),
    whatsapp_queue_status: whatsappLinks && whatsappLinks.length > 0 ? "pending" : "",
  });

  await logAdminAction({
    admin_id,
    action_type: "COMPLETE_CAMPAIGN",
    entity_type: "CAMPAIGN",
    entity_id:   campaign_id,
    details:     `Campaign "${campaign.title}" completed. Channels: ${channels.join(",")}. Notification confirmed: ${notifDelivered}. Duration: ${durationMs}ms.`,
    status:      "success",
  });

  console.log(`[Campaign] ${campaign_id} complete — notification confirmed:${notifDelivered} in ${durationMs}ms`);
}

// ─── Cancel campaign ──────────────────────────────────────────────────────

export async function cancelCampaign(campaign_id: string, admin_id: string) {
  const campaign = await getCampaign(campaign_id);
  if (!campaign) throw new Error("Campaign not found.");
  if (campaign.status !== "draft") throw new Error("Only draft campaigns can be cancelled.");

  await updateRow("Campaigns", "campaign_id", campaign_id, {
    ...campaign,
    status: "cancelled",
  });

  await logAdminAction({
    admin_id,
    action_type: "CANCEL_CAMPAIGN",
    entity_type: "CAMPAIGN",
    entity_id:   campaign_id,
    details:     `Campaign "${campaign.title}" cancelled.`,
    status:      "success",
  });

  return { campaign_id, status: "cancelled" };
}
