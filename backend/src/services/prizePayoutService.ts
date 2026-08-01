/**
 * prizePayoutService.ts — BUSINESS-002
 *
 * Unified Rewards Domain — Prize & Payout Management.
 * Extends existing sponsor, notification, and analytics infrastructure.
 * Does NOT modify Referral_Rewards, gameplay, or sponsor logic.
 *
 * State machine (enforced):
 *   pending  → approved | rejected | cancelled
 *   approved → paid | rejected | cancelled
 *   paid     → completed | reversed
 *   completed, rejected, cancelled, reversed  → terminal
 */

import { v4 as uuidv4 } from "uuid";
import { getSheetData, appendRow, updateRow, getSetting } from "./sheetsService";
import { notificationEngine, buildIdempotencyKey } from "./notificationEventEngine";
import { logAdminAction } from "./adminActionLogger";

// ─── Types ────────────────────────────────────────────────────────────────

export type PrizeSourceType =
  | "weekly_winner"
  | "weekly_runner_up"
  | "referral_reward"
  | "sponsor_promotion"
  | "achievement_reward"
  | "community_contest";

export type PrizeStatus =
  | "pending"
  | "approved"
  | "paid"
  | "completed"
  | "rejected"
  | "cancelled"
  | "reversed";

// ─── State machine ────────────────────────────────────────────────────────

const ALLOWED_TRANSITIONS: Record<PrizeStatus, PrizeStatus[]> = {
  pending:   ["approved", "rejected", "cancelled"],
  approved:  ["paid", "rejected", "cancelled"],
  paid:      ["completed", "reversed"],
  completed: [],
  rejected:  [],
  cancelled: [],
  reversed:  [],
};

// Notify recipient on these transitions (not on rejected — fraud protection)
const NOTIFY_TRANSITIONS = new Set<PrizeStatus>([
  "approved", "paid", "completed", "cancelled", "reversed",
]);

// ─── Source type labels ───────────────────────────────────────────────────

export const SOURCE_LABELS: Record<PrizeSourceType, string> = {
  weekly_winner:    "Weekly Winner",
  weekly_runner_up: "Weekly Runner-up",
  referral_reward:  "Referral Reward",
  sponsor_promotion:"Sponsor Promotion",
  achievement_reward:"Achievement Reward",
  community_contest:"Community Contest",
};

// ─── Public-safe view (strips internal fields) ───────────────────────────

export function toPublicPayout(p: any) {
  return {
    payout_id:        p.payout_id,
    week_id:          p.week_id,
    source_type:      p.source_type,
    sponsor_id:       p.sponsor_id,
    amount_lrd:       Number(p.amount_lrd || 0),
    currency:         p.currency || "LRD",
    status:           p.status,
    created_at:       p.created_at,
    paid_at:          p.paid_at,
    completed_at:     p.completed_at,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────

async function getPayoutById(payout_id: string) {
  const rows = await getSheetData("Prize_Payouts");
  return rows.find((r) => r.payout_id === payout_id) ?? null;
}

async function transition(
  payout_id: string,
  to: PrizeStatus,
  admin_id: string,
  extraFields: Record<string, any> = {}
) {
  const payout = await getPayoutById(payout_id);
  if (!payout) throw new Error("Payout not found.");

  const from = payout.status as PrizeStatus;
  if (!ALLOWED_TRANSITIONS[from]?.includes(to)) {
    throw new Error(`Invalid transition: ${from} → ${to}.`);
  }

  const now = new Date().toISOString();
  const updated = {
    ...payout,
    status:      to,
    reviewed_at: payout.reviewed_at || now,
    reviewed_by: payout.reviewed_by || admin_id,
    ...extraFields,
  };

  await updateRow("Prize_Payouts", "payout_id", payout_id, updated);

  await logAdminAction({
    admin_id,
    action_type: `PRIZE_${to.toUpperCase()}`,
    entity_type: "PRIZE_PAYOUT",
    entity_id:   payout_id,
    details:     `Payout ${payout_id} transitioned ${from} → ${to}. Source: ${payout.source_type}. Amount: LRD ${payout.amount_lrd}.`,
    status:      "success",
  });

  // Fire notification (fire-and-forget — never blocks the transition)
  if (NOTIFY_TRANSITIONS.has(to) && payout.recipient_user_id) {
    const notifMessages: Record<string, { title: string; message: string }> = {
      approved:  { title: "Prize Approved 🎉", message: `Your prize of LRD ${Number(payout.amount_lrd).toLocaleString()} has been approved and is being processed.` },
      paid:      { title: "Prize Paid 💰",     message: `Your LRD ${Number(payout.amount_lrd).toLocaleString()} prize payment has been sent. Check your account!` },
      completed: { title: "Prize Confirmed ✅", message: `Your LRD ${Number(payout.amount_lrd).toLocaleString()} prize has been confirmed as received.` },
      cancelled: { title: "Prize Update",       message: `Your prize record has been updated. Please contact the administrator for details.` },
      reversed:  { title: "Prize Reversed",     message: `A previously issued prize payment has been reversed. Please contact the administrator.` },
    };

    const notif = notifMessages[to];
    if (notif) {
      notificationEngine.dispatch({
        idempotencyKey: buildIdempotencyKey("PRIZE", payout.recipient_user_id, `${to}`, payout_id),
        user_id:        payout.recipient_user_id,
        type:           "PRIZE",
        title:          notif.title,
        message:        notif.message,
        priority:       to === "paid" || to === "approved" ? "high" : "normal",
        metadata:       { payout_id, source_type: payout.source_type, amount_lrd: payout.amount_lrd },
      }).catch(() => {});
    }
  }

  // Auto-update PrizeMoneyAwarded when completed
  if (to === "completed") {
    _updatePrizeMoneyAwarded().catch(() => {});
  }

  return { ...updated };
}

async function _updatePrizeMoneyAwarded() {
  const [payouts, referralRewards, psRows] = await Promise.all([
    getSheetData("Prize_Payouts").catch(() => []),
    getSheetData("Referral_Rewards").catch(() => []),
    getSheetData("Platform_Settings").catch(() => []),
  ]);
  const prizeTotal = payouts
    .filter((p) => p.status === "completed")
    .reduce((s, p) => s + Number(p.amount_lrd || 0), 0);
  const refTotal = referralRewards
    .filter((r) => r.status === "paid")
    .reduce((s, r) => s + Number(r.reward_value || 0), 0);
  const total = prizeTotal + refTotal;

  const existing = psRows.find((r) => r.key === "PrizeMoneyAwarded");
  if (existing) {
    await updateRow("Platform_Settings", "key", "PrizeMoneyAwarded", { ...existing, value: String(total) }).catch(() => {});
  }
}

// ─── CRUD ─────────────────────────────────────────────────────────────────

export async function createPayout(input: {
  week_id?:          string;
  reward_source_id:  string;
  source_type:       PrizeSourceType;
  recipient_user_id: string;
  sponsor_id?:       string;
  amount_lrd:        number;
  currency?:         string;
  admin_notes?:      string;
  created_by:        string;
}) {
  if (!input.amount_lrd || input.amount_lrd <= 0) throw new Error("amount_lrd must be positive.");
  if (!input.recipient_user_id) throw new Error("recipient_user_id is required.");
  if (!input.reward_source_id)  throw new Error("reward_source_id is required.");

  const payout_id = uuidv4();
  const now       = new Date().toISOString();

  const row = {
    payout_id,
    week_id:           input.week_id          || "",
    reward_source_id:  input.reward_source_id,
    source_type:       input.source_type,
    recipient_user_id: input.recipient_user_id,
    sponsor_id:        input.sponsor_id        || "",
    amount_lrd:        input.amount_lrd,
    currency:          input.currency          || "LRD",
    status:            "pending",
    admin_notes:       input.admin_notes       || "",
    payment_reference: "",
    reversal_of:       "",
    created_at:        now,
    created_by:        input.created_by,
    reviewed_at:       "",
    reviewed_by:       "",
    paid_at:           "",
    completed_at:      "",
  };

  await appendRow("Prize_Payouts", row);

  await logAdminAction({
    admin_id:    input.created_by,
    action_type: "CREATE_PAYOUT",
    entity_type: "PRIZE_PAYOUT",
    entity_id:   payout_id,
    details:     `Payout created. Type: ${input.source_type}. Amount: LRD ${input.amount_lrd}. Source: ${input.reward_source_id}.`,
    status:      "success",
  });

  return row;
}

export async function listPayouts(filter?: {
  status?:      string;
  week_id?:     string;
  source_type?: string;
  sponsor_id?:  string;
}) {
  const rows = await getSheetData("Prize_Payouts");
  let filtered = rows;
  if (filter?.status)      filtered = filtered.filter((r) => r.status      === filter.status);
  if (filter?.week_id)     filtered = filtered.filter((r) => r.week_id     === filter.week_id);
  if (filter?.source_type) filtered = filtered.filter((r) => r.source_type === filter.source_type);
  if (filter?.sponsor_id)  filtered = filtered.filter((r) => r.sponsor_id  === filter.sponsor_id);

  return filtered.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

export async function getPayoutSummary() {
  const [payouts, referralRewards] = await Promise.all([
    getSheetData("Prize_Payouts").catch(() => []),
    getSheetData("Referral_Rewards").catch(() => []),
  ]);

  const completed = payouts.filter((p) => p.status === "completed");
  const pending   = payouts.filter((p) => p.status === "pending");
  const approved  = payouts.filter((p) => p.status === "approved");

  const totalLrd = completed.reduce((s, p) => s + Number(p.amount_lrd || 0), 0);
  const sponsorLrd = completed
    .filter((p) => !!p.sponsor_id)
    .reduce((s, p) => s + Number(p.amount_lrd || 0), 0);

  // Average payout time (pending create to paid)
  const payoutTimes = payouts
    .filter((p) => p.paid_at && p.created_at)
    .map((p) => (new Date(p.paid_at).getTime() - new Date(p.created_at).getTime()) / 86400000);
  const avgDays = payoutTimes.length
    ? Math.round((payoutTimes.reduce((s, d) => s + d, 0) / payoutTimes.length) * 10) / 10
    : 0;

  return {
    totalPrizesCreated: payouts.length,
    totalLrdAwarded:    totalLrd,
    sponsorFunded:      sponsorLrd,
    platformFunded:     totalLrd - sponsorLrd,
    pendingApproval:    pending.length + approved.length,
    averagePayoutDays:  avgDays,
    referralRewardsPaid: referralRewards.filter((r) => r.status === "paid").length,
  };
}

// ─── Lifecycle transitions ────────────────────────────────────────────────

export const approvePayout = (id: string, admin_id: string, notes?: string) =>
  transition(id, "approved", admin_id, { admin_notes: notes || "" });

export const rejectPayout = (id: string, admin_id: string, notes: string) => {
  if (!notes?.trim()) throw new Error("Admin notes required when rejecting.");
  return transition(id, "rejected", admin_id, { admin_notes: notes });
};

export const markPayoutPaid = (id: string, admin_id: string, payment_reference: string, notes?: string) => {
  if (!payment_reference?.trim()) throw new Error("payment_reference required when marking paid.");
  return transition(id, "paid", admin_id, {
    payment_reference,
    paid_at: new Date().toISOString(),
    ...(notes ? { admin_notes: notes } : {}),
  });
};

export const completePayout = (id: string, admin_id: string) =>
  transition(id, "completed", admin_id, { completed_at: new Date().toISOString() });

export const cancelPayout = (id: string, admin_id: string, notes: string) => {
  if (!notes?.trim()) throw new Error("Admin notes required when cancelling.");
  return transition(id, "cancelled", admin_id, { admin_notes: notes });
};

export const reversePayout = async (id: string, admin_id: string, notes: string) => {
  if (!notes?.trim()) throw new Error("Admin notes required when reversing.");
  const payout = await getPayoutById(id);
  if (!payout) throw new Error("Payout not found.");

  // Create a reversal record
  const reversalId = uuidv4();
  const now        = new Date().toISOString();
  await appendRow("Prize_Payouts", {
    ...payout,
    payout_id:         reversalId,
    status:            "reversed",
    reversal_of:       id,
    admin_notes:       notes,
    created_at:        now,
    created_by:        admin_id,
    reviewed_at:       now,
    reviewed_by:       admin_id,
    paid_at:           "",
    completed_at:      "",
    amount_lrd:        -Number(payout.amount_lrd || 0),  // negative = debit
  });

  return transition(id, "reversed", admin_id, { admin_notes: notes });
};

// ─── Idempotent weekly prize generation ──────────────────────────────────

export async function generateWeeklyPrizePayouts(
  week_id: string,
  admin_id: string
): Promise<{ created: number; skipped: number; records: any[] }> {
  const [leaderboard, weeks, settings, existingPayouts] = await Promise.all([
    getSheetData("Leaderboard"),
    getSheetData("Weekly_Gameweek"),
    getSheetData("Platform_Settings"),
    getSheetData("Prize_Payouts"),
  ]);

  const week = weeks.find((w) => String(w.week_id) === String(week_id));
  if (!week) throw new Error(`Gameweek ${week_id} not found.`);

  const isLocked = String(week.is_locked).toUpperCase() === "TRUE";
  if (!isLocked) throw new Error("Gameweek must be locked before generating prize records.");

  const scoresCalc = String(week.scores_calculated).toUpperCase() === "TRUE";
  if (!scoresCalc) throw new Error("Scores must be calculated before generating prize records.");

  // Read prize config from Platform_Settings
  const weeklyPrizeSetting = settings.find((s) => s.key === "CurrentWeeklyPrize");
  const weeklyPrize        = Number(weeklyPrizeSetting?.value || 0);
  if (weeklyPrize <= 0) throw new Error("CurrentWeeklyPrize is not configured. Set it in Platform Settings first.");

  // Get this week's top finishers from leaderboard
  const weekLeaderboard = leaderboard
    .filter((l) => String(l.week_id) === String(week_id))
    .sort((a, b) => Number(a.rank) - Number(b.rank));

  if (weekLeaderboard.length === 0) throw new Error("No leaderboard entries for this gameweek.");

  // Prize distribution: winner gets full prize, runner-up gets configurable amount
  const runnerUpSetting = settings.find((s) => s.key === "RunnerUpPrize");
  const runnerUpPrize   = Number(runnerUpSetting?.value || 0);

  const prizeTiers = [
    { rank: 1, source_type: "weekly_winner"    as PrizeSourceType, amount: weeklyPrize },
    ...(runnerUpPrize > 0 ? [{ rank: 2, source_type: "weekly_runner_up" as PrizeSourceType, amount: runnerUpPrize }] : []),
  ];

  let created = 0;
  let skipped = 0;
  const records: any[] = [];

  for (const tier of prizeTiers) {
    const winner = weekLeaderboard.find((l) => Number(l.rank) === tier.rank);
    if (!winner) continue;

    const reward_source_id = `week_${week_id}_rank_${tier.rank}`;

    // Idempotency check: does this payout already exist?
    const duplicate = existingPayouts.find((p) =>
      String(p.week_id)           === String(week_id)       &&
      String(p.reward_source_id)  === reward_source_id      &&
      String(p.recipient_user_id) === String(winner.user_id) &&
      String(p.source_type)       === tier.source_type
    );

    if (duplicate) { skipped++; records.push(duplicate); continue; }

    const payout = await createPayout({
      week_id,
      reward_source_id,
      source_type:       tier.source_type,
      recipient_user_id: winner.user_id,
      sponsor_id:        week.sponsor_id || "",
      amount_lrd:        tier.amount,
      currency:          "LRD",
      created_by:        admin_id,
    });

    created++;
    records.push(payout);
  }

  await logAdminAction({
    admin_id,
    action_type: "GENERATE_WEEKLY_PRIZES",
    entity_type: "WEEK",
    entity_id:   week_id,
    details:     `Weekly prize records generated for week ${week_id}. Created: ${created}, Skipped (duplicate): ${skipped}.`,
    status:      "success",
  });

  return { created, skipped, records };
}

// ─── Analytics helper ─────────────────────────────────────────────────────

export async function getPrizeAnalytics() {
  const [payouts, weeks] = await Promise.all([
    getSheetData("Prize_Payouts").catch(() => []),
    getSheetData("Weekly_Gameweek").catch(() => []),
  ]);

  const completed   = payouts.filter((p) => p.status === "completed");
  const totalLrd    = completed.reduce((s, p) => s + Number(p.amount_lrd || 0), 0);
  const sponsorLrd  = completed.filter((p) => !!p.sponsor_id).reduce((s, p) => s + Number(p.amount_lrd || 0), 0);
  const pending     = payouts.filter((p) => ["pending","approved"].includes(p.status)).length;

  const payoutTimes = payouts
    .filter((p) => p.paid_at && p.created_at)
    .map((p) => (new Date(p.paid_at).getTime() - new Date(p.created_at).getTime()) / 86400000);
  const avgDays = payoutTimes.length
    ? Math.round((payoutTimes.reduce((s, d) => s + d, 0) / payoutTimes.length) * 10) / 10
    : 0;

  // Weekly history
  const byWeek: Record<string, { week_id: string; label: string; amount: number; paid: boolean }> = {};
  for (const p of completed) {
    if (!p.week_id) continue;
    if (!byWeek[p.week_id]) {
      const week  = weeks.find((w) => String(w.week_id) === String(p.week_id));
      byWeek[p.week_id] = { week_id: p.week_id, label: week?.start_date || p.week_id, amount: 0, paid: true };
    }
    byWeek[p.week_id].amount += Number(p.amount_lrd || 0);
  }

  return {
    totalPrizesCreated: payouts.length,
    totalLrdAwarded:    totalLrd,
    sponsorFunded:      sponsorLrd,
    platformFunded:     totalLrd - sponsorLrd,
    pendingApproval:    pending,
    averagePayoutDays:  avgDays,
    weeklyHistory:      Object.values(byWeek).sort((a, b) => a.label.localeCompare(b.label)),
  };
}
