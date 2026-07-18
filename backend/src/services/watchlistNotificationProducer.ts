/**
 * Watchlist Notification Producer — NOTIFY-004
 *
 * Generates notifications for users watching players that experience
 * meaningful events during the weekly workflow.
 *
 * ADL-039: imports only the engine — never destinations or sheets directly.
 * ADL-041: player-first inversion — iterates changed players, looks up watchers.
 * ADL-042: fire-and-forget — failures never block score calculation or pricing.
 *
 * Core design principle: ONE notification per (user × player × week).
 * All events for that player are aggregated into a single rich notification.
 */

import { getSetting, getSheetData } from "./sheetsService";
import {
  notificationEngine,
  NotificationEvent,
  buildIdempotencyKey,
  NotificationPriority,
} from "./notificationEventEngine";
import { PriceAdjustmentResult } from "./priceAdjustmentService";
import { EnrichedPlayer } from "../utils/playerAnalytics";

// ─── Event types ──────────────────────────────────────────────────────────────

type WatchlistEventType =
  | "HOT_FORM"
  | "COLD_FORM"
  | "TRENDING"
  | "HIGH_SCORE"
  | "EXCEPTIONAL_SCORE"
  | "VALUE_PLAYER"
  | "PRICE_INCREASE"
  | "PRICE_SURGE"
  | "PRICE_DECREASE"
  | "PRICE_DROP";

// Priority ladder: higher index = higher priority
const EVENT_PRIORITY_ORDER: WatchlistEventType[] = [
  "COLD_FORM",
  "VALUE_PLAYER",
  "PRICE_DECREASE",
  "PRICE_INCREASE",
  "HIGH_SCORE",
  "HOT_FORM",
  "PRICE_SURGE",
  "PRICE_DROP",
  "TRENDING",
  "EXCEPTIONAL_SCORE",
];

function resolvePriority(events: WatchlistEventType[]): NotificationPriority {
  let highest = -1;
  for (const ev of events) {
    const idx = EVENT_PRIORITY_ORDER.indexOf(ev);
    if (idx > highest) highest = idx;
  }
  // Map index range to priority levels
  if (highest >= EVENT_PRIORITY_ORDER.indexOf("TRENDING")) return "high";
  if (highest >= EVENT_PRIORITY_ORDER.indexOf("HIGH_SCORE"))  return "normal";
  return "low";
}

// ─── Per-user event accumulator ───────────────────────────────────────────────

interface PlayerEventAccumulator {
  player_id: string;
  player_name: string;
  events: WatchlistEventType[];
  price_change: number;
  fantasy_points: number;
  form: string;
  value_ratio: number;
}

// week-scoped store: `${user_id}:${player_id}` → accumulator
// This is module-level state, reset per workflow_id
const weekAccumulators = new Map<string, PlayerEventAccumulator>();

function accumulatorKey(user_id: string, player_id: string): string {
  return `${user_id}:${player_id}`;
}

function getOrCreate(
  user_id: string,
  player_id: string,
  player_name: string
): PlayerEventAccumulator {
  const key = accumulatorKey(user_id, player_id);
  if (!weekAccumulators.has(key)) {
    weekAccumulators.set(key, {
      player_id,
      player_name,
      events: [],
      price_change: 0,
      fantasy_points: 0,
      form: "average",
      value_ratio: 0,
    });
  }
  return weekAccumulators.get(key)!;
}

// ─── Notification title/message builder ───────────────────────────────────────

function buildTitle(acc: PlayerEventAccumulator): string {
  const { events, player_name } = acc;

  if (events.includes("EXCEPTIONAL_SCORE")) return `🏆 ${player_name} had a historic week!`;
  if (events.includes("TRENDING"))           return `🚀 ${player_name} is trending!`;
  if (events.includes("HOT_FORM") && events.some(e => e.startsWith("PRICE_SURG")))
                                             return `🔥 ${player_name} had a huge week!`;
  if (events.includes("HOT_FORM"))           return `🔥 ${player_name} is on fire!`;
  if (events.includes("PRICE_SURGE"))        return `📈 ${player_name} price surged!`;
  if (events.includes("PRICE_DROP"))         return `📉 ${player_name} price dropped!`;
  if (events.includes("COLD_FORM"))          return `🔵 ${player_name} is in cold form.`;
  if (events.includes("HIGH_SCORE"))         return `⭐ ${player_name} had a strong week!`;
  if (events.includes("VALUE_PLAYER"))       return `💎 ${player_name} is excellent value.`;
  if (events.includes("PRICE_INCREASE"))     return `📈 ${player_name} price increased.`;
  if (events.includes("PRICE_DECREASE"))     return `📉 ${player_name} price decreased.`;
  return `📊 Update for ${player_name}`;
}

function buildMessage(acc: PlayerEventAccumulator): string {
  const lines: string[] = [];

  if (acc.fantasy_points >= 30) {
    lines.push(`• ${acc.fantasy_points.toFixed(1)} Fantasy Points`);
  }
  if (acc.form === "hot")  lines.push("• HOT Form");
  if (acc.form === "cold") lines.push("• Cold Form");
  if (acc.events.includes("TRENDING")) lines.push("• Trending Player");
  if (acc.events.includes("VALUE_PLAYER") && acc.value_ratio > 0) {
    lines.push(`• Exceptional Value (${acc.value_ratio.toFixed(2)} FP/cr)`);
  }
  if (acc.price_change !== 0) {
    const sign = acc.price_change > 0 ? "+" : "";
    lines.push(`• Price ${acc.price_change > 0 ? "+" : ""}${acc.price_change} Credit${Math.abs(acc.price_change) !== 1 ? "s" : ""}`);
  }

  return lines.length > 0
    ? lines.join("\n")
    : `${acc.player_name} had activity on your watchlist this week.`;
}

// ─── Watcher Index ────────────────────────────────────────────────────────────

/** Build Map<player_id, Set<user_id>> from the Watchlists sheet. One read. */
export async function buildWatcherIndex(): Promise<Map<string, Set<string>>> {
  const index = new Map<string, Set<string>>();
  try {
    const rows = await getSheetData("Watchlists");
    for (const row of rows) {
      if (!row.player_id || !row.user_id) continue;
      if (!index.has(row.player_id)) index.set(row.player_id, new Set());
      index.get(row.player_id)!.add(row.user_id);
    }
  } catch (err) {
    // ADL-036: missing Watchlists sheet — return empty index, producer no-ops
    console.warn("[WatchlistProducer] Could not read Watchlists sheet:", err);
  }
  return index;
}

// ─── Per-user event cap ───────────────────────────────────────────────────────

const PER_USER_CAP = 5;

// ─── Feature flag ─────────────────────────────────────────────────────────────

async function notificationsEnabled(): Promise<boolean> {
  try {
    const flag = await getSetting("notifications_enabled", "true");
    return flag.toLowerCase() === "true";
  } catch {
    return true;
  }
}

// ─── FORM & PERFORMANCE PRODUCER ─────────────────────────────────────────────

/**
 * Called after calculateWeeklyScores() completes.
 * Generates HOT_FORM, COLD_FORM, TRENDING, HIGH_SCORE, EXCEPTIONAL_SCORE,
 * and VALUE_PLAYER notifications for watched players.
 */
export async function dispatchWatchlistFormNotifications(
  enrichedPlayers: EnrichedPlayer[],
  watcherIndex: Map<string, Set<string>>,
  week_id: string,
  workflow_id: string
): Promise<void> {
  if (!(await notificationsEnabled())) return;
  if (!enrichedPlayers.length || !watcherIndex.size) return;

  // Clear accumulators for this workflow run's form pass
  weekAccumulators.clear();

  for (const player of enrichedPlayers) {
    const watchers = watcherIndex.get(player.player_id);
    if (!watchers || watchers.size === 0) continue;

    // Determine which events this player qualifies for
    const events: WatchlistEventType[] = [];
    const weeklyScore = player.last_5_fantasy_scores?.[0] ?? 0; // most recent score

    if (weeklyScore >= 40) events.push("EXCEPTIONAL_SCORE");
    else if (weeklyScore >= 30) events.push("HIGH_SCORE");

    if (player.form === "hot" && player.price_change > 0) {
      events.push("TRENDING");
    } else {
      if (player.form === "hot")  events.push("HOT_FORM");
      if (player.form === "cold") events.push("COLD_FORM");
    }

    if (player.value_per_credit >= 2.5) events.push("VALUE_PLAYER");

    if (events.length === 0) continue; // no notable events for this player

    for (const user_id of watchers) {
      const acc = getOrCreate(user_id, player.player_id, player.full_name);
      // Add events (avoid duplicates within accumulator)
      for (const ev of events) {
        if (!acc.events.includes(ev)) acc.events.push(ev);
      }
      acc.fantasy_points = weeklyScore;
      acc.form            = player.form ?? "average";
      acc.value_ratio     = player.value_per_credit ?? 0;
    }
  }

  // Dispatch all accumulated events
  await _dispatchAccumulators(week_id, workflow_id);
}

// ─── PRICE PRODUCER ───────────────────────────────────────────────────────────

/**
 * Called after adjustPlayerPrices() completes.
 * Generates PRICE_INCREASE, PRICE_SURGE, PRICE_DECREASE, PRICE_DROP
 * notifications for watched players.
 *
 * Uses the same weekAccumulators map — if form notifications were already
 * dispatched for this workflow_id, this adds price events to existing rows
 * only if the accumulator already exists from the form pass (i.e. the same
 * workflow run). Otherwise accumulates and dispatches standalone.
 */
export async function dispatchWatchlistPriceNotifications(
  result: PriceAdjustmentResult,
  watcherIndex: Map<string, Set<string>>,
  week_id: string,
  workflow_id: string
): Promise<void> {
  if (!(await notificationsEnabled())) return;
  if (!result.changes.length || !watcherIndex.size) return;

  // Price producer runs after form producer in the same week.
  // Accumulators from form pass are still in memory — merge price events in.
  // If form pass was never run (e.g. price-only workflow), start fresh.

  for (const raw of result.changes) {
    const watchers = watcherIndex.get(raw.player_id);
    if (!watchers || watchers.size === 0) continue;

    const price_change = raw.new_price - raw.old_price;
    if (price_change === 0) continue;

    let priceEvent: WatchlistEventType;
    if (price_change >= 2)       priceEvent = "PRICE_SURGE";
    else if (price_change === 1) priceEvent = "PRICE_INCREASE";
    else if (price_change <= -2) priceEvent = "PRICE_DROP";
    else                         priceEvent = "PRICE_DECREASE";

    for (const user_id of watchers) {
      const acc = getOrCreate(user_id, raw.player_id, raw.full_name);
      if (!acc.events.includes(priceEvent)) acc.events.push(priceEvent);
      acc.price_change    = price_change;
      // Carry weekly points from PriceAdjustmentResult if not already set
      if (acc.fantasy_points === 0) acc.fantasy_points = raw.weekly_fantasy_points ?? 0;
    }
  }

  await _dispatchAccumulators(week_id, workflow_id);
}

// ─── Shared dispatcher ────────────────────────────────────────────────────────

async function _dispatchAccumulators(
  week_id: string,
  workflow_id: string
): Promise<void> {
  if (weekAccumulators.size === 0) return;

  // Group by user_id to apply per-user cap
  const byUser = new Map<string, PlayerEventAccumulator[]>();
  for (const [compositeKey, acc] of weekAccumulators) {
    if (acc.events.length === 0) continue;
    const user_id = compositeKey.split(":")[0];
    if (!byUser.has(user_id)) byUser.set(user_id, []);
    byUser.get(user_id)!.push(acc);
  }

  const events: NotificationEvent[] = [];

  for (const [user_id, playerAccs] of byUser) {
    // Sort by priority descending, then cap at PER_USER_CAP
    const sorted = [...playerAccs].sort((a, b) => {
      const pa = EVENT_PRIORITY_ORDER.indexOf(
        [...a.events].sort((x, y) => EVENT_PRIORITY_ORDER.indexOf(y) - EVENT_PRIORITY_ORDER.indexOf(x))[0]
      );
      const pb = EVENT_PRIORITY_ORDER.indexOf(
        [...b.events].sort((x, y) => EVENT_PRIORITY_ORDER.indexOf(y) - EVENT_PRIORITY_ORDER.indexOf(x))[0]
      );
      return pb - pa;
    });

    const capped = sorted.slice(0, PER_USER_CAP);

    for (const acc of capped) {
      // Idempotency key: one per user × player × week (no event type — aggregated)
      const idempotencyKey = buildIdempotencyKey(
        "WATCHLIST",
        user_id,
        acc.player_id,
        week_id
      );

      events.push({
        idempotencyKey,
        user_id,
        type:     "WATCHLIST",
        title:    buildTitle(acc),
        message:  buildMessage(acc),
        link:     "/watchlist",
        priority: resolvePriority(acc.events),
        metadata: {
          event:          "WATCHLIST_UPDATE",
          events:         acc.events,
          player_id:      acc.player_id,
          player_name:    acc.player_name,
          price_change:   acc.price_change,
          fantasy_points: acc.fantasy_points,
          form:           acc.form,
          value_ratio:    acc.value_ratio,
          week_id,
          source_module:  "watchlistNotificationProducer",
          correlation_id: week_id,
          workflow_id,
          version:        "1",
        },
      });
    }
  }

  if (events.length === 0) return;

  try {
    const r = await notificationEngine.dispatchMany(events);
    console.log(
      `[WatchlistProducer] Dispatched ${r.dispatched} notification(s), ` +
      `skipped ${r.skipped}, errors: ${r.errors.length}.`
    );
    if (r.errors.length > 0) {
      r.errors.forEach((e) => console.error(`[WatchlistProducer] ${e}`));
    }
  } catch (err: any) {
    console.error(`[WatchlistProducer] Dispatch failed: ${err?.message || err}`);
  }

  // Clear accumulators after dispatch so a second call does not re-dispatch
  weekAccumulators.clear();
}
