/**
 * whatsAppLinkAdapter.ts — GROWTH-004
 *
 * Phase 1: generates personalized wa.me links.
 * No WhatsApp API. No external integrations. No webhooks.
 *
 * Phone conversion: 0881465193 → 231881465193
 * (strip leading 0, prepend Liberia country code 231)
 *
 * Merge fields (server-side replacement only):
 *   {{first_name}}     — recipient's first name
 *   {{gameweek}}       — current gameweek label
 *   {{rank}}           — leaderboard rank this week
 *   {{referral_link}}  — personal referral URL
 */

import type {
  ChannelAdapter, ChannelCapability,
  ChannelRecipient, MessageContent, AdapterResult,
} from "./channelAdapter";

const COUNTRY_CODE = "231";
const BASE_URL     = "https://fantasyhoops.online";

// ─── Phone normalization ──────────────────────────────────────────────────

function toInternational(phone: string): string | null {
  let digits = String(phone || "").replace(/[^\d]/g, "");
  if (!digits) return null;
  // Strip leading apostrophe protection (from Google Sheets storage)
  // Already stripped by normalizeSheetPhone — but guard again
  if (digits.startsWith("'")) digits = digits.slice(1);
  // Already international
  if (digits.startsWith(COUNTRY_CODE) && digits.length > 9) return digits;
  // Local format: strip leading 0, prepend country code
  if (digits.startsWith("0")) digits = digits.slice(1);
  return `${COUNTRY_CODE}${digits}`;
}

// ─── Merge field substitution ─────────────────────────────────────────────

const MERGE_DEFAULTS: Record<string, string> = {
  first_name:    "Manager",
  gameweek:      "this week",
  rank:          "N/A",
  referral_link: BASE_URL,
  sponsor_name:  "",
};

export function applyMergeFields(
  template: string,
  recipient: ChannelRecipient
): string {
  const values: Record<string, string> = {
    first_name:    (recipient.display_name || "").split(" ")[0] || MERGE_DEFAULTS.first_name,
    gameweek:      recipient.gameweek_label  || MERGE_DEFAULTS.gameweek,
    rank:          recipient.rank !== undefined ? String(recipient.rank) : MERGE_DEFAULTS.rank,
    referral_link: recipient.referral_link   || MERGE_DEFAULTS.referral_link,
  };

  return template.replace(
    /\{\{(\w+)\}\}/g,
    (_, key) => values[key] ?? MERGE_DEFAULTS[key] ?? `{{${key}}}`
  );
}

// ─── Adapter ──────────────────────────────────────────────────────────────

export class WhatsAppLinkAdapter implements ChannelAdapter {
  readonly capability: ChannelCapability = {
    channelId:                   "whatsapp",
    label:                       "WhatsApp",
    supportsPersonalization:     true,
    supportsScheduling:          false,
    supportsDeliveryConfirmation: false,  // admin manually marks sent
    requiresPhone:               true,
    requiresEmail:               false,
    available:                   true,
  };

  async send(recipient: ChannelRecipient, content: MessageContent): Promise<AdapterResult> {
    const phone = toInternational(recipient.phone_raw ?? "");
    if (!phone) {
      return { channel: "whatsapp", user_id: recipient.user_id, state: "skipped" };
    }

    const personalizedMessage = applyMergeFields(content.message, recipient);
    const link = `https://wa.me/${phone}?text=${encodeURIComponent(personalizedMessage)}`;

    return {
      channel:   "whatsapp",
      user_id:   recipient.user_id,
      state:     "prepared",  // link generated; admin must send manually
      reference: link,
    };
  }
}
