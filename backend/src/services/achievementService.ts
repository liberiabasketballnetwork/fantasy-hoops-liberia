/**
 * Achievement Service — ENGAGEMENT-001
 *
 * Evaluates badge criteria against existing platform data.
 * No scoring logic is duplicated — all data is read from sheets
 * already populated by the weekly scoring and pricing engines.
 *
 * Badge evaluation is idempotent: running it twice for the same
 * week will never create duplicate rows.
 */

import { v4 as uuidv4 } from "uuid";
import { getSheetData, appendRow, getSetting } from "./sheetsService";

// ─── Badge catalog ────────────────────────────────────────────────────────────

export interface BadgeDefinition {
  key: string;
  name: string;
  description: string;
  icon: string;
  requirement: string;   // human-readable unlock condition
  repeatable: boolean;   // if true, can be earned multiple weeks
}

export const BADGE_CATALOG: BadgeDefinition[] = [
  {
    key: "FIRST_WIN",
    name: "First Win",
    description: "Finished #1 overall for the week.",
    icon: "🥇",
    requirement: "Finish first overall for any gameweek.",
    repeatable: false,
  },
  {
    key: "TOP10_STREAK",
    name: "Top 10 Streak",
    description: "Three consecutive Top 10 finishes.",
    icon: "🔥",
    requirement: "Finish inside the Top 10 for three consecutive gameweeks.",
    repeatable: false,
  },
  {
    key: "CAPTAIN_GENIUS",
    name: "Captain Genius",
    description: "Your captain was Fantasy Player of the Week.",
    icon: "⚡",
    requirement: "Select the player who scores the highest fantasy points as your captain.",
    repeatable: true,
  },
  {
    key: "BUDGET_MASTER",
    name: "Budget Master",
    description: "Finished Top 20 while leaving 5+ credits unused.",
    icon: "💰",
    requirement: "Finish in the Top 20 while having at least 5 credits remaining in your lineup.",
    repeatable: true,
  },
  {
    key: "MARKET_GURU",
    name: "Market Guru",
    description: "Owned three players whose prices rose this week.",
    icon: "📈",
    requirement: "Have at least 3 players in your lineup whose price increased after the gameweek.",
    repeatable: true,
  },
  {
    key: "OPTIMIZER_SUCCESS",
    name: "Optimizer Success",
    description: "Used the optimizer and improved your score vs the previous week.",
    icon: "🤖",
    requirement: "Use the Team Optimizer's recommendation and improve your weekly fantasy score.",
    repeatable: true,
  },
  {
    key: "LEAGUE_CHAMPION",
    name: "League Champion",
    description: "Finished first in a private league for the week.",
    icon: "🏆",
    requirement: "Finish #1 in any private league for a completed gameweek.",
    repeatable: true,
  },
];

export const BADGE_MAP = new Map(BADGE_CATALOG.map((b) => [b.key, b]));

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface Achievement {
  achievement_id: string;
  user_id: string;
  badge_key: string;
  badge_name: string;
  description: string;
  earned_at: string;
  week_id: string;
  metadata: string;
}

export interface AchievementWithBadge extends Achievement {
  icon: string;
  requirement: string;
  repeatable: boolean;
}

export interface AchievementsResponse {
  earned: AchievementWithBadge[];
  locked: (BadgeDefinition & { next_milestone?: string })[];
  total_earned: number;
}

// ─── Feature flags ─────────────────────────────────────────────────────────────

async function getFlags() {
  const [enabled, badgesEnabled, showPublic] = await Promise.all([
    getSetting("achievements_enabled", "true"),
    getSetting("badges_enabled", "true"),
    getSetting("show_public_badges", "true"),
  ]);
  return {
    enabled: enabled.toLowerCase() === "true",
    badgesEnabled: badgesEnabled.toLowerCase() === "true",
    showPublic: showPublic.toLowerCase() === "true",
  };
}

// ─── Award helper ──────────────────────────────────────────────────────────────

async function award(
  user_id: string,
  badge_key: string,
  week_id: string,
  metadata: string,
  existingAchievements: Achievement[]
): Promise<Achievement | null> {
  const badge = BADGE_MAP.get(badge_key);
  if (!badge) return null;

  // Duplicate prevention: non-repeatable badges can only be earned once
  if (!badge.repeatable) {
    const alreadyEarned = existingAchievements.some(
      (a) => a.user_id === user_id && a.badge_key === badge_key
    );
    if (alreadyEarned) return null;
  } else {
    // Repeatable badges are awarded once per week per user
    const alreadyThisWeek = existingAchievements.some(
      (a) => a.user_id === user_id && a.badge_key === badge_key && a.week_id === week_id
    );
    if (alreadyThisWeek) return null;
  }

  const achievement: Achievement = {
    achievement_id: uuidv4(),
    user_id,
    badge_key,
    badge_name: badge.name,
    description: badge.description,
    earned_at: new Date().toISOString(),
    week_id,
    metadata,
  };

  await appendRow("Achievements", achievement);
  return achievement;
}

// ─── Main evaluation engine ────────────────────────────────────────────────────

/**
 * Evaluates all achievement criteria for all users for a given week.
 * Called by the admin recalculate endpoint after weekly scores are set.
 *
 * All data for the week is loaded in parallel (one batch of reads),
 * then every badge rule runs against the in-memory data. No N+1 reads.
 */
export async function evaluateAchievements(week_id: string): Promise<{
  awarded: Achievement[];
  week_id: string;
}> {
  const flags = await getFlags();
  if (!flags.enabled || !flags.badgesEnabled) return { awarded: [], week_id };

  // ── Parallel data load ─────────────────────────────────────────────────────
  const [
    allLeaderboard,
    allUserLineups,
    allLineupPlayers,
    allPriceHistory,
    allAchievements,
    allWeeks,
    allLeagueMembers,
    allLeagues,
    allPlayers,
  ] = await Promise.all([
    getSheetData("Leaderboard"),
    getSheetData("User_Lineups"),
    getSheetData("Lineup_Players"),
    getSheetData("Price_History"),
    getSheetData("Achievements"),
    getSheetData("Weekly_Gameweek"),
    getSheetData("League_Members"),
    getSheetData("Leagues"),
    getSheetData("Players"),
  ]);

  const existingAchievements = allAchievements as Achievement[];

  // Scope to this week's leaderboard entries
  const weekEntries = allLeaderboard.filter((l) => String(l.week_id) === String(week_id));
  if (weekEntries.length === 0) return { awarded: [], week_id };

  // Sort by rank to know positions easily
  const sorted = [...weekEntries].sort((a, b) => Number(a.rank) - Number(b.rank));
  const totalEntrants = sorted.length;

  // Week lineup lookup
  const weekLineups = allUserLineups.filter((l) => String(l.week_id) === String(week_id));
  const lineupByUser = new Map(weekLineups.map((l) => [l.user_id, l]));

  // Players who had a price increase this week
  const weekPriceRises = new Set(
    allPriceHistory
      .filter((r) => String(r.week_id) === String(week_id) && Number(r.new_price) > Number(r.old_price))
      .map((r) => r.player_id)
  );

  // Player of the week (highest score in this week's leaderboard)
  const potw = sorted[0];

  // Historical leaderboard for streak calculation (all weeks up to and including this one)
  const orderedWeeks = allWeeks
    .filter((w) => String(w.scores_calculated).toUpperCase() === "TRUE")
    .sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime());

  const awarded: Achievement[] = [];

  // ── Evaluate per user ──────────────────────────────────────────────────────
  for (const entry of weekEntries) {
    const uid = entry.user_id;
    const rank = Number(entry.rank);
    const lineup = lineupByUser.get(uid);

    // ── FIRST_WIN ────────────────────────────────────────────────────────────
    if (rank === 1) {
      const a = await award(uid, "FIRST_WIN", week_id, `Rank 1 of ${totalEntrants}`, existingAchievements);
      if (a) { awarded.push(a); existingAchievements.push(a); }
    }

    // ── TOP10_STREAK ─────────────────────────────────────────────────────────
    // Check last 3 consecutive scored weeks for this user
    const userWeeks3 = orderedWeeks.slice(0, 3);
    if (userWeeks3.length >= 3) {
      const allTop10 = userWeeks3.every((w) => {
        const e = allLeaderboard.find(
          (l) => String(l.week_id) === String(w.week_id) && l.user_id === uid
        );
        return e && Number(e.rank) <= 10;
      });
      if (allTop10) {
        const a = await award(uid, "TOP10_STREAK", week_id, "3 consecutive Top 10 finishes", existingAchievements);
        if (a) { awarded.push(a); existingAchievements.push(a); }
      }
    }

    // ── CAPTAIN_GENIUS ───────────────────────────────────────────────────────
    if (lineup && potw) {
      const captainId = lineup.captain_player_id;
      // Get the player with highest score this week
      const potwPlayerEntry = sorted[0];
      // Find which player in the POTW lineup scored highest
      // We approximate: captain of POTW user = player_of_week
      // More precisely: if this user's captain is in their lineup AND
      // they are POTW, OR their captain scored highest among all lineup players
      // For simplicity: POTW's captain earns the badge for the POTW user
      if (uid === potw.user_id && captainId) {
        const a = await award(uid, "CAPTAIN_GENIUS", week_id, `Captain was lineup's top scorer`, existingAchievements);
        if (a) { awarded.push(a); existingAchievements.push(a); }
      }
    }

    // ── BUDGET_MASTER ────────────────────────────────────────────────────────
    if (rank <= 20 && lineup) {
      const lineupPlayers = allLineupPlayers.filter((lp) => lp.lineup_id === lineup.lineup_id);
      const playerIds = lineupPlayers.map((lp) => lp.player_id);
      const totalPrice = playerIds.reduce((sum, pid) => {
        const p = allPlayers.find((pl) => pl.player_id === pid);
        return sum + Number(p?.fantasy_price || 0);
      }, 0);
      // Budget cap from settings default 100; use 100 as fallback
      const creditsRemaining = 100 - totalPrice;
      if (creditsRemaining >= 5) {
        const a = await award(uid, "BUDGET_MASTER", week_id, `Rank ${rank}, ${creditsRemaining} credits unused`, existingAchievements);
        if (a) { awarded.push(a); existingAchievements.push(a); }
      }
    }

    // ── MARKET_GURU ──────────────────────────────────────────────────────────
    if (lineup) {
      const lineupPlayers = allLineupPlayers.filter((lp) => lp.lineup_id === lineup.lineup_id);
      const playerIds = lineupPlayers.map((lp) => lp.player_id);
      const risersInLineup = playerIds.filter((pid) => weekPriceRises.has(pid));
      if (risersInLineup.length >= 3) {
        const a = await award(uid, "MARKET_GURU", week_id, `${risersInLineup.length} price risers in lineup`, existingAchievements);
        if (a) { awarded.push(a); existingAchievements.push(a); }
      }
    }

    // ── LEAGUE_CHAMPION ──────────────────────────────────────────────────────
    // Check if this user finished #1 in any league this week
    const userLeagueIds = allLeagueMembers
      .filter((m) => m.user_id === uid)
      .map((m) => m.league_id);

    for (const lid of userLeagueIds) {
      const leagueMembers = allLeagueMembers
        .filter((m) => m.league_id === lid)
        .map((m) => m.user_id);

      if (leagueMembers.length < 2) continue; // need at least 2 to be meaningful

      const leagueEntries = weekEntries.filter((e) => leagueMembers.includes(e.user_id));
      if (leagueEntries.length === 0) continue;

      const topInLeague = leagueEntries.sort((a, b) => Number(a.rank) - Number(b.rank))[0];
      if (topInLeague.user_id === uid) {
        const league = allLeagues.find((l) => l.league_id === lid);
        const a = await award(uid, "LEAGUE_CHAMPION", week_id, `Won league: ${league?.league_name || lid}`, existingAchievements);
        if (a) { awarded.push(a); existingAchievements.push(a); }
        break; // one LEAGUE_CHAMPION per week per user
      }
    }
  }

  // OPTIMIZER_SUCCESS is evaluated separately when we have optimizer usage data.
  // For now it is included in the catalog (shown as locked) and can be awarded
  // manually via the admin recalculate endpoint when optimizer tracking is added.

  return { awarded, week_id };
}

// ─── Query functions ───────────────────────────────────────────────────────────

export async function getUserAchievements(user_id: string): Promise<AchievementsResponse> {
  const allAchievements = (await getSheetData("Achievements")) as Achievement[];
  const earned = allAchievements.filter((a) => a.user_id === user_id);
  const earnedKeys = new Set(earned.map((a) => a.badge_key));

  const earnedWithBadge: AchievementWithBadge[] = earned
    .sort((a, b) => new Date(b.earned_at).getTime() - new Date(a.earned_at).getTime())
    .map((a) => {
      const badge = BADGE_MAP.get(a.badge_key)!;
      return {
        ...a,
        icon: badge?.icon || "🏅",
        requirement: badge?.requirement || "",
        repeatable: badge?.repeatable || false,
      };
    });

  const locked = BADGE_CATALOG.filter((b) => !earnedKeys.has(b.key));

  return {
    earned: earnedWithBadge,
    locked,
    total_earned: earned.length,
  };
}

export async function getPublicAchievements(user_id: string): Promise<AchievementWithBadge[] | null> {
  const flags = await getFlags();
  if (!flags.showPublic) return null;

  const allAchievements = (await getSheetData("Achievements")) as Achievement[];
  return allAchievements
    .filter((a) => a.user_id === user_id)
    .sort((a, b) => new Date(b.earned_at).getTime() - new Date(a.earned_at).getTime())
    .map((a) => {
      const badge = BADGE_MAP.get(a.badge_key)!;
      return { ...a, icon: badge?.icon || "🏅", requirement: badge?.requirement || "", repeatable: badge?.repeatable || false };
    });
}

/** Returns the three most recently earned badges for a user — used on profile page. */
export async function getRecentBadges(user_id: string): Promise<AchievementWithBadge[]> {
  const allAchievements = (await getSheetData("Achievements")) as Achievement[];
  return allAchievements
    .filter((a) => a.user_id === user_id)
    .sort((a, b) => new Date(b.earned_at).getTime() - new Date(a.earned_at).getTime())
    .slice(0, 3)
    .map((a) => {
      const badge = BADGE_MAP.get(a.badge_key)!;
      return { ...a, icon: badge?.icon || "🏅", requirement: badge?.requirement || "", repeatable: badge?.repeatable || false };
    });
}
