/**
 * League Notification Producer — NOTIFY-006
 *
 * Two independent entry points:
 *
 * 1. dispatchLeagueMembershipNotification() — immediate, fires on join
 *    Generates LEAGUE_MEMBER_JOINED (+ LEAGUE_CAPACITY_REACHED if full)
 *    Recipients: league owner only
 *
 * 2. dispatchLeagueWeeklyNotifications() — weekly, fires after score calc
 *    Generates LEAGUE_CHAMPION, LEAGUE_RANK_CHANGE, LEAGUE_FIRST_PLACE_LOST
 *    Recipients: per-manager individually
 *
 * ADL-039: calls only notificationEngine.dispatchMany() — never writes to sheets.
 * ADL-041: loads all sheets once per invocation, aggregates in memory.
 * ADL-042: fire-and-forget — never blocks any HTTP response.
 */

import { getSetting, getSheetData } from "./sheetsService";
import {
  notificationEngine,
  NotificationEvent,
  buildIdempotencyKey,
} from "./notificationEventEngine";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface LeagueRow {
  league_id:       string;
  league_name:     string;
  owner_user_id:   string;
  max_members:     number | string;
  status:          string;
}

interface LeagueStanding {
  user_id:      string;
  score:        number;
  inLeagueRank: number;
  prevRank:     number | null; // null = first week in this league
}

// ─── Feature flag ──────────────────────────────────────────────────────────────

async function notificationsEnabled(): Promise<boolean> {
  try {
    const flag = await getSetting("notifications_enabled", "true");
    return flag.toLowerCase() === "true";
  } catch {
    return true;
  }
}

// ─── Title and message builders ────────────────────────────────────────────────

function titleForChampion(leagueName: string): string {
  return `🏆 Champion of ${leagueName}!`;
}

function messageForChampion(leagueName: string, memberCount: number): string {
  return `You finished first in ${leagueName} this week.\nCongratulations! 🎉 (${memberCount} managers competed.)`;
}

function titleForRankChange(currentRank: number, prevRank: number): string {
  return prevRank > currentRank
    ? `📈 You moved up to #${currentRank}!`
    : `📉 You dropped to #${currentRank}.`;
}

function messageForRankChange(leagueName: string, prevRank: number, currentRank: number): string {
  const dir = prevRank > currentRank ? "climbed" : "dropped";
  return `You ${dir} from #${prevRank} to #${currentRank} in ${leagueName}.`;
}

function titleForFirstPlaceLost(): string {
  return `📉 You lost first place.`;
}

function messageForFirstPlaceLost(leagueName: string, currentRank: number): string {
  return `Another manager overtook you in ${leagueName} this week.\nYou're now #${currentRank}.`;
}

function titleForJoin(memberName: string): string {
  return `👋 ${memberName} joined your league.`;
}

function messageForJoin(memberName: string, leagueName: string, memberCount: number, maxMembers: number): string {
  return `${memberName} joined ${leagueName}.\nYou now have ${memberCount} of ${maxMembers} members.`;
}

function titleForCapacity(leagueName: string): string {
  return `🔒 ${leagueName} is now full!`;
}

function messageForCapacity(leagueName: string, maxMembers: number): string {
  return `${leagueName} has reached its maximum of ${maxMembers} members.\nYour league is ready to compete!`;
}

// ─── ENTRY POINT 1: Membership ────────────────────────────────────────────────

/**
 * Called immediately after joinLeague() succeeds.
 * Notifies the league owner of the new member.
 * Optionally notifies the owner if capacity is now reached.
 *
 * @param league        The league object returned by joinLeague()
 * @param newUserId     The user_id of the manager who just joined
 * @param newUserName   The display name of the joining manager
 * @param memberCount   Total members AFTER the join (including the new member)
 */
export async function dispatchLeagueMembershipNotification(
  league: LeagueRow,
  newUserId: string,
  newUserName: string,
  memberCount: number
): Promise<void> {
  if (!(await notificationsEnabled())) return;

  // Do not notify if owner is joining their own league
  if (league.owner_user_id === newUserId) return;

  const maxMembers = Number(league.max_members || 10);
  const events: NotificationEvent[] = [];

  // LEAGUE_MEMBER_JOINED → owner
  events.push({
    idempotencyKey: buildIdempotencyKey("LEAGUE", newUserId, `JOIN:${league.league_id}`),
    user_id:  league.owner_user_id,
    type:     "LEAGUE",
    title:    titleForJoin(newUserName),
    message:  messageForJoin(newUserName, league.league_name, memberCount, maxMembers),
    link:     `/leagues/${league.league_id}`,
    priority: "normal",
    metadata: {
      event:            "LEAGUE_MEMBER_JOINED",
      league_id:        league.league_id,
      league_name:      league.league_name,
      joined_user_id:   newUserId,
      joined_user_name: newUserName,
      member_count:     memberCount,
      max_members:      maxMembers,
      source_module:    "leagueNotificationProducer",
      version:          "1",
    },
  });

  // LEAGUE_CAPACITY_REACHED → owner (only when this join fills the last slot)
  if (memberCount >= maxMembers) {
    events.push({
      idempotencyKey: buildIdempotencyKey("LEAGUE", league.owner_user_id, `FULL:${league.league_id}`),
      user_id:  league.owner_user_id,
      type:     "LEAGUE",
      title:    titleForCapacity(league.league_name),
      message:  messageForCapacity(league.league_name, maxMembers),
      link:     `/leagues/${league.league_id}`,
      priority: "normal",
      metadata: {
        event:        "LEAGUE_CAPACITY_REACHED",
        league_id:    league.league_id,
        league_name:  league.league_name,
        member_count: memberCount,
        max_members:  maxMembers,
        source_module: "leagueNotificationProducer",
        version:      "1",
      },
    });
  }

  if (events.length === 0) return;

  try {
    const r = await notificationEngine.dispatchMany(events);
    console.log(`[LeagueProducer:membership] Dispatched ${r.dispatched}, skipped ${r.skipped}.`);
  } catch (err: any) {
    console.error(`[LeagueProducer:membership] Dispatch failed: ${err?.message || err}`);
  }
}

// ─── ENTRY POINT 2: Weekly competition events ─────────────────────────────────

/**
 * Called after calculateWeeklyScores() completes.
 * Generates champion, rank-change, and first-place-lost notifications
 * for every league based on the week's standings.
 */
export async function dispatchLeagueWeeklyNotifications(
  week_id: string,
  workflow_id: string
): Promise<void> {
  if (!(await notificationsEnabled())) return;

  // ── Load all data in one parallel batch ─────────────────────────────────────
  const [allLeaderboard, allLeagueMembers, allLeagues] = await Promise.all([
    getSheetData("Leaderboard"),
    getSheetData("League_Members"),
    getSheetData("Leagues"),
  ]);

  // Current week's Leaderboard entries
  const currentEntries = allLeaderboard.filter(
    (r) => String(r.week_id) === String(week_id)
  );
  if (currentEntries.length === 0) return; // no scores yet

  // Derive previous week ID (most recently written other week in Leaderboard)
  const otherWeekIds = [
    ...new Set(
      allLeaderboard
        .filter((r) => String(r.week_id) !== String(week_id))
        .map((r) => r.week_id)
    ),
  ];
  const prevWeekId = otherWeekIds[otherWeekIds.length - 1] ?? null;
  const prevEntries = prevWeekId
    ? allLeaderboard.filter((r) => String(r.week_id) === String(prevWeekId))
    : [];

  // Score lookup maps
  const currentScoreByUser = new Map(
    currentEntries.map((r) => [r.user_id, Number(r.score)])
  );
  const prevScoreByUser = new Map(
    prevEntries.map((r) => [r.user_id, Number(r.score)])
  );

  const events: NotificationEvent[] = [];

  // ── Process each active league ───────────────────────────────────────────────
  for (const league of allLeagues) {
    if (String(league.status) !== "active") continue;

    const memberUserIds = allLeagueMembers
      .filter((m) => m.league_id === league.league_id)
      .map((m) => m.user_id);

    // Minimum 2 members for meaningful competition
    if (memberUserIds.length < 2) continue;

    // Current in-league standings (members who submitted this week)
    const currentStandings = memberUserIds
      .filter((uid) => currentScoreByUser.has(uid))
      .map((uid) => ({ user_id: uid, score: currentScoreByUser.get(uid)! }))
      .sort((a, b) => b.score - a.score)
      .map((entry, idx) => ({ ...entry, inLeagueRank: idx + 1 }));

    if (currentStandings.length === 0) continue;

    // Previous in-league standings (for rank movement)
    const prevStandings = memberUserIds
      .filter((uid) => prevScoreByUser.has(uid))
      .map((uid) => ({ user_id: uid, score: prevScoreByUser.get(uid)! }))
      .sort((a, b) => b.score - a.score)
      .map((entry, idx) => ({ ...entry, inLeagueRank: idx + 1 }));

    const prevRankByUser = new Map(
      prevStandings.map((s) => [s.user_id, s.inLeagueRank])
    );

    const prevChampion = prevStandings.length > 0 ? prevStandings[0].user_id : null;
    const memberCount  = currentStandings.length;

    for (const standing of currentStandings) {
      const { user_id, inLeagueRank } = standing;
      const prevRank = prevRankByUser.get(user_id) ?? null;

      // LEAGUE_CHAMPION
      if (inLeagueRank === 1) {
        events.push({
          idempotencyKey: buildIdempotencyKey(
            "LEAGUE", user_id, `CHAMPION:${league.league_id}`, week_id
          ),
          user_id,
          type:     "LEAGUE",
          title:    titleForChampion(league.league_name),
          message:  messageForChampion(league.league_name, memberCount),
          link:     `/leagues/${league.league_id}`,
          priority: "high",
          metadata: {
            event:         "LEAGUE_CHAMPION",
            league_id:     league.league_id,
            league_name:   league.league_name,
            rank:          inLeagueRank,
            member_count:  memberCount,
            week_id,
            workflow_id,
            correlation_id: week_id,
            source_module:  "leagueNotificationProducer",
            version:        "1",
          },
        });
      }

      // LEAGUE_FIRST_PLACE_LOST (was #1 last week, no longer #1)
      if (prevRank === 1 && inLeagueRank !== 1 && prevChampion === user_id) {
        events.push({
          idempotencyKey: buildIdempotencyKey(
            "LEAGUE", user_id, `FIRST_LOST:${league.league_id}`, week_id
          ),
          user_id,
          type:     "LEAGUE",
          title:    titleForFirstPlaceLost(),
          message:  messageForFirstPlaceLost(league.league_name, inLeagueRank),
          link:     `/leagues/${league.league_id}`,
          priority: "high",
          metadata: {
            event:          "LEAGUE_FIRST_PLACE_LOST",
            league_id:      league.league_id,
            league_name:    league.league_name,
            previous_rank:  1,
            current_rank:   inLeagueRank,
            movement:       inLeagueRank - 1,
            week_id,
            workflow_id,
            correlation_id: week_id,
            source_module:  "leagueNotificationProducer",
            version:        "1",
          },
        });
      }

      // LEAGUE_RANK_CHANGE (only when rank actually changed and it's not the champion)
      if (prevRank !== null && prevRank !== inLeagueRank && inLeagueRank !== 1) {
        events.push({
          idempotencyKey: buildIdempotencyKey(
            "LEAGUE", user_id, `RANK_CHANGE:${league.league_id}`, week_id
          ),
          user_id,
          type:     "LEAGUE",
          title:    titleForRankChange(inLeagueRank, prevRank),
          message:  messageForRankChange(league.league_name, prevRank, inLeagueRank),
          link:     `/leagues/${league.league_id}`,
          priority: "normal",
          metadata: {
            event:          "LEAGUE_RANK_CHANGE",
            league_id:      league.league_id,
            league_name:    league.league_name,
            previous_rank:  prevRank,
            current_rank:   inLeagueRank,
            movement:       Math.abs(prevRank - inLeagueRank),
            rank_direction: prevRank > inLeagueRank ? "up" : "down",
            week_id,
            workflow_id,
            correlation_id: week_id,
            source_module:  "leagueNotificationProducer",
            version:        "1",
          },
        });
      }
    }
  }

  if (events.length === 0) return;

  try {
    const r = await notificationEngine.dispatchMany(events);
    console.log(
      `[LeagueProducer:weekly] Dispatched ${r.dispatched}, skipped ${r.skipped}, errors: ${r.errors.length}.`
    );
    if (r.errors.length > 0) {
      r.errors.forEach((e) => console.error(`[LeagueProducer:weekly] ${e}`));
    }
  } catch (err: any) {
    console.error(`[LeagueProducer:weekly] Dispatch failed: ${err?.message || err}`);
  }
}
