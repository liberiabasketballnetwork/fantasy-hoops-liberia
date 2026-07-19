/**
 * Weekly Report Notification Producer — NOTIFY-005
 *
 * Generates one personalised weekly report notification per manager
 * after badge evaluation completes. The report summarises the manager's
 * full gameweek — score, rank, captain, best player, badges, grade.
 *
 * ADL-039: calls only notificationEngine.dispatchMany() — never writes
 *          to any sheet directly.
 * ADL-041: loads all sheets once, aggregates entirely in memory.
 * ADL-042: fire-and-forget — never blocks the admin workflow.
 *
 * Idempotency: REPORT:{user_id}:{week_id}
 * One report per user per week regardless of how many times badge
 * evaluation is re-run.
 */

import { getSetting, getSheetData } from "./sheetsService";
import {
  notificationEngine,
  NotificationEvent,
  buildIdempotencyKey,
} from "./notificationEventEngine";

// ─── Types ─────────────────────────────────────────────────────────────────────

type Grade  = "A+" | "A" | "B+" | "B" | "C" | "D";
type RankDir = "up" | "down" | "same" | "new";

interface PlayerStat {
  player_id: string;
  fantasy_points: number;
}

interface PriceChange {
  player_id:   string;
  player_name: string;
  change:      number;
}

interface WeeklyReport {
  user_id:       string;
  score:         number;
  rank:          number;
  totalManagers: number;
  rankDirection: RankDir;
  rankMovement:  number;
  grade:         Grade;
  captainName:   string;
  captainScore:  number;
  bestName:      string;
  bestScore:     number;
  worstName:     string;
  worstScore:    number;
  lineupValue:   number;
  badges:        string[];
  priceChanges:  PriceChange[];
  highlight:     string;
}

// ─── Grade ─────────────────────────────────────────────────────────────────────

function computeGrade(rank: number, total: number): Grade {
  if (total === 0) return "B";
  const pct = rank / total;
  if (pct <= 0.05) return "A+";
  if (pct <= 0.15) return "A";
  if (pct <= 0.30) return "B+";
  if (pct <= 0.50) return "B";
  if (pct <= 0.75) return "C";
  return "D";
}

// ─── Title builder ─────────────────────────────────────────────────────────────

function buildReportTitle(report: WeeklyReport, weekId: string): string {
  // Extract a short label — use the last segment of the weekId or a counter
  const label = `Week Report`;

  if (report.rank <= 3)                              return `🏆 ${label} — Outstanding!`;
  if (report.rank <= 10)                             return `⭐ ${label} — Strong Finish!`;
  if (report.rankDirection === "up" && report.rankMovement >= 3)
                                                      return `📈 ${label} — You're Climbing!`;
  if (report.rankDirection === "same" || report.rankDirection === "new")
                                                      return `📊 ${label}`;
  if (report.grade === "D" || report.grade === "C")  return `💪 ${label} — Bounce Back!`;
  return `📊 ${label}`;
}

// ─── Highlight generator ───────────────────────────────────────────────────────

function buildHighlight(report: WeeklyReport): string {
  // Priority 1: badge earned
  if (report.badges.length > 0) {
    const first = report.badges[0];
    return `You earned the ${first.replace(/_/g, " ")} badge this week! 🏅`;
  }

  // Priority 2: top 3
  if (report.rank <= 3) {
    return `Amazing — you finished in the top 3 this week! 🏆`;
  }

  // Priority 3: rank improved
  if (report.rankDirection === "up" && report.rankMovement >= 1) {
    return `You climbed ${report.rankMovement} place${report.rankMovement !== 1 ? "s" : ""} this week. Keep it up! 📈`;
  }

  // Priority 4: captain scored 20+
  if (report.captainScore >= 20) {
    return `Your captain ${report.captainName} delivered with ${report.captainScore.toFixed(1)} fantasy points! 🔥`;
  }

  // Priority 5: lineup gained value (net positive price changes)
  const netValueChange = report.priceChanges.reduce((sum, c) => sum + c.change, 0);
  if (netValueChange > 0) {
    return `Your squad gained ${netValueChange} credit${netValueChange !== 1 ? "s" : ""} in value this week. 💰`;
  }

  // Priority 6: three or more players scored 20+ (approximated: total score >= 100)
  if (report.score >= 100) {
    return `Strong showing across the board — ${report.score.toFixed(1)} total fantasy points this week.`;
  }

  // Default
  return `Another week completed. Get ready for the next draft.`;
}

// ─── Message builder ───────────────────────────────────────────────────────────

function buildReportMessage(report: WeeklyReport): string {
  const lines: string[] = [];

  lines.push(`Grade: ${report.grade}`);
  lines.push(`${report.score.toFixed(1)} fantasy points`);
  lines.push(`Finished #${report.rank} of ${report.totalManagers}`);

  if (report.rankDirection === "up") {
    lines.push(`↑ Up ${report.rankMovement} place${report.rankMovement !== 1 ? "s" : ""}`);
  } else if (report.rankDirection === "down") {
    lines.push(`↓ Down ${report.rankMovement} place${report.rankMovement !== 1 ? "s" : ""}`);
  } else if (report.rankDirection === "same") {
    lines.push(`→ Same rank as last week`);
  }

  if (report.captainName) {
    lines.push(`Captain ${report.captainName}: ${report.captainScore.toFixed(1)} FP`);
  }

  if (report.bestName) {
    lines.push(`Best: ${report.bestName} — ${report.bestScore.toFixed(1)} FP`);
  }

  if (report.badges.length > 0) {
    lines.push(`🏅 ${report.badges.length} Badge${report.badges.length !== 1 ? "s" : ""} Earned`);
  }

  lines.push(report.highlight);
  return lines.join("\n");
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

// ─── Main producer ─────────────────────────────────────────────────────────────

export async function dispatchWeeklyReportNotifications(
  week_id: string,
  workflow_id: string
): Promise<void> {
  if (!(await notificationsEnabled())) return;

  // ── Load all data in one parallel batch ─────────────────────────────────────
  const [
    allLeaderboard,
    allUserLineups,
    allLineupPlayers,
    allPlayers,
    allPlayerStats,
    allPriceHistory,
    allAchievements,
  ] = await Promise.all([
    getSheetData("Leaderboard"),
    getSheetData("User_Lineups"),
    getSheetData("Lineup_Players"),
    getSheetData("Players"),
    getSheetData("Player_Stats"),
    getSheetData("Price_History"),
    getSheetData("Achievements"),
  ]);

  // Scope to this week
  const weekEntries = allLeaderboard.filter(
    (r) => String(r.week_id) === String(week_id)
  );
  if (weekEntries.length === 0) return; // no leaderboard yet

  const totalManagers = weekEntries.length;

  // Previous week's leaderboard (for rank movement) — ordered by start_date
  // Use the most recent week that isn't the current one
  const otherWeekIds = [...new Set(
    allLeaderboard
      .filter((r) => String(r.week_id) !== String(week_id))
      .map((r) => r.week_id)
  )];
  // Pick the last prior week (we don't have start_date on Leaderboard rows
  // but we can use the most recently appearing week_id by order of entry)
  const prevWeekId = otherWeekIds[otherWeekIds.length - 1] ?? null;
  const prevWeekEntries = prevWeekId
    ? allLeaderboard.filter((r) => String(r.week_id) === String(prevWeekId))
    : [];
  const prevRankByUser = new Map(
    prevWeekEntries.map((r) => [r.user_id, Number(r.rank)])
  );

  // This week's lineups
  const weekLineups = allUserLineups.filter(
    (l) => String(l.week_id) === String(week_id)
  );
  const lineupByUser = new Map(weekLineups.map((l) => [l.user_id, l]));

  // Price changes this week: player_id → net price delta
  const priceChangeByPlayer = new Map<string, number>();
  for (const ph of allPriceHistory) {
    if (String(ph.week_id) === String(week_id)) {
      priceChangeByPlayer.set(
        ph.player_id,
        Number(ph.new_price) - Number(ph.old_price)
      );
    }
  }

  // Player name lookup
  const playerNameById = new Map(allPlayers.map((p) => [p.player_id, p.full_name]));
  const playerPriceById = new Map(
    allPlayers.map((p) => [p.player_id, Number(p.fantasy_price ?? 0)])
  );

  // Player stats this week — aggregate by player_id (sum fantasy_points across games)
  const weekStatsByPlayer = new Map<string, number>();
  for (const stat of allPlayerStats) {
    const fp = Number(stat.fantasy_points ?? 0);
    if (fp === 0) continue;
    weekStatsByPlayer.set(
      stat.player_id,
      (weekStatsByPlayer.get(stat.player_id) ?? 0) + fp
    );
  }

  // Badges earned this week by user
  const badgesByUser = new Map<string, string[]>();
  for (const ach of allAchievements) {
    if (String(ach.week_id) === String(week_id)) {
      if (!badgesByUser.has(ach.user_id)) badgesByUser.set(ach.user_id, []);
      badgesByUser.get(ach.user_id)!.push(ach.badge_name);
    }
  }

  // ── Build one notification per user ─────────────────────────────────────────
  const events: NotificationEvent[] = [];

  for (const entry of weekEntries) {
    const user_id = entry.user_id;
    const rank    = Number(entry.rank);
    const score   = Number(entry.score);

    // Rank movement
    const prevRank = prevRankByUser.get(user_id) ?? null;
    let rankDirection: RankDir = "new";
    let rankMovement = 0;
    if (prevRank !== null) {
      if (rank < prevRank)        { rankDirection = "up";   rankMovement = prevRank - rank; }
      else if (rank > prevRank)   { rankDirection = "down"; rankMovement = rank - prevRank; }
      else                        { rankDirection = "same"; }
    }

    // Lineup players
    const lineup = lineupByUser.get(user_id);
    const lineupPlayerIds: string[] = lineup
      ? allLineupPlayers
          .filter((lp) => String(lp.lineup_id) === String(lineup.lineup_id))
          .map((lp) => lp.player_id)
      : [];

    // Per-player stats for this lineup
    const lineupStats: PlayerStat[] = lineupPlayerIds.map((pid) => ({
      player_id:     pid,
      fantasy_points: weekStatsByPlayer.get(pid) ?? 0,
    }));

    // Best and worst
    const sorted = [...lineupStats].sort((a, b) => b.fantasy_points - a.fantasy_points);
    const best  = sorted[0] ?? null;
    const worst = sorted[sorted.length - 1] ?? null;

    // Captain
    const captainId    = lineup?.captain_player_id ?? null;
    const captainScore = captainId ? (weekStatsByPlayer.get(captainId) ?? 0) : 0;
    const captainName  = captainId ? (playerNameById.get(captainId) ?? "Captain") : "";

    // Lineup value
    const lineupValue = lineupPlayerIds.reduce(
      (sum, pid) => sum + (playerPriceById.get(pid) ?? 0),
      0
    );

    // Price changes
    const priceChanges: PriceChange[] = lineupPlayerIds
      .filter((pid) => (priceChangeByPlayer.get(pid) ?? 0) !== 0)
      .map((pid) => ({
        player_id:   pid,
        player_name: playerNameById.get(pid) ?? "Unknown",
        change:      priceChangeByPlayer.get(pid)!,
      }));

    // Badges
    const badges = badgesByUser.get(user_id) ?? [];

    // Grade
    const grade = computeGrade(rank, totalManagers);

    // Assemble report
    const report: WeeklyReport = {
      user_id,
      score,
      rank,
      totalManagers,
      rankDirection,
      rankMovement,
      grade,
      captainName,
      captainScore,
      bestName:    best ? (playerNameById.get(best.player_id) ?? "Unknown") : "",
      bestScore:   best?.fantasy_points ?? 0,
      worstName:   worst ? (playerNameById.get(worst.player_id) ?? "Unknown") : "",
      worstScore:  worst?.fantasy_points ?? 0,
      lineupValue,
      badges,
      priceChanges,
      highlight: "", // populated below
    };
    report.highlight = buildHighlight(report);

    const idempotencyKey = buildIdempotencyKey("REPORT", user_id, "", week_id);

    events.push({
      idempotencyKey,
      user_id,
      type:     "REPORT",
      title:    buildReportTitle(report, week_id),
      message:  buildReportMessage(report),
      link:     `/reports/${week_id}`,
      priority: "normal",
      metadata: {
        event:          "WEEKLY_REPORT",
        week_id,
        workflow_id,
        correlation_id: week_id,
        score,
        grade,
        rank,
        rank_direction: rankDirection,
        rank_movement:  rankMovement,
        total_managers: totalManagers,
        captain:        captainName,
        captain_score:  captainScore,
        best_player:    report.bestName,
        best_score:     report.bestScore,
        worst_player:   report.worstName,
        worst_score:    report.worstScore,
        badges,
        price_changes:  priceChanges,
        lineup_value:   lineupValue,
        highlight:      report.highlight,
        source_module:  "weeklyReportNotificationProducer",
        version:        "1",
      },
    });
  }

  if (events.length === 0) return;

  try {
    const r = await notificationEngine.dispatchMany(events);
    console.log(
      `[WeeklyReportProducer] Dispatched ${r.dispatched} report(s), ` +
      `skipped ${r.skipped}, errors: ${r.errors.length}.`
    );
    if (r.errors.length > 0) {
      r.errors.forEach((e) => console.error(`[WeeklyReportProducer] ${e}`));
    }
  } catch (err: any) {
    console.error(`[WeeklyReportProducer] Dispatch failed: ${err?.message || err}`);
  }
}
