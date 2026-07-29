/**
 * platformSettingsService.ts — ADMIN-014
 *
 * Single source of truth for all configurable business and marketing values.
 * Reads from the Platform_Settings Google Sheet (key/value/description rows).
 * Completely separate from gameplay logic.
 */

import { getSheetData, updateRow, appendRow } from "./sheetsService";

// ─── Setting key constants ────────────────────────────────────────────────

export const PS_KEYS = {
  PRIZE_MONEY_AWARDED:   "PrizeMoneyAwarded",
  CURRENT_WEEKLY_PRIZE:  "CurrentWeeklyPrize",
  CURRENT_SEASON:        "CurrentSeason",
  INVITE_HEADLINE:       "InviteHeadline",
  COMMUNITY_HEADLINE:    "CommunityHeadline",
  ANNOUNCEMENT:          "Announcement",
  ANNOUNCEMENT_ENABLED:  "AnnouncementEnabled",
  SPONSOR_NAME:          "SponsorName",
  // FEATURE-003: Referral rewards
  REFERRAL_REWARD_ENABLED:             "ReferralRewardEnabled",
  REFERRAL_REWARD_AMOUNT_LRD:          "ReferralRewardAmountLrd",
  REFERRAL_QUALIFICATION_WINDOW_WEEKS: "ReferralQualificationWindowWeeks",
  REFERRAL_MAX_REWARDS_PER_MONTH:      "ReferralMaxRewardsPerMonth",
} as const;

// ─── Defaults (used when sheet row is missing) ────────────────────────────

const DEFAULTS: Record<string, string> = {
  [PS_KEYS.PRIZE_MONEY_AWARDED]:  "7500",
  [PS_KEYS.CURRENT_WEEKLY_PRIZE]: "2500",
  [PS_KEYS.CURRENT_SEASON]:       "2026",
  [PS_KEYS.INVITE_HEADLINE]:      "Think you know Liberian basketball? Prove it!",
  [PS_KEYS.COMMUNITY_HEADLINE]:   "Fantasy Hoops Community",
  [PS_KEYS.ANNOUNCEMENT]:         "",
  [PS_KEYS.ANNOUNCEMENT_ENABLED]: "FALSE",
  [PS_KEYS.SPONSOR_NAME]:         "Orange Liberia",
  // FEATURE-003: Referral rewards
  [PS_KEYS.REFERRAL_REWARD_ENABLED]:           "FALSE",
  [PS_KEYS.REFERRAL_REWARD_AMOUNT_LRD]:        "500",
  [PS_KEYS.REFERRAL_QUALIFICATION_WINDOW_WEEKS]: "4",
  [PS_KEYS.REFERRAL_MAX_REWARDS_PER_MONTH]:    "10",
};

// ─── Types ────────────────────────────────────────────────────────────────

export interface PlatformSettings {
  prizeMoneyAwarded:  number;
  currentWeeklyPrize: number;
  currentSeason:      string;
  inviteHeadline:     string;
  communityHeadline:  string;
  announcement:       string;
  announcementEnabled: boolean;
  sponsorName:        string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function toPublicKey(sheetKey: string): string {
  // "PrizeMoneyAwarded" → "prizeMoneyAwarded"
  return sheetKey.charAt(0).toLowerCase() + sheetKey.slice(1);
}

function rowMapFromSheet(rows: any[]): Record<string, string> {
  const map: Record<string, string> = { ...DEFAULTS };
  for (const row of rows) {
    if (row.key) map[row.key] = String(row.value ?? "");
  }
  return map;
}

// ─── Read ─────────────────────────────────────────────────────────────────

export async function getPlatformSettings(): Promise<PlatformSettings> {
  const rows = await getSheetData("Platform_Settings").catch(() => []);
  const map  = rowMapFromSheet(rows);

  return {
    prizeMoneyAwarded:   Math.max(0, Number(map[PS_KEYS.PRIZE_MONEY_AWARDED])  || 0),
    currentWeeklyPrize:  Math.max(0, Number(map[PS_KEYS.CURRENT_WEEKLY_PRIZE]) || 0),
    currentSeason:       map[PS_KEYS.CURRENT_SEASON]      || DEFAULTS[PS_KEYS.CURRENT_SEASON],
    inviteHeadline:      map[PS_KEYS.INVITE_HEADLINE]     || DEFAULTS[PS_KEYS.INVITE_HEADLINE],
    communityHeadline:   map[PS_KEYS.COMMUNITY_HEADLINE]  || DEFAULTS[PS_KEYS.COMMUNITY_HEADLINE],
    announcement:        map[PS_KEYS.ANNOUNCEMENT]        ?? "",
    announcementEnabled: map[PS_KEYS.ANNOUNCEMENT_ENABLED].toUpperCase() === "TRUE",
    sponsorName:         map[PS_KEYS.SPONSOR_NAME]        || DEFAULTS[PS_KEYS.SPONSOR_NAME],
  };
}

// ─── Write ────────────────────────────────────────────────────────────────

export type PartialPlatformSettings = Partial<{
  prizeMoneyAwarded:   number;
  currentWeeklyPrize:  number;
  currentSeason:       string;
  inviteHeadline:      string;
  communityHeadline:   string;
  announcement:        string;
  announcementEnabled: boolean;
  sponsorName:         string;
}>;

/** Map camelCase input keys back to sheet keys */
const CAMEL_TO_SHEET: Record<string, string> = {
  prizeMoneyAwarded:   PS_KEYS.PRIZE_MONEY_AWARDED,
  currentWeeklyPrize:  PS_KEYS.CURRENT_WEEKLY_PRIZE,
  currentSeason:       PS_KEYS.CURRENT_SEASON,
  inviteHeadline:      PS_KEYS.INVITE_HEADLINE,
  communityHeadline:   PS_KEYS.COMMUNITY_HEADLINE,
  announcement:        PS_KEYS.ANNOUNCEMENT,
  announcementEnabled: PS_KEYS.ANNOUNCEMENT_ENABLED,
  sponsorName:         PS_KEYS.SPONSOR_NAME,
};

export interface ValidationError { field: string; message: string; }

function validate(updates: PartialPlatformSettings): ValidationError[] {
  const errors: ValidationError[] = [];

  const numericFields = ["prizeMoneyAwarded", "currentWeeklyPrize"] as const;
  for (const f of numericFields) {
    if (f in updates) {
      const v = Number(updates[f]);
      if (isNaN(v) || v < 0) errors.push({ field: f, message: "Must be a non-negative number." });
    }
  }

  const requiredText = ["currentSeason", "inviteHeadline", "communityHeadline", "sponsorName"] as const;
  for (const f of requiredText) {
    if (f in updates && !String(updates[f] ?? "").trim()) {
      errors.push({ field: f, message: "Cannot be empty." });
    }
  }

  return errors;
}

export async function updatePlatformSettings(
  updates: PartialPlatformSettings
): Promise<{ errors?: ValidationError[] }> {
  const errors = validate(updates);
  if (errors.length > 0) return { errors };

  const rows = await getSheetData("Platform_Settings").catch(() => []);
  const existingKeys = new Set(rows.map((r: any) => r.key));

  for (const [camel, rawValue] of Object.entries(updates)) {
    const sheetKey = CAMEL_TO_SHEET[camel];
    if (!sheetKey) continue; // unknown key — ignore safely

    let sheetValue: string;
    if (typeof rawValue === "boolean") {
      sheetValue = rawValue ? "TRUE" : "FALSE";
    } else {
      sheetValue = String(rawValue ?? "").trim();
    }

    if (existingKeys.has(sheetKey)) {
      await updateRow("Platform_Settings", "key", sheetKey, { key: sheetKey, value: sheetValue });
    } else {
      await appendRow("Platform_Settings", {
        key:         sheetKey,
        value:       sheetValue,
        description: "",
      });
    }
  }

  return {};
}
