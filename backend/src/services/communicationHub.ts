/**
 * communicationHub.ts — GROWTH-004
 *
 * Receives campaign, resolved audience, and selected channels.
 * Delegates to each adapter via the registry.
 * Aggregates results into a unified delivery summary.
 *
 * The hub knows nothing about adapter internals.
 * Channel-specific logic stays in adapters.
 */

import type { ChannelId, ChannelRecipient, MessageContent, AdapterResult, DeliveryState } from "./adapters/channelAdapter";
import { channelRegistry } from "./channelRegistry";
import { getSheetData } from "./sheetsService";

export type DeliverySummary = Record<ChannelId, Record<DeliveryState, number>>;

export interface HubDeliveryResult {
  summary:      DeliverySummary;
  whatsappLinks?: Array<{ user_id: string; display_name: string; phone_masked: string; link: string }>;
  duration_ms:  number;
}

// ─── Merge-field enrichment ───────────────────────────────────────────────

async function enrichRecipients(
  recipients: ChannelRecipient[],
  week_id: string
): Promise<ChannelRecipient[]> {
  const [leaderboard, weeks, users, referrals] = await Promise.all([
    getSheetData("Leaderboard"),
    getSheetData("Weekly_Gameweek"),
    getSheetData("Users"),
    getSheetData("Referrals"),
  ]).catch(() => [[], [], [], []]) as any[];

  const week = (weeks as any[]).find((w: any) => String(w.week_id) === String(week_id));
  const weekLabel = week
    ? (() => {
        const s = new Date(week.start_date);
        const e = new Date(week.end_date);
        const m = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
        return `${m[s.getMonth()]} ${s.getDate()}-${e.getDate()}`;
      })()
    : "this week";

  const rankMap = new Map(
    (leaderboard as any[])
      .filter((l: any) => String(l.week_id) === String(week_id))
      .map((l: any) => [l.user_id, Number(l.rank)])
  );

  const referralMap = new Map(
    (users as any[]).map((u: any) => [
      u.user_id,
      u.referral_code ? `https://fantasyhoops.online/register?ref=${u.referral_code}` : "",
    ])
  );

  const phoneMap = new Map(
    (users as any[]).map((u: any) => [u.user_id, String(u.phone || "").replace(/^'/, "")])
  );

  return recipients.map((r) => ({
    ...r,
    phone_raw:      phoneMap.get(r.user_id) ?? "",
    gameweek_label: weekLabel,
    rank:           rankMap.get(r.user_id),
    referral_link:  referralMap.get(r.user_id) ?? "",
    first_name:     (r.display_name || "Manager").split(" ")[0],
  }));
}

// ─── Hub ─────────────────────────────────────────────────────────────────

export async function deliverCampaign(
  campaign:   any,
  recipients: ChannelRecipient[],
  channels:   ChannelId[]
): Promise<HubDeliveryResult> {
  const startMs = Date.now();

  // Enrich recipients with merge-field data (done once for all adapters)
  const latestWeekRow = await getSheetData("Weekly_Gameweek")
    .then((ws) =>
      [...ws].sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime())[0]
    )
    .catch(() => null);

  const enriched = await enrichRecipients(recipients, latestWeekRow?.week_id ?? "");

  const content: MessageContent = {
    campaign_id:       campaign.campaign_id,
    notification_type: campaign.notification_type,
    subject:           campaign.subject,
    message:           campaign.message,
    link:              campaign.link || undefined,
    priority:          campaign.priority || "normal",
  };

  // Initialise summary
  const summary: DeliverySummary = {} as DeliverySummary;
  const whatsappLinks: HubDeliveryResult["whatsappLinks"] = [];

  const states: DeliveryState[] = ["prepared","submitted","confirmed","failed","skipped"];
  for (const ch of channels) {
    summary[ch] = Object.fromEntries(states.map((s) => [s, 0])) as Record<DeliveryState, number>;
  }

  // Deliver per recipient, per channel
  const delay = enriched.length > 200 ? 200 : 100;

  for (const recipient of enriched) {
    for (const channelId of channels) {
      const adapter = channelRegistry.get(channelId);
      if (!adapter) continue;

      let result: AdapterResult;
      try {
        result = await adapter.send(recipient, content);
      } catch {
        result = { channel: channelId, user_id: recipient.user_id, state: "failed" };
      }

      summary[channelId][result.state] = (summary[channelId][result.state] ?? 0) + 1;

      // Collect WhatsApp links for queue UI
      if (channelId === "whatsapp" && result.state === "prepared" && result.reference) {
        whatsappLinks.push({
          user_id:      recipient.user_id,
          display_name: recipient.display_name,
          phone_masked: recipient.phone_masked,
          link:         result.reference,
        });
      }
    }

    if (delay > 0) await new Promise((r) => setTimeout(r, delay));
  }

  return {
    summary,
    whatsappLinks: whatsappLinks.length > 0 ? whatsappLinks : undefined,
    duration_ms:   Date.now() - startMs,
  };
}
