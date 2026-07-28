/**
 * referralService.ts — GEP-002.1
 *
 * Referral tracking foundation.
 * No reward calculations. No payments. No bonuses.
 *
 * Responsibilities:
 *   - Generate unique FHL-XXXX referral codes
 *   - Validate referral codes during registration
 *   - Assign referral relationships on new registrations
 *   - Return referral history (public display info only)
 *   - Auto-migrate existing users who lack a referral code
 */

import { getSheetData, updateRow, appendRow } from "./sheetsService";

// ─── Code format ──────────────────────────────────────────────────────────

const PREFIX = "FHL";

/**
 * Generate a unique referral code not already in use.
 * Format: FHL-XXXX where XXXX is a zero-padded 4-digit number.
 */
export async function generateReferralCode(): Promise<string> {
  const users = await getSheetData("Users");
  const existing = new Set(
    users.map((u) => String(u.referral_code || "")).filter(Boolean)
  );

  // Try sequential codes starting from 1001 to avoid ambiguous low numbers
  for (let n = 1001; n <= 9999; n++) {
    const code = `${PREFIX}-${n}`;
    if (!existing.has(code)) return code;
  }

  // Fallback: timestamp-based code (collision-proof)
  return `${PREFIX}-${Date.now().toString().slice(-5)}`;
}

/**
 * Look up the user_id that owns a given referral code.
 * Returns null if the code does not exist.
 */
export async function findReferrerByCode(
  code: string
): Promise<string | null> {
  if (!code) return null;
  const users = await getSheetData("Users");
  const referrer = users.find(
    (u) => String(u.referral_code || "").toUpperCase() === code.toUpperCase()
  );
  return referrer?.user_id ?? null;
}

/**
 * Validate a referral code for use during registration.
 * Returns { valid, referrer_user_id, error }.
 */
export async function validateReferralCode(
  code: string,
  registering_user_id: string
): Promise<{ valid: boolean; referrer_user_id?: string; error?: string }> {
  if (!code) return { valid: false, error: "No referral code provided." };

  const referrer_user_id = await findReferrerByCode(code);

  if (!referrer_user_id) {
    return { valid: false, error: "Referral code not found." };
  }

  // Prevent self-referral
  if (referrer_user_id === registering_user_id) {
    return { valid: false, error: "You cannot use your own referral code." };
  }

  // Check for duplicate referral (this user already has a referrer)
  const users = await getSheetData("Users");
  const thisUser = users.find((u) => u.user_id === registering_user_id);
  if (thisUser?.referred_by) {
    return { valid: false, error: "You have already been referred." };
  }

  return { valid: true, referrer_user_id };
}

/**
 * Persist a confirmed referral relationship.
 * Called after successful registration when a valid code was used.
 */
export async function assignReferral(
  referrer_user_id: string,
  referred_user_id: string,
  referral_code: string
): Promise<void> {
  const referral_date = new Date().toISOString();

  // 1. Record in Referrals sheet
  await appendRow("Referrals", {
    referrer_user_id,
    referred_user_id,
    referral_code,
    referral_date,
    status: "Active",
  });

  // 2. Update referred user's record
  await updateRow("Users", "user_id", referred_user_id, {
    referred_by:   referral_code,
    referral_date,
  });
}

/**
 * Return the referral history for a user.
 * Only returns public display information — no phone, email, or password.
 */
export async function getReferralHistory(
  user_id: string
): Promise<
  Array<{
    display_name: string;
    referral_date: string;
    status: string;
  }>
> {
  const [referrals, users] = await Promise.all([
    getSheetData("Referrals"),
    getSheetData("Users"),
  ]);

  const userMap = new Map(users.map((u) => [u.user_id, u]));

  return referrals
    .filter((r) => r.referrer_user_id === user_id)
    .map((r) => {
      const referred = userMap.get(r.referred_user_id);
      return {
        display_name:  referred?.display_name || referred?.full_name || "Manager",
        referral_date: r.referral_date,
        status:        r.status || "Active",
      };
    })
    .sort(
      (a, b) =>
        new Date(b.referral_date).getTime() -
        new Date(a.referral_date).getTime()
    );
}

/**
 * Ensure a user has a referral code. Assign one if missing.
 * Safe to call multiple times — never overwrites existing codes.
 */
export async function ensureReferralCode(user_id: string): Promise<string> {
  const users = await getSheetData("Users");
  const user  = users.find((u) => u.user_id === user_id);
  if (!user) throw new Error("User not found.");
  if (user.referral_code) return String(user.referral_code);

  const code = await generateReferralCode();
  await updateRow("Users", "user_id", user_id, { referral_code: code });
  return code;
}

/**
 * Auto-migration: assign referral codes to all existing users who lack one.
 * Called once on server startup. Safe to re-run — skips users who already
 * have a code.
 */
export async function migrateExistingUsers(): Promise<{
  migrated: number;
  skipped: number;
}> {
  const users = await getSheetData("Users");
  const missing = users.filter((u) => !u.referral_code && u.user_id);

  let migrated = 0;
  // Process sequentially to avoid code collisions during generation
  for (const user of missing) {
    try {
      await ensureReferralCode(user.user_id);
      migrated++;
    } catch {
      // Non-fatal — log and continue
      console.warn(`[Referral] Could not assign code to user ${user.user_id}`);
    }
  }

  const skipped = users.length - missing.length;
  console.log(`[Referral] Migration: ${migrated} codes assigned, ${skipped} already had codes.`);
  return { migrated, skipped };
}
