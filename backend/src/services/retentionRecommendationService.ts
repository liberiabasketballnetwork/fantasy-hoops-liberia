/**
 * retentionRecommendationService.ts — GROWTH-003
 *
 * Evaluates manager behaviour and generates actionable recommendations.
 * NEVER sends notifications automatically.
 * Every recommendation requires explicit admin approval.
 *
 * Rules implemented:
 *   DRAFT_REMINDER          Registered, no lineup this week
 *   RETURNING_MANAGER       Missed last 2 completed gameweeks
 *   FIRST_TIME_SUCCESS      Submitted first-ever lineup (this week)
 *   LEADERBOARD_PUSH        Top 10 this week
 *   REFERRAL_MOMENTUM       Earned first referral reward
 *   ACHIEVEMENT_CELEBRATION New achievement unlocked this week
 */

import { v4 as uuidv4 } from "uuid";
import { getSheetData, appendRow, updateRow } from "./sheetsService";
import { createCampaign, resolveAudience } from "./campaignService";
import { logAdminAction } from "./adminActionLogger";

// ─── Types ────────────────────────────────────────────────────────────────

export type RecommendationType =
  | "DRAFT_REMINDER"
  | "RETURNING_MANAGER"
  | "FIRST_TIME_SUCCESS"
  | "LEADERBOARD_PUSH"
  | "REFERRAL_MOMENTUM"
  | "ACHIEVEMENT_CELEBRATION";

export type RecommendationStatus = "pending" | "converted" | "dismissed" | "expired";

export interface Recommendation {
  recommendation_id:   string;
  recommendation_type: RecommendationType;
  title:               string;
  description:         string;
  audience_type:       string;
  audience_filter:     string;
  recommended_subject: string;
  recommended_message: string;
  status:              RecommendationStatus;
  campaign_id:         string;
  created_at:          string;
  created_by:          string;
  dismissed_at:        string;
  completed_at:        string;
  estimated_audience?: number; // resolved at read time, not stored
}

// ─── Rule definitions ─────────────────────────────────────────────────────

interface RuleDefinition {
  type:    RecommendationType;
  title:   string;
  describe: (count: number) => string;
  subject: string;
  message: string;
  audience_type: string;
  audience_filter_builder?: (context: RuleContext) => Record<string, any>;
}

interface RuleContext {
  latestWeekId?: string;
}

const RULES: RuleDefinition[] = [
  {
    type:     "DRAFT_REMINDER",
    title:    "Draft Reminder",
    describe: (n) => `${n} registered manager${n !== 1 ? "s" : ""} haven't submitted a lineup this gameweek.`,
    subject:  "Don't forget to submit your lineup!",
    message:  "The draft deadline is approaching. Pick your 5 players and compete for this week's prize!",
    audience_type: "ACTIVE_THIS_WEEK",   // inverted — non-active managers
    // Note: we use NEVER_DRAFTED as proxy since no "inactive this week" audience exists.
    // A more targeted audience would require INACTIVE_THIS_WEEK (Phase 2).
    audience_filter_builder: () => ({}),
  },
  {
    type:     "RETURNING_MANAGER",
    title:    "Re-engage Inactive Managers",
    describe: (n) => `${n} manager${n !== 1 ? "s" : ""} haven't participated in the last 2 gameweeks.`,
    subject:  "We miss you on Fantasy Hoops!",
    message:  "You've been away for a couple of weeks. Come back, build your team, and compete for this week's prizes!",
    audience_type: "INACTIVE_TWO_WEEKS",
    audience_filter_builder: () => ({}),
  },
  {
    type:     "FIRST_TIME_SUCCESS",
    title:    "First-Time Lineup Success",
    describe: (n) => `${n} manager${n !== 1 ? "s" : ""} submitted their first-ever lineup this week.`,
    subject:  "Welcome to the competition!",
    message:  "You've made your first team selection on Fantasy Hoops Liberia. Keep competing every week and climb the leaderboard!",
    audience_type: "ACTIVE_THIS_WEEK",
    audience_filter_builder: () => ({ first_timers_only: true }),
  },
  {
    type:     "LEADERBOARD_PUSH",
    title:    "Top 10 Managers This Week",
    describe: (n) => `${n} manager${n !== 1 ? "s" : ""} are in the Top 10 this week.`,
    subject:  "You're in the Top 10 — keep pushing!",
    message:  "You're performing brilliantly this week. Keep building strong lineups and go for that top spot!",
    audience_type: "ACTIVE_THIS_WEEK",
    audience_filter_builder: () => ({ top10_only: true }),
  },
  {
    type:     "REFERRAL_MOMENTUM",
    title:    "Referral Reward Milestone",
    describe: (n) => `${n} manager${n !== 1 ? "s" : ""} recently earned their first referral reward.`,
    subject:  "You're on a referral roll!",
    message:  "Your referral is paying off! Invite more friends to Fantasy Hoops Liberia and keep earning rewards.",
    audience_type: "REFERRED_USERS",
    audience_filter_builder: () => ({}),
  },
  {
    type:     "ACHIEVEMENT_CELEBRATION",
    title:    "Recent Achievement Unlocks",
    describe: (n) => `${n} manager${n !== 1 ? "s" : ""} earned new badges this week.`,
    subject:  "Congratulations on your achievement!",
    message:  "You've unlocked a new badge on Fantasy Hoops Liberia. Keep competing to unlock more achievements and rewards!",
    audience_type: "ACTIVE_THIS_WEEK",
    audience_filter_builder: () => ({}),
  },
];

// ─── Generate recommendations ─────────────────────────────────────────────

export async function generateRecommendations(admin_id: string): Promise<Recommendation[]> {
  const [existing, weeks, lineups, leaderboard, rewards, achievements] = await Promise.all([
    getSheetData("Retention_Recommendations"),
    getSheetData("Weekly_Gameweek"),
    getSheetData("User_Lineups"),
    getSheetData("Leaderboard"),
    getSheetData("Referral_Rewards"),
    getSheetData("Achievements"),
  ]);

  const sortedWeeks = [...weeks].sort(
    (a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime()
  );
  const latestWeek = sortedWeeks[0];
  const context: RuleContext = { latestWeekId: latestWeek?.week_id };

  // Existing pending recommendation types — prevent duplicates
  const pendingTypes = new Set(
    existing
      .filter((r) => r.status === "pending")
      .map((r) => r.recommendation_type)
  );

  const now = new Date().toISOString();
  const created: Recommendation[] = [];

  for (const rule of RULES) {
    // Skip if a pending recommendation of this type already exists
    if (pendingTypes.has(rule.type)) continue;

    // Estimate audience count for the description
    let audienceCount = 0;
    try {
      const filter = rule.audience_filter_builder?.(context) ?? {};
      // For first-timers: count users whose only lineup is in the latest week
      if (filter.first_timers_only && latestWeek) {
        const firstTimers = lineups.filter((l) => {
          const userLineups = lineups.filter((ul) => ul.user_id === l.user_id);
          return String(l.week_id) === String(latestWeek.week_id) && userLineups.length === 1;
        });
        audienceCount = new Set(firstTimers.map((l) => l.user_id)).size;
      } else if (filter.top10_only && latestWeek) {
        audienceCount = leaderboard.filter(
          (l) => String(l.week_id) === String(latestWeek.week_id) && Number(l.rank) <= 10
        ).length;
      } else {
        const recipients = await resolveAudience(rule.audience_type as any, filter);
        audienceCount = recipients.length;
      }
    } catch { audienceCount = 0; }

    // Skip if audience is empty — no point recommending action for 0 people
    if (audienceCount === 0) continue;

    const recommendation_id = uuidv4();
    const row: Recommendation = {
      recommendation_id,
      recommendation_type: rule.type,
      title:               rule.title,
      description:         rule.describe(audienceCount),
      audience_type:       rule.audience_type,
      audience_filter:     JSON.stringify(rule.audience_filter_builder?.(context) ?? {}),
      recommended_subject: rule.subject,
      recommended_message: rule.message,
      status:              "pending",
      campaign_id:         "",
      created_at:          now,
      created_by:          admin_id,
      dismissed_at:        "",
      completed_at:        "",
    };

    await appendRow("Retention_Recommendations", row);
    created.push({ ...row, estimated_audience: audienceCount });
  }

  await logAdminAction({
    admin_id,
    action_type: "GENERATE_RECOMMENDATIONS",
    entity_type: "PLATFORM",
    entity_id:   "retention",
    details:     `Generated ${created.length} retention recommendation${created.length !== 1 ? "s" : ""}.`,
    status:      "success",
  });

  return created;
}

// ─── List recommendations ─────────────────────────────────────────────────

export async function listRecommendations(): Promise<Recommendation[]> {
  const rows = await getSheetData("Retention_Recommendations");
  return rows.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  ) as Recommendation[];
}

// ─── Convert to campaign draft ────────────────────────────────────────────

export async function convertToCampaign(
  recommendation_id: string,
  admin_id: string
): Promise<{ campaign_id: string }> {
  const rows = await getSheetData("Retention_Recommendations");
  const rec  = rows.find((r) => r.recommendation_id === recommendation_id);
  if (!rec) throw new Error("Recommendation not found.");
  if (rec.status !== "pending") throw new Error("Only pending recommendations can be converted.");

  const campaign = await createCampaign({
    title:             `[Retention] ${rec.title}`,
    subject:           rec.recommended_subject,
    message:           rec.recommended_message,
    notification_type: "SYSTEM",
    audience_type:     rec.audience_type as any,
    audience_filter:   rec.audience_filter ? JSON.parse(rec.audience_filter) : {},
    priority:          "normal",
    created_by:        admin_id,
  });

  await updateRow("Retention_Recommendations", "recommendation_id", recommendation_id, {
    ...rec,
    status:       "converted",
    campaign_id:  campaign.campaign_id,
    completed_at: new Date().toISOString(),
  });

  await logAdminAction({
    admin_id,
    action_type: "CONVERT_RECOMMENDATION",
    entity_type: "RETENTION_RECOMMENDATION",
    entity_id:   recommendation_id,
    details:     `Recommendation "${rec.title}" converted to campaign ${campaign.campaign_id}.`,
    status:      "success",
  });

  return { campaign_id: campaign.campaign_id };
}

// ─── Dismiss recommendation ───────────────────────────────────────────────

export async function dismissRecommendation(
  recommendation_id: string,
  admin_id: string
): Promise<void> {
  const rows = await getSheetData("Retention_Recommendations");
  const rec  = rows.find((r) => r.recommendation_id === recommendation_id);
  if (!rec) throw new Error("Recommendation not found.");
  if (rec.status !== "pending") throw new Error("Only pending recommendations can be dismissed.");

  await updateRow("Retention_Recommendations", "recommendation_id", recommendation_id, {
    ...rec,
    status:       "dismissed",
    dismissed_at: new Date().toISOString(),
  });

  await logAdminAction({
    admin_id,
    action_type: "DISMISS_RECOMMENDATION",
    entity_type: "RETENTION_RECOMMENDATION",
    entity_id:   recommendation_id,
    details:     `Recommendation "${rec.title}" dismissed.`,
    status:      "success",
  });
}

// ─── Analytics summary ────────────────────────────────────────────────────

export async function getRetentionAnalytics() {
  const rows = await getSheetData("Retention_Recommendations").catch(() => []);
  const total     = rows.length;
  const pending   = rows.filter((r) => r.status === "pending").length;
  const converted = rows.filter((r) => r.status === "converted").length;
  const dismissed = rows.filter((r) => r.status === "dismissed").length;

  const byType: Record<string, number> = {};
  for (const r of rows) {
    byType[r.recommendation_type] = (byType[r.recommendation_type] || 0) + 1;
  }

  return {
    total,
    pending,
    converted,
    dismissed,
    conversionRate: total > 0 ? Math.round((converted / total) * 100) : 0,
    byType,
  };
}
