/**
 * Pricing Notification Producer — ENGAGEMENT-003 Sprint 2B
 *
 * Converts the PriceAdjustmentResult returned by the pricing engine into
 * targeted NotificationEvents for users whose current lineup players
 * experienced price movements.
 *
 * ADL-039: imports only the engine — no destinations, no sheet writes.
 * ADL-041: receives the result as a parameter — never re-reads Price_History.
 * ADL-042: fire-and-forget — any failure is logged, never propagated.
 *
 * The pricing engine (priceAdjustmentService) is NOT modified.
 */

import { getSetting, getSheetData } from "./sheetsService";
import {
  notificationEngine,
  NotificationEvent,
  buildIdempotencyKey,
} from "./notificationEventEngine";
import { PriceAdjustmentResult } from "./priceAdjustmentService";

// ─── Internal types ───────────────────────────────────────────────────────────

type PriceDirection = "increase" | "decrease" | "surge" | "drop";

interface PriceChange {
  player_id: string;
  full_name: string;
  old_price: number;
  new_price: number;
  price_change: number; // derived: new_price - old_price
}

// ─── Notification rules ───────────────────────────────────────────────────────

/** Determine which event subtype and priority to emit for a given price change. */
function classifyChange(price_change: number): {
  direction: PriceDirection;
  subtype: string;
  priority: "high" | "normal";
} {
  if (price_change >= 2) return { direction: "surge",    subtype: "PRICE_SURGE",    priority: "high"   };
  if (price_change === 1) return { direction: "increase", subtype: "PRICE_INCREASE", priority: "normal" };
  if (price_change <= -2) return { direction: "drop",    subtype: "PRICE_DROP",     priority: "high"   };
  return                         { direction: "decrease", subtype: "PRICE_DECREASE", priority: "normal" };
}

const DIRECTION_ICONS: Record<PriceDirection, string> = {
  surge:    "🚀",
  increase: "📈",
  drop:     "⬇️",
  decrease: "📉",
};

/** Build a human-readable title. Captain price changes get a personalised heading. */
function buildTitle(
  playerName: string,
  direction: PriceDirection,
  isCaptain: boolean
): string {
  const icon = DIRECTION_ICONS[direction];
  const isUp = direction === "surge" || direction === "increase";

  if (isCaptain) {
    return `${icon} Your Captain's Price ${isUp ? "Rose" : "Fell"}`;
  }
  if (direction === "surge") return `${icon} Price Surge: ${playerName}`;
  if (direction === "drop")  return `${icon} Significant Drop: ${playerName}`;
  return `${icon} Price Alert: ${playerName}`;
}

/** Build a concise, actionable message body (max 280 chars). */
function buildMessage(change: PriceChange, direction: PriceDirection): string {
  const delta = change.price_change > 0 ? `+${change.price_change}` : `${change.price_change}`;
  const base  = `${change.full_name}'s price ${change.price_change > 0 ? "rose" : "fell"} ` +
                `from ${change.old_price} to ${change.new_price} credits (${delta}) this week.`;

  if (direction === "drop") {
    return `${base} Consider reviewing your lineup before the next deadline.`;
  }
  if (direction === "surge") {
    return `${base} They may become harder to afford — a strong asset to hold.`;
  }
  return base;
}

// ─── Producer ─────────────────────────────────────────────────────────────────

/**
 * dispatchPricingNotifications
 *
 * Called after adjustPlayerPrices() completes and returns its result.
 * Reads User_Lineups once (typically a cache hit within the 15s TTL),
 * cross-references changed players with lineup ownership, and emits
 * one NotificationEvent per (user, player, direction) combination.
 *
 * @param result       PriceAdjustmentResult returned by the pricing engine
 * @param week_id      The active gameweek identifier
 * @param workflow_id  UUID identifying this admin workflow execution
 */
export async function dispatchPricingNotifications(
  result: PriceAdjustmentResult,
  week_id: string,
  workflow_id: string
): Promise<void> {
  // ── Feature flag ──────────────────────────────────────────────────────────
  try {
    const flag = await getSetting("notifications_enabled", "true");
    if (flag.toLowerCase() !== "true") return;
  } catch {
    // Default to enabled if settings read fails
  }

  // ── Short-circuit: nothing changed ───────────────────────────────────────
  if (!result.changes || result.changes.length === 0) return;

  // ── Load User_Lineups — typically a cache hit ─────────────────────────────
  let allLineups: any[] = [];
  let allLineupPlayers: any[] = [];
  try {
    [allLineups, allLineupPlayers] = await Promise.all([
      getSheetData("User_Lineups"),
      getSheetData("Lineup_Players"),
    ]);
  } catch (err) {
    console.error("[PricingProducer] Failed to read lineup data:", err);
    return; // Cannot identify affected users — skip silently
  }

  // ── Scope to this week's lineups ──────────────────────────────────────────
  const weekLineups = allLineups.filter(
    (l) => String(l.week_id) === String(week_id)
  );
  if (weekLineups.length === 0) return; // No lineups submitted — nothing to notify

  // Build lookup: lineup_id → lineup row (user_id, captain_player_id)
  const lineupById = new Map(weekLineups.map((l) => [l.lineup_id, l]));

  // Build lookup: player_id → set of (user_id, captain_player_id) pairs
  // One player can be in many users' lineups
  const playerToUsers = new Map<
    string,
    Array<{ user_id: string; is_captain: boolean }>
  >();

  for (const lp of allLineupPlayers) {
    const lineup = lineupById.get(lp.lineup_id);
    if (!lineup) continue;
    const entry = {
      user_id:    lineup.user_id,
      is_captain: String(lineup.captain_player_id) === String(lp.player_id),
    };
    if (!playerToUsers.has(lp.player_id)) {
      playerToUsers.set(lp.player_id, []);
    }
    playerToUsers.get(lp.player_id)!.push(entry);
  }

  // ── Build events ──────────────────────────────────────────────────────────
  const events: NotificationEvent[] = [];
  const PER_USER_CAP = 5;
  const userEventCount = new Map<string, number>();

  for (const raw of result.changes) {
    // PriceAdjustmentResult.changes doesn't carry price_change directly —
    // derive it from old_price and new_price.
    const change: PriceChange = {
      player_id:    raw.player_id,
      full_name:    raw.full_name,
      old_price:    raw.old_price,
      new_price:    raw.new_price,
      price_change: raw.new_price - raw.old_price,
    };

    const watchers = playerToUsers.get(change.player_id);
    if (!watchers || watchers.length === 0) continue; // No one has this player

    const { direction, subtype, priority } = classifyChange(change.price_change);

    for (const { user_id, is_captain } of watchers) {
      // Per-user cap: maximum 5 pricing notifications per workflow run
      const count = userEventCount.get(user_id) ?? 0;
      if (count >= PER_USER_CAP) continue;
      userEventCount.set(user_id, count + 1);

      // Captain events are always high priority regardless of change magnitude
      const effectivePriority: "high" | "normal" =
        is_captain ? "high" : priority;

      const idempotencyKey = buildIdempotencyKey(
        "PRICE",
        user_id,
        `${change.player_id}:${direction}`,
        week_id
      );

      events.push({
        idempotencyKey,
        user_id,
        type:    "PRICE",
        title:   buildTitle(change.full_name, direction, is_captain),
        message: buildMessage(change, direction),
        link:    "/market",
        priority: effectivePriority,
        metadata: {
          event:          subtype,
          player_id:      change.player_id,
          player_name:    change.full_name,
          old_price:      change.old_price,
          new_price:      change.new_price,
          price_change:   change.price_change,
          direction:      change.price_change > 0 ? "up" : "down",
          is_captain,
          week_id,
          source_module:  "priceAdjustmentService",
          correlation_id: week_id,
          workflow_id,
          version:        "1",
        },
      });
    }
  }

  if (events.length === 0) return; // No lineup players were affected

  // ── Dispatch — fire-and-forget ────────────────────────────────────────────
  try {
    const r = await notificationEngine.dispatchMany(events);
    console.log(
      `[PricingProducer] Dispatched ${r.dispatched} notification(s), ` +
      `skipped ${r.skipped}, errors: ${r.errors.length}.`
    );
    if (r.errors.length > 0) {
      r.errors.forEach((e) => console.error(`[PricingProducer] ${e}`));
    }
  } catch (err: any) {
    console.error(`[PricingProducer] Dispatch failed: ${err?.message || err}`);
  }
}
