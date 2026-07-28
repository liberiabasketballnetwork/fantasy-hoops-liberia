/**
 * platformStatsService.ts — ADMIN-015
 *
 * Aggregates public community statistics for GET /platform-stats.
 * No personal user data is ever returned.
 *
 * Data sources:
 *   Users            → registeredManagers (total row count)
 *   User_Lineups     → activeManagersThisWeek (unique submissions this week)
 *   Weekly_Gameweek  → completedGameweeks (scores_calculated AND prices_updated)
 *   PlatformSettings → prizeMoneyAwarded, currentWeeklyPrize, currentSeason
 */

import { getSheetData } from "./sheetsService";
import { getPlatformSettings } from "./platformSettingsService";

export interface PlatformStats {
  registeredManagers:     number;
  activeManagersThisWeek: number;
  completedGameweeks:     number;
  prizeMoneyAwarded:      number;
  currentWeeklyPrize:     number;
  currentSeason:          string;
}

export async function getPlatformStats(): Promise<PlatformStats> {
  // Run all reads in parallel — none depend on each other
  const [users, lineups, weeks, settings] = await Promise.allSettled([
    getSheetData("Users"),
    getSheetData("User_Lineups"),
    getSheetData("Weekly_Gameweek"),
    getPlatformSettings(),
  ]);

  // ── Registered Managers ─────────────────────────────────────────────────
  // All rows in the Users sheet = all registered accounts.
  const registeredManagers =
    users.status === "fulfilled" ? users.value.length : 0;

  // ── Active Managers This Week ───────────────────────────────────────────
  // Unique managers who submitted a lineup for the latest gameweek.
  let activeManagersThisWeek = 0;
  if (
    lineups.status === "fulfilled" &&
    weeks.status  === "fulfilled" &&
    weeks.value.length > 0
  ) {
    const allWeeks  = weeks.value;
    const allLineups = lineups.value;

    // Latest week by start_date descending
    const latestWeek = [...allWeeks].sort(
      (a, b) =>
        new Date(b.start_date).getTime() - new Date(a.start_date).getTime()
    )[0];

    // Count unique user_ids who submitted for this week
    const activeUsers = new Set(
      allLineups
        .filter((l) => String(l.week_id) === String(latestWeek.week_id))
        .map((l) => l.user_id)
    );
    activeManagersThisWeek = activeUsers.size;
  }

  // ── Completed Gameweeks ─────────────────────────────────────────────────
  // A week is complete when both scores_calculated AND prices_updated are TRUE.
  const completedGameweeks =
    weeks.status === "fulfilled"
      ? weeks.value.filter(
          (w) =>
            String(w.scores_calculated).toUpperCase() === "TRUE" &&
            String(w.prices_updated).toUpperCase()   === "TRUE"
        ).length
      : 0;

  // ── Business values from Platform Settings (ADMIN-014) ──────────────────
  const ps = settings.status === "fulfilled" ? settings.value : null;

  return {
    registeredManagers,
    activeManagersThisWeek,
    completedGameweeks,
    prizeMoneyAwarded:  ps?.prizeMoneyAwarded  ?? 0,
    currentWeeklyPrize: ps?.currentWeeklyPrize ?? 0,
    currentSeason:      ps?.currentSeason      ?? "2026",
  };
}
