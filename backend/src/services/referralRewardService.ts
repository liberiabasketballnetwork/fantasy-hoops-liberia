/**
 * ReferralRewardService — FEATURE-003
 *
 * Manages the complete referral reward lifecycle:
 *   Pending → Qualified → Reward_Pending → Approved → Paid
 *   With additional states: Rejected, Suspended, Reversed, Expired
 *
 * No automatic payments. Admin approval required for every reward.
 * Reward amount is locked at creation time from Platform Settings.
 */

import { v4 as uuidv4 } from "uuid";
import { getSheetData, appendRow, updateRow } from "./sheetsService";
import { notificationEngine } from "./notificationEventEngine";
import { PS_KEYS } from "./platformSettingsService";
import { logAdminAction } from "./adminActionLogger";

// ─── Types ────────────────────────────────────────────────────────────────

export type RewardStatus =
  | "pending"
  | "approved"
  | "paid"
  | "rejected"
  | "suspended"
  | "reversed"
  | "expired";

export type RewardType = "cash" | "credits" | "voucher" | "badge";

export interface ReferralReward {
  reward_id:          string;
  referral_id:        string;   // referrer_user_id acts as referral FK
  referrer_user_id:   string;
  referred_user_id:   string;
  reward_type:        RewardType;
  reward_value:       number;   // locked at creation time
  status:             RewardStatus;
  created_at:         string;
  reviewed_at:        string;
  paid_at:            string;
  admin_id:           string;
  payment_reference:  string;
  admin_notes:        string;
}

// ─── Setting helpers ──────────────────────────────────────────────────────

async function getRewardSettings() {
  // HOTFIX-003.1: read from Platform_Settings (key/value rows), not the legacy Settings sheet.
  // getSetting() reads Settings sheet — wrong. We must query Platform_Settings directly.
  const rows = await getSheetData("Platform_Settings").catch(() => [] as any[]);
  const get  = (key: string, fallback: string) => {
    const row = rows.find((r: any) => String(r.key) === key);
    return row ? String(row.value ?? fallback) : fallback;
  };

  return {
    enabled:     get(PS_KEYS.REFERRAL_REWARD_ENABLED,             "FALSE").toUpperCase() === "TRUE",
    amountLrd:   Math.max(0, Number(get(PS_KEYS.REFERRAL_REWARD_AMOUNT_LRD,          "500")) || 500),
    windowWeeks: Math.max(1, Number(get(PS_KEYS.REFERRAL_QUALIFICATION_WINDOW_WEEKS, "4"))   || 4),
    maxPerMonth: Math.max(1, Number(get(PS_KEYS.REFERRAL_MAX_REWARDS_PER_MONTH,      "10"))  || 10),
  };
}

// ─── Mask display name for privacy ───────────────────────────────────────

export function maskName(fullName: string): string {
  const parts = fullName.trim().split(" ");
  if (parts.length === 0 || !parts[0]) return "Manager";
  const first = parts[0];
  const lastInitial = parts.length > 1 ? ` ${parts[parts.length - 1][0]}.` : "";
  return `${first}${lastInitial}`;
}

// ─── Qualification Engine ─────────────────────────────────────────────────

/**
 * Called fire-and-forget after every successful lineup submission.
 * Checks whether the submitted user has a pending referral that now qualifies.
 * Never throws — all errors are caught and logged.
 */
export async function checkReferralQualification(
  referred_user_id: string,
  week_id: string
): Promise<void> {
  try {
    const settings = await getRewardSettings();
    if (!settings.enabled) return;  // Master switch

    const [referrals, lineups, users] = await Promise.all([
      getSheetData("Referrals"),
      getSheetData("User_Lineups"),
      getSheetData("Users"),
    ]);

    // Find pending referral for this user
    const referral = referrals.find(
      (r) =>
        r.referred_user_id === referred_user_id &&
        (r.status === "Pending" || r.status === "Active")
    );
    if (!referral) return;  // No referral — nothing to do

    // Check qualification window
    const registrationDate = new Date(referral.referral_date);
    const now = new Date();
    const weeksElapsed = (now.getTime() - registrationDate.getTime()) / (7 * 24 * 60 * 60 * 1000);
    if (weeksElapsed > settings.windowWeeks) {
      // Window expired — mark as expired and exit
      await updateRow("Referrals", "referrer_user_id", referral.referrer_user_id, {
        ...referral,
        status: "Expired",
      });
      console.log(`[ReferralReward] Referral expired for ${referred_user_id}`);
      return;
    }

    // Check this is actually the first lineup submission ever (not just this week)
    const allUserLineups = lineups.filter(
      (l) => String(l.user_id) === String(referred_user_id)
    );
    // If more than 1 lineup exists, this submission is not the first
    if (allUserLineups.length > 1) return;

    // Prevent duplicate reward creation
    const rewards = await getSheetData("Referral_Rewards");
    const existingReward = rewards.find(
      (r) =>
        r.referrer_user_id === referral.referrer_user_id &&
        r.referred_user_id === referred_user_id
    );
    if (existingReward) return;  // Reward already created

    // Check monthly velocity limit for the referrer
    const thisMonth = new Date();
    thisMonth.setDate(1);
    thisMonth.setHours(0, 0, 0, 0);
    const rewardsThisMonth = rewards.filter(
      (r) =>
        r.referrer_user_id === referral.referrer_user_id &&
        new Date(r.created_at) >= thisMonth
    ).length;
    if (rewardsThisMonth >= settings.maxPerMonth) {
      console.warn(`[ReferralReward] Velocity limit reached for referrer ${referral.referrer_user_id}`);
      return;
    }

    // All checks passed — create the reward record
    const reward_id = uuidv4();
    const now_iso   = new Date().toISOString();

    await appendRow("Referral_Rewards", {
      reward_id,
      referral_id:        referral.referrer_user_id,
      referrer_user_id:   referral.referrer_user_id,
      referred_user_id,
      reward_type:        "cash",
      reward_value:       settings.amountLrd,  // locked at creation time
      status:             "pending",
      created_at:         now_iso,
      reviewed_at:        "",
      paid_at:            "",
      admin_id:           "",
      payment_reference:  "",
      admin_notes:        "",
    });

    // Mark referral as qualified
    await updateRow("Referrals", "referrer_user_id", referral.referrer_user_id, {
      ...referral,
      status:       "Qualified",
      qualified_at: now_iso,
    });

    console.log(`[ReferralReward] Reward created: ${reward_id} for referrer ${referral.referrer_user_id}`);

    // Notify referrer: friend qualified
    const referrerUser   = users.find((u) => u.user_id === referral.referrer_user_id);
    const referredUser   = users.find((u) => u.user_id === referred_user_id);
    const referredMasked = maskName(referredUser?.display_name || referredUser?.full_name || "Your friend");

    if (referrerUser) {
      notificationEngine.dispatch({
        user_id:  referral.referrer_user_id,
        type:     "REFERRAL",
        title:    "🎉 Referral Qualified!",
        message:  `${referredMasked} submitted their first lineup. Your referral reward of LRD ${settings.amountLrd} is now under review.`,
        link:     "/referrals",
        priority: "normal",
        idempotencyKey: `REFERRAL_QUALIFIED:${referred_user_id}`, metadata: { event: "REFERRAL_QUALIFIED", reward_id },
      }).catch(() => {});
    }
  } catch (err: any) {
    const msg = err?.message || "Unknown error";
    console.error(
      `[ReferralReward] checkReferralQualification FAILED — user=${referred_user_id} week=${week_id}: ${msg}`
    );
    // Log to Admin_Actions_Log so production failures are visible in the admin dashboard
    logAdminAction({
      admin_id:    "system",
      action_type: "REFERRAL_QUALIFICATION_ERROR",
      entity_type: "REFERRAL",
      entity_id:   referred_user_id,
      details:     `Qualification check failed for user ${referred_user_id} (week ${week_id}): ${msg}`,
      status:      "failure",
    }).catch(() => { /* log failure must never propagate */ });
  }
}

// ─── Admin actions ────────────────────────────────────────────────────────

export async function approveReward(
  reward_id: string,
  admin_id: string,
  admin_notes = ""
): Promise<{ ok: boolean; error?: string }> {
  const rewards = await getSheetData("Referral_Rewards");
  const reward  = rewards.find((r) => r.reward_id === reward_id);
  if (!reward) return { ok: false, error: "Reward not found." };
  if (reward.status !== "pending")
    return { ok: false, error: `Cannot approve a reward in "${reward.status}" status.` };

  await updateRow("Referral_Rewards", "reward_id", reward_id, {
    ...reward,
    status:      "approved",
    reviewed_at: new Date().toISOString(),
    admin_id,
    admin_notes,
  });

  // Notify referrer
  const users  = await getSheetData("Users");
  const referrerUser = users.find((u) => u.user_id === reward.referrer_user_id);
  if (referrerUser) {
    notificationEngine.dispatch({
      user_id:  reward.referrer_user_id,
      type:     "REFERRAL",
      title:    "✅ Referral Reward Approved!",
      message:  `Your referral reward of LRD ${reward.reward_value} has been approved and will be paid shortly.`,
      link:     "/referrals",
      priority: "normal",
      idempotencyKey: `REFERRAL_APPROVED:${reward_id}`, metadata: { event: "REFERRAL_APPROVED", reward_id },
    }).catch(() => {});
  }

  return { ok: true };
}

export async function rejectReward(
  reward_id: string,
  admin_id: string,
  admin_notes: string
): Promise<{ ok: boolean; error?: string }> {
  const rewards = await getSheetData("Referral_Rewards");
  const reward  = rewards.find((r) => r.reward_id === reward_id);
  if (!reward) return { ok: false, error: "Reward not found." };
  if (!["pending", "approved"].includes(reward.status))
    return { ok: false, error: `Cannot reject a reward in "${reward.status}" status.` };

  await updateRow("Referral_Rewards", "reward_id", reward_id, {
    ...reward,
    status:      "rejected",
    reviewed_at: new Date().toISOString(),
    admin_id,
    admin_notes,
  });

  // No notification to user on rejection (privacy / anti-gaming)
  return { ok: true };
}

export async function markRewardPaid(
  reward_id: string,
  admin_id: string,
  payment_reference: string,
  admin_notes = ""
): Promise<{ ok: boolean; error?: string }> {
  if (!payment_reference?.trim())
    return { ok: false, error: "Payment reference is required." };

  const rewards = await getSheetData("Referral_Rewards");
  const reward  = rewards.find((r) => r.reward_id === reward_id);
  if (!reward) return { ok: false, error: "Reward not found." };
  if (reward.status !== "approved")
    return { ok: false, error: "Reward must be approved before marking paid." };

  const now = new Date().toISOString();
  await updateRow("Referral_Rewards", "reward_id", reward_id, {
    ...reward,
    status:            "paid",
    paid_at:           now,
    admin_id,
    payment_reference: payment_reference.trim(),
    admin_notes,
  });

  // Notify referrer: reward paid
  const users = await getSheetData("Users");
  const referrerUser = users.find((u) => u.user_id === reward.referrer_user_id);
  if (referrerUser) {
    notificationEngine.dispatch({
      user_id:  reward.referrer_user_id,
      type:     "REFERRAL",
      title:    "💰 Referral Reward Paid!",
      message:  `LRD ${reward.reward_value} has been sent to your mobile money account.`,
      link:     "/referrals",
      priority: "high",
      idempotencyKey: `REFERRAL_PAID:${reward_id}`, metadata: { event: "REFERRAL_PAID", reward_id, payment_reference },
    }).catch(() => {});
  }

  return { ok: true };
}

// ─── User-facing history ──────────────────────────────────────────────────

export async function getReferralRewardHistory(user_id: string) {
  const [referrals, rewards, users] = await Promise.all([
    getSheetData("Referrals"),
    getSheetData("Referral_Rewards"),
    getSheetData("Users"),
  ]);

  const userMap = new Map(users.map((u) => [u.user_id, u]));

  const myReferrals = referrals.filter((r) => r.referrer_user_id === user_id);

  const enriched = myReferrals.map((ref) => {
    const referred  = userMap.get(ref.referred_user_id);
    const reward    = rewards.find(
      (r) =>
        r.referrer_user_id === user_id &&
        r.referred_user_id === ref.referred_user_id
    );

    // Map internal status to user-friendly label
    let displayStatus: string;
    if (reward?.status === "paid")     displayStatus = "✅ Reward Paid";
    else if (reward?.status === "approved") displayStatus = "✅ Approved";
    else if (reward?.status === "pending")  displayStatus = "🕐 Under Review";
    else if (ref.status === "Qualified")    displayStatus = "🕐 Under Review";
    else if (ref.status === "Expired")      displayStatus = "❌ Expired";
    else                                    displayStatus = "⏳ Getting Started";

    return {
      display_name:    maskName(referred?.display_name || referred?.full_name || "Manager"),
      referral_date:   ref.referral_date,
      qualified_at:    ref.qualified_at || null,
      status:          displayStatus,
      reward_value:    reward?.status === "approved" || reward?.status === "paid"
                         ? Number(reward.reward_value)
                         : null,
    };
  }).sort(
    (a, b) => new Date(b.referral_date).getTime() - new Date(a.referral_date).getTime()
  );

  const totalEarned  = rewards.filter(
    (r) => r.referrer_user_id === user_id && r.status === "paid"
  ).reduce((sum, r) => sum + Number(r.reward_value || 0), 0);

  const pendingValue = rewards.filter(
    (r) => r.referrer_user_id === user_id && r.status === "approved"
  ).reduce((sum, r) => sum + Number(r.reward_value || 0), 0);

  return {
    referrals:   enriched,
    total:       enriched.length,
    total_earned: totalEarned,
    pending:     pendingValue,
  };
}
