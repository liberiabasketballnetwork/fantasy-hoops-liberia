/**
 * Watchlist Notification Producer — NOTIFY-004 (revised)
 *
 * Generates notifications for users watching players that experience
 * meaningful events during the weekly workflow.
 *
 * ADL-039: imports only the engine — never destinations or sheets directly.
 * ADL-041: player-first inversion — iterates changed players, looks up watchers.
 * ADL-042: fire-and-forget — failures never block score calculation or pricing.
 *
 * REVISION: No module-level shared state.
 * Aggregation is local to each producer invocation.
 * The two workflows (score calc, price adj) are independent HTTP requests.
 * Each produces its own scoped notification set.
 *
 * Idempotency keys are workflow-scoped:
 *   Form:  WATCHLIST_FORM:{user_id}:{player_id}:{week_id}
 *   Price: WATCHLIST_PRICE:{user_id}:{player_id}:{week_id}
 *
 * One form notification + one price notification per player per week is acceptable.
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

type FormEventType =
  | "HOT_FORM"
  | "COLD_FORM"
  | "TRENDING"
  | "HIGH_SCORE"
  | "EXCEPTIONAL_SCORE"
  | "VALUE_PLAYER";

type PriceEventType =
  | "PRICE_INCREASE"
  | "PRICE_SURGE"
  | "PRICE_DECREASE"
  | "PRICE_DROP";

type WatchlistEventType = FormEventType | PriceEventType;

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
  if (highest >= EVENT_PRIORITY_ORDER.indexOf("TRENDING")) return "high";
  if (highest >= EVENT_PRIORITY_ORDER.indexOf("HIGH_SCORE"))  return "normal";
  return "low";
}

// ─── Accumulator (local, not module-level) ────────────────────────────────────

interface PlayerEventAccumulator {
  player_id: string;
  player_name: string;
  events: WatchlistEventType[];
  price_change: number;
  fantasy_points: number;
  form: string;
  value_ratio: number;
}

// ─── Title / message builders ─────────────────────────────────────────────────

function buildTitle(acc: PlayerEventAccumulator): string {
  const { events, player_name } = acc;

  if (events.includes("EXCEPTIONAL_SCORE"))              return `🏆 ${player_name} had a historic week!`;
  if (events.includes("TRENDING"))                       return `🚀 ${player_name} is trending!`;
  if (events.includes("HOT_FORM"))                       return `🔥 ${player_name} is on fire!`;
  if (events.includes("PRICE_SURGE"))                    return `📈 ${player_name} price surged!`;
  if (events.includes("PRICE_DROP"))                     return `📉 ${player_name} price dropped significantly!`;
  if (events.includes("COLD_FORM"))                      return `🔵 ${player_name} is in cold form.`;
  if (events.includes("HIGH_SCORE"))                     return `⭐ ${player_name} had a strong week!`;
  if (events.includes("VALUE_PLAYER"))                   return `💎 ${player_name} is excellent value.`;
  if (events.includes("PRICE_INCREASE"))                 return `📈 ${player_name} price increased.`;
  if (events.includes("PRICE_DECREASE"))                 return `📉 ${player_name} price decreased.`;
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
    lines.push(`• Price ${sign}${acc.price_change} Credit${Math.abs(acc.price_change) !== 1 ? "s" : ""}`);
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

// ─── Per-user cap ─────────────────────────────────────────────────────────────

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

// ─── Shared dispatch helper ───────────────────────────────────────────────────
// Accepts a LOCAL accumulator map — no module-level state involved.

async function dispatchFromAccumulators(
  localAccumulators: Map<string, PlayerEventAccumulator>,
  idempotencyPrefix: string,
  week_id: string,
  workflow_id: string
): Promise<void> {
  if (localAccumulators.size === 0) return;

  // Group by user_id for per-user cap
  const byUser = new Map<string, PlayerEventAccumulator[]>();
  for (const [compositeKey, acc] of localAccumulators) {
    if (acc.events.length === 0) continue;
    const user_id = compositeKey.split(":")[0];
    if (!byUser.has(user_id)) byUser.set(user_id, []);
    byUser.get(user_id)!.push(acc);
  }

  const events: NotificationEvent[] = [];

  for (const [user_id, playerAccs] of byUser) {
    // Sort highest priority first, then cap
    const sorted = [...playerAccs].sort((a, b) => {
      const topEvent = (accs: WatchlistEventType[]) =>
        [...accs].sort(
          (x, y) => EVENT_PRIORITY_ORDER.indexOf(y) - EVENT_PRIORITY_ORDER.indexOf(x)
        )[0];
      return (
        EVENT_PRIORITY_ORDER.indexOf(topEvent(b.events)) -
        EVENT_PRIORITY_ORDER.indexOf(topEvent(a.events))
      );
    });

    const capped = sorted.slice(0, PER_USER_CAP);

    for (const acc of capped) {
      // Scoped idempotency key — form and price workflows use different prefixes
      // so each can produce one notification per player per week independently
      const idempotencyKey = buildIdempotencyKey(
        idempotencyPrefix as any,
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
}

// ─── FORM & PERFORMANCE PRODUCER ─────────────────────────────────────────────

/**
 * Called after calculateWeeklyScores() completes.
 * Generates form and performance notifications for watched players.
 * Aggregates: HOT_FORM, COLD_FORM, TRENDING, HIGH_SCORE, EXCEPTIONAL_SCORE, VALUE_PLAYER.
 * One notification per (user × player × week) via idempotency prefix WATCHLIST_FORM.
 */
export async function dispatchWatchlistFormNotifications(
  enrichedPlayers: EnrichedPlayer[],
  watcherIndex: Map<string, Set<string>>,
  week_id: string,
  workflow_id: string
): Promise<void> {
  if (!(await notificationsEnabled())) return;
  if (!enrichedPlayers.length || !watcherIndex.size) return;

  // LOCAL accumulator — lives only for the duration of this function call
  const localAccumulators = new Map<string, PlayerEventAccumulator>();

  for (const player of enrichedPlayers) {
    const watchers = watcherIndex.get(player.player_id);
    if (!watchers || watchers.size === 0) continue;

    const events: FormEventType[] = [];
    const weeklyScore = player.last_5_fantasy_scores?.[0] ?? 0;

    if (weeklyScore >= 40)      events.push("EXCEPTIONAL_SCORE");
    else if (weeklyScore >= 30) events.push("HIGH_SCORE");

    if (player.form === "hot" && (player.price_change ?? 0) > 0) {
      events.push("TRENDING");
    } else {
      if (player.form === "hot")  events.push("HOT_FORM");
      if (player.form === "cold") events.push("COLD_FORM");
    }

    if ((player.value_per_credit ?? 0) >= 2.5) events.push("VALUE_PLAYER");

    if (events.length === 0) continue;

    for (const user_id of watchers) {
      const key = `${user_id}:${player.player_id}`;
      if (!localAccumulators.has(key)) {
        localAccumulators.set(key, {
          player_id:     player.player_id,
          player_name:   player.full_name,
          events:        [],
          price_change:  0,
          fantasy_points: weeklyScore,
          form:          player.form ?? "average",
          value_ratio:   player.value_per_credit ?? 0,
        });
      }
      const acc = localAccumulators.get(key)!;
      for (const ev of events) {
        if (!acc.events.includes(ev)) acc.events.push(ev);
      }
    }
  }

  await dispatchFromAccumulators(localAccumulators, "WATCHLIST_FORM", week_id, workflow_id);
}

// ─── PRICE PRODUCER ───────────────────────────────────────────────────────────

/**
 * Called after adjustPlayerPrices() completes.
 * Generates price notifications for watched players.
 * Aggregates: PRICE_INCREASE, PRICE_SURGE, PRICE_DECREASE, PRICE_DROP.
 * One notification per (user × player × week) via idempotency prefix WATCHLIST_PRICE.
 */
export async function dispatchWatchlistPriceNotifications(
  result: PriceAdjustmentResult,
  watcherIndex: Map<string, Set<string>>,
  week_id: string,
  workflow_id: string
): Promise<void> {
  if (!(await notificationsEnabled())) return;
  if (!result.changes.length || !watcherIndex.size) return;

  // LOCAL accumulator — lives only for the duration of this function call
  const localAccumulators = new Map<string, PlayerEventAccumulator>();

  for (const raw of result.changes) {
    const watchers = watcherIndex.get(raw.player_id);
    if (!watchers || watchers.size === 0) continue;

    const price_change = raw.new_price - raw.old_price;
    if (price_change === 0) continue;

    let priceEvent: PriceEventType;
    if (price_change >= 2)       priceEvent = "PRICE_SURGE";
    else if (price_change === 1) priceEvent = "PRICE_INCREASE";
    else if (price_change <= -2) priceEvent = "PRICE_DROP";
    else                         priceEvent = "PRICE_DECREASE";

    for (const user_id of watchers) {
      const key = `${user_id}:${raw.player_id}`;
      if (!localAccumulators.has(key)) {
        localAccumulators.set(key, {
          player_id:      raw.player_id,
          player_name:    raw.full_name,
          events:         [],
          price_change:   price_change,
          fantasy_points: raw.weekly_fantasy_points ?? 0,
          form:           "average",
          value_ratio:    0,
        });
      }
      const acc = localAccumulators.get(key)!;
      if (!acc.events.includes(priceEvent)) acc.events.push(priceEvent);
      acc.price_change = price_change;
    }
  }

  await dispatchFromAccumulators(localAccumulators, "WATCHLIST_PRICE", week_id, workflow_id);
}
