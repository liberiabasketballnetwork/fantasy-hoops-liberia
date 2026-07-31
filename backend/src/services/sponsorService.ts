/**
 * sponsorService.ts — BUSINESS-001
 *
 * Commercial Foundation — Sponsor entity management.
 * Sponsors are first-class commercial entities that annotate
 * existing campaigns, gameweeks, and analytics.
 *
 * Nothing in this service modifies gameplay logic.
 */

import { v4 as uuidv4 } from "uuid";
import { getSheetData, appendRow, updateRow } from "./sheetsService";
import { logAdminAction } from "./adminActionLogger";

// ─── Types ────────────────────────────────────────────────────────────────

export type SponsorTier   = "platinum" | "gold" | "silver" | "partner";
export type SponsorStatus = "active" | "inactive" | "expired" | "pending";

export interface Sponsor {
  sponsor_id:     string;
  company_name:   string;
  logo_url:       string;
  website:        string;
  contact_name:   string;
  contact_phone:  string;  // never exposed via public API
  contact_email:  string;  // never exposed via public API
  tier:           SponsorTier;
  contract_start: string;
  contract_end:   string;
  status:         SponsorStatus;
  notes:          string;  // never exposed via public API
  created_at:     string;
  created_by:     string;
}

/** Safe public-facing view — strips internal fields */
export function toPublicSponsor(s: any) {
  return {
    sponsor_id:     s.sponsor_id,
    company_name:   s.company_name,
    logo_url:       s.logo_url,
    website:        s.website,
    tier:           s.tier,
    contract_start: s.contract_start,
    contract_end:   s.contract_end,
    status:         s.status,
    created_at:     s.created_at,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function isExpired(sponsor: any): boolean {
  if (!sponsor.contract_end) return false;
  return new Date(sponsor.contract_end) < new Date();
}

// ─── CRUD ─────────────────────────────────────────────────────────────────

export async function createSponsor(
  input: {
    company_name:  string;
    logo_url?:     string;
    website?:      string;
    contact_name?: string;
    contact_phone?: string;
    contact_email?: string;
    tier?:         SponsorTier;
    contract_start?: string;
    contract_end?:   string;
    notes?:        string;
  },
  admin_id: string
): Promise<Sponsor> {
  if (!input.company_name?.trim()) throw new Error("company_name is required.");

  const sponsor_id = uuidv4();
  const now        = new Date().toISOString();

  const row: Sponsor = {
    sponsor_id,
    company_name:  input.company_name.trim(),
    logo_url:      input.logo_url     || "",
    website:       input.website      || "",
    contact_name:  input.contact_name || "",
    contact_phone: input.contact_phone || "",
    contact_email: input.contact_email || "",
    tier:          input.tier         || "silver",
    contract_start: input.contract_start || "",
    contract_end:   input.contract_end   || "",
    status:        "active",
    notes:         input.notes || "",
    created_at:    now,
    created_by:    admin_id,
  };

  await appendRow("Sponsors", row);

  await logAdminAction({
    admin_id,
    action_type: "CREATE_SPONSOR",
    entity_type: "SPONSOR",
    entity_id:   sponsor_id,
    details:     `Sponsor "${row.company_name}" (${row.tier}) created.`,
    status:      "success",
  });

  return row;
}

export async function updateSponsor(
  sponsor_id: string,
  input: Partial<Omit<Sponsor, "sponsor_id" | "created_at" | "created_by">>,
  admin_id: string
): Promise<Sponsor> {
  const sponsors = await getSheetData("Sponsors");
  const existing = sponsors.find((s) => s.sponsor_id === sponsor_id);
  if (!existing) throw new Error("Sponsor not found.");

  const updated = { ...existing, ...input };
  await updateRow("Sponsors", "sponsor_id", sponsor_id, updated);

  await logAdminAction({
    admin_id,
    action_type: "UPDATE_SPONSOR",
    entity_type: "SPONSOR",
    entity_id:   sponsor_id,
    details:     `Sponsor "${existing.company_name}" updated.`,
    status:      "success",
  });

  return updated as Sponsor;
}

export async function deactivateSponsor(
  sponsor_id: string,
  admin_id: string
): Promise<void> {
  const sponsors = await getSheetData("Sponsors");
  const existing = sponsors.find((s) => s.sponsor_id === sponsor_id);
  if (!existing) throw new Error("Sponsor not found.");

  await updateRow("Sponsors", "sponsor_id", sponsor_id, {
    ...existing,
    status: "inactive",
  });

  await logAdminAction({
    admin_id,
    action_type: "DEACTIVATE_SPONSOR",
    entity_type: "SPONSOR",
    entity_id:   sponsor_id,
    details:     `Sponsor "${existing.company_name}" deactivated.`,
    status:      "success",
  });
}

export async function getSponsor(sponsor_id: string): Promise<Sponsor | null> {
  const sponsors = await getSheetData("Sponsors");
  return (sponsors.find((s) => s.sponsor_id === sponsor_id) ?? null) as Sponsor | null;
}

export async function listSponsors(): Promise<Sponsor[]> {
  const sponsors = await getSheetData("Sponsors");
  // Auto-mark expired sponsors
  return sponsors
    .map((s) => ({
      ...s,
      status: isExpired(s) && s.status === "active" ? "expired" : s.status,
    }))
    .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()) as Sponsor[];
}

// ─── Analytics ────────────────────────────────────────────────────────────

export async function getSponsorAnalytics(sponsor_id: string) {
  const sponsor = await getSponsor(sponsor_id);
  if (!sponsor) throw new Error("Sponsor not found.");

  const [campaigns, weeks, lineups, notifications] = await Promise.all([
    getSheetData("Campaigns"),
    getSheetData("Weekly_Gameweek"),
    getSheetData("User_Lineups"),
    getSheetData("Notifications"),
  ]);

  // Campaigns attributed to this sponsor
  const sponsoredCampaigns = campaigns.filter(
    (c) => String(c.sponsor_id || "") === sponsor_id
  );

  // Gameweeks attributed to this sponsor
  const sponsoredWeeks = weeks.filter(
    (w) => String(w.sponsor_id || "") === sponsor_id
  );

  // Managers who participated in sponsored gameweeks
  const sponsoredWeekIds = new Set(sponsoredWeeks.map((w) => w.week_id));
  const managersInWeeks  = new Set(
    lineups
      .filter((l) => sponsoredWeekIds.has(l.week_id))
      .map((l) => l.user_id)
  );

  // Notification + WhatsApp deliveries from sponsored campaigns
  let notificationDeliveries = 0;
  let whatsappDeliveries     = 0;

  for (const c of sponsoredCampaigns) {
    if (c.delivery_results) {
      try {
        const dr = JSON.parse(c.delivery_results);
        notificationDeliveries += dr.notification?.confirmed ?? 0;
        whatsappDeliveries     += dr.whatsapp?.prepared        ?? 0;
      } catch { /* skip malformed rows */ }
    }
    notificationDeliveries += Number(c.recipient_count || 0);
  }

  // Total managers reached: unique managers who received a sponsored notification
  // or participated in a sponsored gameweek
  const campaignRecipients = new Set(
    notifications
      .filter((n) => {
        try {
          const meta = JSON.parse(n.metadata || "{}");
          return sponsoredCampaigns.some((c) => c.campaign_id === meta.campaign_id);
        } catch { return false; }
      })
      .map((n) => n.user_id)
  );

  const managersReached = new Set([
    ...managersInWeeks,
    ...campaignRecipients,
  ]).size;

  await logAdminAction({
    admin_id:    "admin",
    action_type: "VIEW_SPONSOR_ANALYTICS",
    entity_type: "SPONSOR",
    entity_id:   sponsor_id,
    details:     `Analytics viewed for sponsor "${sponsor.company_name}".`,
    status:      "success",
  });

  return {
    sponsor:                toPublicSponsor(sponsor),
    campaigns:              sponsoredCampaigns.length,
    gameweeks:              sponsoredWeeks.length,
    managersReached,
    notificationDeliveries,
    whatsappDeliveries,
    generatedAt:            new Date().toISOString(),
  };
}
