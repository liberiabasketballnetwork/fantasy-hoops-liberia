/**
 * Fantasy Report Service — CONTENT-001
 *
 * Generates structured weekly report data from existing game data.
 * Designed for reuse by the app, admin tools, and future integrations.
 *
 * All analytics are delegated to playerAnalytics.ts — no business logic
 * is duplicated here. This service only orchestrates reads and applies
 * report-specific selection rules (e.g. team-of-the-week, market summary).
 */

import { getSheetData } from "./sheetsService";
import {
  buildPriceMovementMap,
  buildPlayerIntelligenceMap,
  enrichPlayers,
  EnrichedPlayer,
} from "../utils/playerAnalytics";

// ─── Report shape ──────────────────────────────────────────────────────────

export interface PlayerOfWeek {
  player_id: string;
  player_name: string;
  team_id: string;
  fantasy_points: number;
  current_price: number;
}

export interface PriceMover {
  player_id: string;
  player_name: string;
  old_price: number;
  new_price: number;
  change: number;
}

export interface HiddenGemReport {
  player_id: string;
  player_name: string;
  team_id: string;
  fantasy_average: number;
  price: number;
  value_per_credit: number;
}

export interface HottestFormReport {
  player_id: string;
  player_name: string;
  last_5_average: number;
  form: string;
}

export interface BestValueReport {
  player_id: string;
  player_name: string;
  value_per_credit: number;
  price: number;
  average_points: number;
}

export interface TeamOfWeekEntry {
  player_id: string;
  player_name: string;
  team_id: string;
  fantasy_points: number;
}

export interface TeamOfWeek {
  players: TeamOfWeekEntry[];
  total_fantasy_points: number;
}

export interface MarketSummary {
  increased: number;
  decreased: number;
  unchanged: number;
  average_change: number;
}

export interface WeeklyReport {
  week_id: string;
  generated_at: string;
  player_of_week: PlayerOfWeek | null;
  biggest_riser: PriceMover | null;
  biggest_faller: PriceMover | null;
  hidden_gem: HiddenGemReport | null;
  hottest_form: HottestFormReport | null;
  best_value: BestValueReport | null;
  fantasy_team_of_week: TeamOfWeek;
  market_summary: MarketSummary;
}

// ─── Main function ─────────────────────────────────────────────────────────

export async function generateWeeklyReport(week_id: string): Promise<WeeklyReport> {
  // Three parallel reads — same pattern as /market and /players.
  const [allPlayers, allStats, priceHistory] = await Promise.all([
    getSheetData("Players"),
    getSheetData("Player_Stats"),
    getSheetData("Price_History"),
  ]);

  // ── Enrichment ────────────────────────────────────────────────────────────
  // Active players only for most sections; we'll use allPlayers for
  // team-of-week (past performances shouldn't be filtered out).
  const activePlayers = allPlayers.filter(
    (p) => String(p.status).toLowerCase() === "active"
  );

  const movementMap = buildPriceMovementMap(priceHistory);
  const intelligenceMap = buildPlayerIntelligenceMap(allStats);
  const enriched = enrichPlayers(activePlayers, movementMap, intelligenceMap);

  // We also enrich ALL players for team-of-week so recently-deactivated
  // players who played in the week still appear.
  const enrichedAll = enrichPlayers(allPlayers, movementMap, intelligenceMap);

  // ── Scoped stats for the specific week ─────────────────────────────────────
  // Player_Stats rows for this week only — used for player-of-week and TOTW.
  const weekStatsByPlayer = new Map<string, number>();
  for (const stat of allStats) {
    if (!stat.game_id) continue;
    // We can't filter by date without loading Games, so we instead
    // look at Price_History week_id to find game_ids for this week.
    // Better: filter allStats through games that fall in the week.
    // We'll use a simpler approach — check if there's a gameweek with
    // this week_id and cross-reference via the games sheet.
    weekStatsByPlayer.set(
      stat.player_id,
      (weekStatsByPlayer.get(stat.player_id) || 0) + Number(stat.fantasy_points || 0)
    );
  }

  // Load the specific week and its games to correctly scope weekly stats.
  const [allWeeks, allGames] = await Promise.all([
    getSheetData("Weekly_Gameweek"),
    getSheetData("Games"),
  ]);

  const week = allWeeks.find((w) => String(w.week_id) === String(week_id));
  const weekStartDate = week ? new Date(week.start_date) : null;
  const weekEndDate = week ? new Date(week.end_date) : null;
  if (weekEndDate) weekEndDate.setHours(23, 59, 59, 999);

  // Game IDs for this week
  const weekGameIds = new Set(
    allGames
      .filter((g) => {
        if (!weekStartDate || !weekEndDate) return false;
        const d = new Date(g.game_date);
        return d >= weekStartDate && d <= weekEndDate;
      })
      .map((g) => g.game_id)
  );

  // Weekly fantasy points per player (scoped to this week's games)
  const weeklyPoints = new Map<string, number>();
  for (const stat of allStats) {
    if (!weekGameIds.has(stat.game_id)) continue;
    weeklyPoints.set(
      stat.player_id,
      (weeklyPoints.get(stat.player_id) || 0) + Number(stat.fantasy_points || 0)
    );
  }

  // ── 1. Player of the Week ─────────────────────────────────────────────────
  let playerOfWeek: PlayerOfWeek | null = null;
  if (weeklyPoints.size > 0) {
    const [topPlayerId, topPoints] = [...weeklyPoints.entries()].sort(
      (a, b) => b[1] - a[1]
    )[0];
    const topPlayer = allPlayers.find((p) => p.player_id === topPlayerId);
    if (topPlayer) {
      playerOfWeek = {
        player_id: topPlayerId,
        player_name: topPlayer.full_name,
        team_id: topPlayer.team_id,
        fantasy_points: Math.round(topPoints * 100) / 100,
        current_price: Number(topPlayer.fantasy_price || 0),
      };
    }
  }

  // ── 2 & 3. Biggest Riser / Faller ────────────────────────────────────────
  // Filter Price_History to this week only
  const weekPriceRows = priceHistory.filter(
    (r) => String(r.week_id) === String(week_id)
  );

  let biggestRiser: PriceMover | null = null;
  let biggestFaller: PriceMover | null = null;

  if (weekPriceRows.length > 0) {
    const riser = weekPriceRows
      .filter((r) => Number(r.new_price) > Number(r.old_price))
      .sort((a, b) => (Number(b.new_price) - Number(b.old_price)) - (Number(a.new_price) - Number(a.old_price)))[0];

    const faller = weekPriceRows
      .filter((r) => Number(r.new_price) < Number(r.old_price))
      .sort((a, b) => (Number(a.new_price) - Number(a.old_price)) - (Number(b.new_price) - Number(b.old_price)))[0];

    if (riser) {
      const p = allPlayers.find((pl) => pl.player_id === riser.player_id);
      biggestRiser = {
        player_id: riser.player_id,
        player_name: p?.full_name || "Unknown",
        old_price: Number(riser.old_price),
        new_price: Number(riser.new_price),
        change: Number(riser.new_price) - Number(riser.old_price),
      };
    }

    if (faller) {
      const p = allPlayers.find((pl) => pl.player_id === faller.player_id);
      biggestFaller = {
        player_id: faller.player_id,
        player_name: p?.full_name || "Unknown",
        old_price: Number(faller.old_price),
        new_price: Number(faller.new_price),
        change: Number(faller.new_price) - Number(faller.old_price),
      };
    }
  }

  // ── 4. Hidden Gem ─────────────────────────────────────────────────────────
  let hiddenGem: HiddenGemReport | null = null;
  const gems = enriched
    .filter(
      (p) =>
        p.games_played >= 3 &&
        p.current_price <= 10 &&
        p.season_average_fantasy_points >= 18
    )
    .sort((a, b) => b.value_per_credit - a.value_per_credit);

  if (gems.length > 0) {
    const g = gems[0];
    hiddenGem = {
      player_id: g.player_id,
      player_name: g.full_name,
      team_id: g.team_id,
      fantasy_average: g.season_average_fantasy_points,
      price: g.current_price,
      value_per_credit: g.value_per_credit,
    };
  }

  // ── 5. Hottest Form ──────────────────────────────────────────────────────
  let hottestForm: HottestFormReport | null = null;
  const hotPlayers = enriched
    .filter((p) => p.last_5_fantasy_scores.length > 0)
    .sort((a, b) => b.last_5_average - a.last_5_average);

  if (hotPlayers.length > 0) {
    const h = hotPlayers[0];
    hottestForm = {
      player_id: h.player_id,
      player_name: h.full_name,
      last_5_average: h.last_5_average,
      form: h.form,
    };
  }

  // ── 6. Best Value Player ─────────────────────────────────────────────────
  let bestValue: BestValueReport | null = null;
  const valueRanked = enriched
    .filter((p) => p.games_played >= 3 && p.value_per_credit > 0)
    .sort((a, b) => b.value_per_credit - a.value_per_credit);

  if (valueRanked.length > 0) {
    const v = valueRanked[0];
    bestValue = {
      player_id: v.player_id,
      player_name: v.full_name,
      value_per_credit: v.value_per_credit,
      price: v.current_price,
      average_points: v.season_average_fantasy_points,
    };
  }

  // ── 7. Fantasy Team of the Week ──────────────────────────────────────────
  // Top 5 scorers in this week's games. No salary cap — this is an award.
  const totwEntries: TeamOfWeekEntry[] = [...weeklyPoints.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([pid, pts]) => {
      const p = allPlayers.find((pl) => pl.player_id === pid);
      return {
        player_id: pid,
        player_name: p?.full_name || "Unknown",
        team_id: p?.team_id || "",
        fantasy_points: Math.round(pts * 100) / 100,
      };
    });

  const fantasyTeamOfWeek: TeamOfWeek = {
    players: totwEntries,
    total_fantasy_points:
      Math.round(totwEntries.reduce((s, p) => s + p.fantasy_points, 0) * 100) / 100,
  };

  // ── 8. Market Summary ────────────────────────────────────────────────────
  const increased = weekPriceRows.filter(
    (r) => Number(r.new_price) > Number(r.old_price)
  ).length;
  const decreased = weekPriceRows.filter(
    (r) => Number(r.new_price) < Number(r.old_price)
  ).length;
  const unchanged = allPlayers.length - increased - decreased;
  const totalChange = weekPriceRows.reduce(
    (sum, r) => sum + (Number(r.new_price) - Number(r.old_price)),
    0
  );
  const averageChange =
    weekPriceRows.length > 0
      ? Math.round((totalChange / allPlayers.length) * 100) / 100
      : 0;

  const marketSummary: MarketSummary = {
    increased,
    decreased,
    unchanged: Math.max(0, unchanged),
    average_change: averageChange,
  };

  return {
    week_id,
    generated_at: new Date().toISOString(),
    player_of_week: playerOfWeek,
    biggest_riser: biggestRiser,
    biggest_faller: biggestFaller,
    hidden_gem: hiddenGem,
    hottest_form: hottestForm,
    best_value: bestValue,
    fantasy_team_of_week: fantasyTeamOfWeek,
    market_summary: marketSummary,
  };
}
