/**
 * Watchlist Service — ENGAGEMENT-002
 *
 * Personal player watchlist with dynamic insight generation.
 * All analytics reused from playerAnalytics.ts — no duplication.
 * Insights are generated in memory on every request; they are not persisted.
 */

import { v4 as uuidv4 } from "uuid";
import { getSheetData, appendRow, deleteRow, getSetting } from "./sheetsService";
import {
  buildPriceMovementMap,
  buildPlayerIntelligenceMap,
  enrichPlayers,
  EnrichedPlayer,
} from "../utils/playerAnalytics";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface WatchlistInsight {
  type:
    | "PRICE_UP" | "PRICE_DOWN"
    | "HOT_FORM" | "GOOD_FORM" | "COLD_FORM"
    | "VALUE_PLAYER" | "HIGH_USAGE" | "TRENDING_PLAYER";
  title: string;
  message: string;
}

export interface WatchedPlayer extends Record<string, any> {
  watchlist_id: string;
  watched_since: string;
  insights: WatchlistInsight[];
}

// ─── Feature flags ─────────────────────────────────────────────────────────────

async function getFlags() {
  const [enabled, maxFree, maxPremium] = await Promise.all([
    getSetting("watchlist_enabled", "true"),
    getSetting("max_free_watchlist", "5"),
    getSetting("max_premium_watchlist", "20"),
  ]);
  return {
    enabled: enabled.toLowerCase() === "true",
    maxFree: Number(maxFree),
    maxPremium: Number(maxPremium),
  };
}

export async function canWatchMorePlayers(
  user_id: string,
  isPremium = false
): Promise<{ allowed: boolean; reason?: string; limit: number }> {
  const flags = await getFlags();
  if (!flags.enabled) return { allowed: false, reason: "Watchlist feature is not currently available.", limit: 0 };

  const allWatchlists = await getSheetData("Watchlists");
  const currentCount = allWatchlists.filter((w) => w.user_id === user_id).length;
  const limit = isPremium ? flags.maxPremium : flags.maxFree;

  if (currentCount >= limit) {
    return {
      allowed: false,
      reason: `You have reached your watchlist limit of ${limit} players.`,
      limit,
    };
  }
  return { allowed: true, limit };
}

// ─── Insight generation ────────────────────────────────────────────────────────

function generateInsights(player: EnrichedPlayer): WatchlistInsight[] {
  const insights: WatchlistInsight[] = [];

  // TRENDING_PLAYER = HOT_FORM + PRICE_UP (checked first — superset of both)
  if (player.form === "hot" && player.price_change > 0) {
    insights.push({
      type: "TRENDING_PLAYER",
      title: "Trending Player",
      message: `HOT form and price rising — ${player.full_name} is in high demand.`,
    });
  } else {
    // HOT_FORM
    if (player.form === "hot") {
      insights.push({
        type: "HOT_FORM",
        title: "Hot Form",
        message: `Averaging ${player.last_5_average.toFixed(1)} FP over the last five games.`,
      });
    }
    // PRICE_UP
    if (player.price_change > 0) {
      insights.push({
        type: "PRICE_UP",
        title: "Price Increased",
        message: `Price rose by ${player.price_change} credit${player.price_change !== 1 ? "s" : ""} this week.`,
      });
    }
  }

  // GOOD_FORM
  if (player.form === "good") {
    insights.push({
      type: "GOOD_FORM",
      title: "Good Form",
      message: `Averaging ${player.last_5_average.toFixed(1)} FP over the last five games.`,
    });
  }

  // COLD_FORM
  if (player.form === "cold") {
    insights.push({
      type: "COLD_FORM",
      title: "Cold Form",
      message: `Scoring only ${player.last_5_average.toFixed(1)} FP on average recently — form is down.`,
    });
  }

  // PRICE_DOWN
  if (player.price_change < 0) {
    insights.push({
      type: "PRICE_DOWN",
      title: "Price Decreased",
      message: `Price fell by ${Math.abs(player.price_change)} credit${Math.abs(player.price_change) !== 1 ? "s" : ""} this week.`,
    });
  }

  // VALUE_PLAYER
  if (player.value_per_credit >= 2.5) {
    insights.push({
      type: "VALUE_PLAYER",
      title: "Excellent Value",
      message: `${player.value_per_credit.toFixed(2)} FP per credit — one of the league's best value players.`,
    });
  }

  // HIGH_USAGE
  if (player.games_played >= 8) {
    insights.push({
      type: "HIGH_USAGE",
      title: "High Availability",
      message: `Has played ${player.games_played} games this season — consistent availability.`,
    });
  }

  return insights;
}

// ─── Add to watchlist ─────────────────────────────────────────────────────────

export async function addToWatchlist(user_id: string, player_id: string): Promise<void> {
  const flags = await getFlags();
  if (!flags.enabled) throw new Error("Watchlist feature is not currently available.");

  const [allPlayers, allWatchlists] = await Promise.all([
    getSheetData("Players"),
    getSheetData("Watchlists"),
  ]);

  const player = allPlayers.find((p) => p.player_id === player_id);
  if (!player) throw new Error("Player not found.");
  if (String(player.status).toLowerCase() !== "active") throw new Error(`${player.full_name} is not an active player.`);

  const already = allWatchlists.find((w) => w.user_id === user_id && w.player_id === player_id);
  if (already) throw new Error(`${player.full_name} is already on your watchlist.`);

  const cap = await canWatchMorePlayers(user_id);
  if (!cap.allowed) throw new Error(cap.reason!);

  await appendRow("Watchlists", {
    watchlist_id: uuidv4(),
    user_id,
    player_id,
    created_at: new Date().toISOString(),
  });
}

// ─── Remove from watchlist ────────────────────────────────────────────────────

export async function removeFromWatchlist(user_id: string, player_id: string): Promise<void> {
  const allWatchlists = await getSheetData("Watchlists");
  const entry = allWatchlists.find((w) => w.user_id === user_id && w.player_id === player_id);
  if (!entry) throw new Error("Player is not on your watchlist.");
  await deleteRow("Watchlists", "watchlist_id", entry.watchlist_id);
}

// ─── Get watchlist ────────────────────────────────────────────────────────────

export async function getWatchlist(user_id: string): Promise<WatchedPlayer[]> {
  // Four parallel reads — one analytics load total
  const [allWatchlists, allPlayers, allStats, priceHistory] = await Promise.all([
    getSheetData("Watchlists"),
    getSheetData("Players"),
    getSheetData("Player_Stats"),
    getSheetData("Price_History"),
  ]);

  const userWatchlist = allWatchlists.filter((w) => w.user_id === user_id);
  if (userWatchlist.length === 0) return [];

  const watchedPlayerIds = new Set(userWatchlist.map((w) => w.player_id));

  // Enrich only active players (for analytics) but allow watching inactive for display
  const movementMap = buildPriceMovementMap(priceHistory);
  const intelligenceMap = buildPlayerIntelligenceMap(allStats);
  const enriched = enrichPlayers(allPlayers, movementMap, intelligenceMap);

  return userWatchlist
    .map((entry) => {
      const player = enriched.find((p) => p.player_id === entry.player_id);
      if (!player) return null;
      return {
        ...player,
        watchlist_id: entry.watchlist_id,
        watched_since: entry.created_at,
        insights: generateInsights(player),
      } as WatchedPlayer;
    })
    .filter(Boolean) as WatchedPlayer[];
}

// ─── Get watched player IDs (lightweight — for toggle UI) ─────────────────────

export async function getWatchedPlayerIds(user_id: string): Promise<string[]> {
  const rows = await getSheetData("Watchlists");
  return rows.filter((w) => w.user_id === user_id).map((w) => w.player_id);
}
