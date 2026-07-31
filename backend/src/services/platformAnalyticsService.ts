/**
 * platformAnalyticsService.ts — GROWTH-001
 *
 * Single source of truth for Manager Engagement Analytics.
 * Admin-only. Never used by public endpoints or gameplay services.
 *
 * All reads are parallel via the existing sheetsService cache.
 * All aggregation is in-memory — no new sheets, no schema changes.
 */

import { getSheetData } from "./sheetsService";

// ─── Types ────────────────────────────────────────────────────────────────

export interface PlatformAnalytics {
  analyticsVersion: string;
  generatedAt:      string;
  growth:           GrowthMetrics;
  funnel:           FunnelMetrics;
  engagement:       EngagementMetrics;
  referrals:        ReferralMetrics;
  achievements:     AchievementMetrics;
  notifications:    NotificationMetrics;
  sponsor:          SponsorMetrics;
  campaigns:        CampaignAnalyticsMetrics;
  retention:        RetentionAnalyticsMetrics;
}

interface CampaignAnalyticsMetrics {
  totalCreated:     number;
  totalSent:        number;
  totalRecipients:  number;
  byAudience:       Record<string, number>;
}

interface RetentionAnalyticsMetrics {
  totalRecommendations: number;
  pending:              number;
  converted:            number;
  dismissed:            number;
  conversionRate:       number;
}

interface GrowthMetrics {
  totalManagers:       number;
  newThisWeek:         number;
  newThisMonth:        number;
  activeLastSevenDays: number;
}

interface FunnelMetrics {
  registered:           number;
  everSubmittedLineup:  number;
  neverDrafted:         number;
  activeThisWeek:       number;
  activationRate:       number; // everSubmitted / registered × 100
}

interface WeekParticipation {
  week_id:   string;
  label:     string;
  managers:  number;
  start_date: string;
}

interface EngagementMetrics {
  weeklyParticipation:    WeekParticipation[];
  retentionRate:          number;
  previousWeekManagers:   number;
  returnedThisWeek:       number;
  highestWeek:            number;
  averageWeekly:          number;
}

interface ReferralMetrics {
  totalCodes:        number;
  totalReferrals:    number;
  qualified:         number;
  conversionRate:    number;
  rewardsPending:    number;
  rewardsApproved:   number;
  rewardsPaid:       number;
  totalLrdDisbursed: number;
}

interface BadgeCount { key: string; name: string; count: number; }

interface AchievementMetrics {
  totalEarned:     number;
  uniqueEarners:   number;
  adoptionRate:    number; // uniqueEarners / totalManagers × 100
  usersNoBadges:   number;
  topBadges:       BadgeCount[];
}

interface NotificationTypeMetric {
  type:     string;
  sent:     number;
  read:     number;
  readRate: number;
}

interface NotificationMetrics {
  byType:          NotificationTypeMetric[];
  overallSent:     number;
  overallRead:     number;
  overallReadRate: number;
}

interface SponsorMetrics {
  registeredManagers:     number;
  activeThisWeek:         number;
  completedGameweeks:     number;
  totalFantasyTeamsCreated: number;
  prizeMoneyAwarded:      number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function windowStart(daysAgo: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatWeekLabel(start: string, end: string): string {
  const s = new Date(start);
  const e = new Date(end);
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[s.getMonth()]} ${s.getDate()}–${e.getDate()}`;
}

// ─── Main analytics function ──────────────────────────────────────────────

export async function getPlatformAnalytics(): Promise<PlatformAnalytics> {
  const now = new Date();

  // ── Read all sheets in parallel ───────────────────────────────────────
  const [
    users, lineups, weeks, leaderboard, referrals, rewards,
    achievements, notifications, lineupPlayers, platformSettings,
    campaigns, retentionRecs,
  ] = await Promise.all([
    getSheetData("Users"),
    getSheetData("User_Lineups"),
    getSheetData("Weekly_Gameweek"),
    getSheetData("Leaderboard"),
    getSheetData("Referrals"),
    getSheetData("Referral_Rewards"),
    getSheetData("Achievements"),
    getSheetData("Notifications"),
    getSheetData("Lineup_Players"),
    getSheetData("Platform_Settings"),
    getSheetData("Campaigns").catch(() => []),
    getSheetData("Retention_Recommendations").catch(() => []),
  ]);

  // ── Community Growth ─────────────────────────────────────────────────

  const weekStart  = windowStart(7);
  const monthStart = windowStart(30);
  const sevenDays  = windowStart(7);

  const newThisWeek  = users.filter((u) => u.created_at && new Date(u.created_at) >= weekStart).length;
  const newThisMonth = users.filter((u) => u.created_at && new Date(u.created_at) >= monthStart).length;
  const activeRecent = users.filter((u) => u.last_login && new Date(u.last_login) >= sevenDays).length;

  const growth: GrowthMetrics = {
    totalManagers:       users.length,
    newThisWeek,
    newThisMonth,
    activeLastSevenDays: activeRecent,
  };

  // ── Activation Funnel ────────────────────────────────────────────────

  // Latest active week
  const sortedWeeks = [...weeks].sort(
    (a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime()
  );
  const latestWeek = sortedWeeks[0];

  const everSubmittedSet = new Set(lineups.map((l) => l.user_id));
  const activeThisWeekSet = latestWeek
    ? new Set(lineups.filter((l) => String(l.week_id) === String(latestWeek.week_id)).map((l) => l.user_id))
    : new Set<string>();

  const funnel: FunnelMetrics = {
    registered:          users.length,
    everSubmittedLineup: everSubmittedSet.size,
    neverDrafted:        users.length - everSubmittedSet.size,
    activeThisWeek:      activeThisWeekSet.size,
    activationRate:      users.length > 0
      ? Math.round((everSubmittedSet.size / users.length) * 100)
      : 0,
  };

  // ── Weekly Engagement ────────────────────────────────────────────────

  const completedWeeks = sortedWeeks
    .filter((w) => String(w.scores_calculated).toUpperCase() === "TRUE")
    .slice(0, 10) // last 10 completed gameweeks
    .reverse();   // oldest first for chart

  const weeklyParticipation: WeekParticipation[] = completedWeeks.map((w) => {
    const count = new Set(
      lineups.filter((l) => String(l.week_id) === String(w.week_id)).map((l) => l.user_id)
    ).size;
    return {
      week_id:    w.week_id,
      label:      formatWeekLabel(w.start_date, w.end_date),
      managers:   count,
      start_date: w.start_date,
    };
  });

  const participationCounts = weeklyParticipation.map((w) => w.managers);
  const highestWeek   = participationCounts.length ? Math.max(...participationCounts) : 0;
  const averageWeekly = participationCounts.length
    ? Math.round(participationCounts.reduce((s, n) => s + n, 0) / participationCounts.length)
    : 0;

  // Retention: last two completed weeks
  let retentionRate = 0;
  let previousWeekManagers = 0;
  let returnedThisWeek = 0;

  if (completedWeeks.length >= 2) {
    const prevWeek = completedWeeks[completedWeeks.length - 2];
    const currWeek = completedWeeks[completedWeeks.length - 1];
    const prevSet  = new Set(lineups.filter((l) => String(l.week_id) === String(prevWeek.week_id)).map((l) => l.user_id));
    const currSet  = new Set(lineups.filter((l) => String(l.week_id) === String(currWeek.week_id)).map((l) => l.user_id));
    returnedThisWeek     = [...prevSet].filter((uid) => currSet.has(uid)).length;
    previousWeekManagers = prevSet.size;
    retentionRate        = prevSet.size > 0
      ? Math.round((returnedThisWeek / prevSet.size) * 100)
      : 0;
  }

  const engagement: EngagementMetrics = {
    weeklyParticipation,
    retentionRate,
    previousWeekManagers,
    returnedThisWeek,
    highestWeek,
    averageWeekly,
  };

  // ── Referral Performance ─────────────────────────────────────────────

  const totalCodes     = users.filter((u) => !!u.referral_code).length;
  const qualified      = referrals.filter((r) => r.status === "Qualified").length;
  const rewardsPending = rewards.filter((r) => r.status === "pending").length;
  const rewardsApproved = rewards.filter((r) => r.status === "approved").length;
  const paidRewards    = rewards.filter((r) => r.status === "paid");
  const totalLrd       = paidRewards.reduce((s, r) => s + Number(r.reward_value || 0), 0);

  const referralMetrics: ReferralMetrics = {
    totalCodes,
    totalReferrals:    referrals.length,
    qualified,
    conversionRate:    referrals.length > 0
      ? Math.round((qualified / referrals.length) * 100)
      : 0,
    rewardsPending,
    rewardsApproved,
    rewardsPaid:       paidRewards.length,
    totalLrdDisbursed: totalLrd,
  };

  // ── Achievement Engagement ───────────────────────────────────────────

  const uniqueEarners = new Set(achievements.map((a) => a.user_id)).size;
  const badgeGroups: Record<string, { name: string; count: number }> = {};
  for (const a of achievements) {
    if (!badgeGroups[a.badge_key]) badgeGroups[a.badge_key] = { name: a.badge_name, count: 0 };
    badgeGroups[a.badge_key].count++;
  }
  const topBadges: BadgeCount[] = Object.entries(badgeGroups)
    .map(([key, { name, count }]) => ({ key, name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  const achievementMetrics: AchievementMetrics = {
    totalEarned:   achievements.length,
    uniqueEarners,
    adoptionRate:  users.length > 0
      ? Math.round((uniqueEarners / users.length) * 100)
      : 0,
    usersNoBadges: users.length - uniqueEarners,
    topBadges,
  };

  // ── Notification Engagement ──────────────────────────────────────────

  const notifTypes = [...new Set(notifications.map((n) => n.type))].sort();
  const byType: NotificationTypeMetric[] = notifTypes.map((type) => {
    const forType = notifications.filter((n) => n.type === type);
    const read    = forType.filter((n) => n.status !== "unread").length;
    return {
      type,
      sent:     forType.length,
      read,
      readRate: forType.length > 0 ? Math.round((read / forType.length) * 100) : 0,
    };
  });

  const overallRead = notifications.filter((n) => n.status !== "unread").length;
  const notifMetrics: NotificationMetrics = {
    byType,
    overallSent:     notifications.length,
    overallRead,
    overallReadRate: notifications.length > 0
      ? Math.round((overallRead / notifications.length) * 100)
      : 0,
  };

  // ── Sponsor Summary ──────────────────────────────────────────────────

  const completedGwCount = weeks.filter(
    (w) => String(w.scores_calculated).toUpperCase() === "TRUE" &&
           String(w.prices_updated).toUpperCase()    === "TRUE"
  ).length;

  const psRow = platformSettings.find((r) => r.key === "PrizeMoneyAwarded");
  const prizeMoneyAwarded = psRow ? Number(psRow.value || 0) : 0;

  const sponsor: SponsorMetrics = {
    registeredManagers:       users.length,
    activeThisWeek:           activeThisWeekSet.size,
    completedGameweeks:       completedGwCount,
    totalFantasyTeamsCreated: lineups.length,  // one row = one lineup = one "team entry"
    prizeMoneyAwarded,
  };

  // ── Campaign Analytics ───────────────────────────────────────────────

  const sentCampaigns   = campaigns.filter((c) => c.status === "sent");
  const totalRecipients = sentCampaigns.reduce((s, c) => s + Number(c.recipient_count || 0), 0);
  const campaignsByAudience: Record<string, number> = {};
  for (const c of campaigns) {
    campaignsByAudience[c.audience_type] = (campaignsByAudience[c.audience_type] || 0) + 1;
  }

  const campaignAnalytics: CampaignAnalyticsMetrics = {
    totalCreated:    campaigns.length,
    totalSent:       sentCampaigns.length,
    totalRecipients,
    byAudience:      campaignsByAudience,
  };

  // ── Retention Analytics ──────────────────────────────────────────────

  const retConverted = retentionRecs.filter((r) => r.status === "converted").length;
  const retPending   = retentionRecs.filter((r) => r.status === "pending").length;
  const retDismissed = retentionRecs.filter((r) => r.status === "dismissed").length;

  const retentionAnalytics: RetentionAnalyticsMetrics = {
    totalRecommendations: retentionRecs.length,
    pending:              retPending,
    converted:            retConverted,
    dismissed:            retDismissed,
    conversionRate:       retentionRecs.length > 0
      ? Math.round((retConverted / retentionRecs.length) * 100)
      : 0,
  };

  return {
    analyticsVersion: "1.0",
    generatedAt:      now.toISOString(),
    growth,
    funnel,
    engagement,
    referrals:    referralMetrics,
    achievements: achievementMetrics,
    notifications: notifMetrics,
    sponsor,
    campaigns:   campaignAnalytics,
    retention:   retentionAnalytics,
  };
}
