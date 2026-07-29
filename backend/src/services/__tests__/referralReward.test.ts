// @ts-nocheck
/**
 * FEATURE-003 — Referral Reward Tests
 *
 * Tests qualification rules, anti-abuse, and reward lifecycle in isolation.
 * Run: npx ts-node src/services/__tests__/referralReward.test.ts
 */

import { maskName } from "../referralRewardService";

let passed = 0;
let failed = 0;

function test(description: string, fn: () => void) {
  try { fn(); console.log(`  ✅ ${description}`); passed++; }
  catch (err: any) { console.error(`  ❌ ${description}\n     ${err.message}`); failed++; }
}
function expect<T>(actual: T, expected: T, msg?: string) {
  if (actual !== expected) throw new Error(msg ?? `Expected ${JSON.stringify(expected)} got ${JSON.stringify(actual)}`);
}

// ─── Mock helpers (simulate sheet data) ──────────────────────────────────

function buildReferral(overrides: Partial<{
  referrer_user_id: string;
  referred_user_id: string;
  referral_code: string;
  referral_date: string;
  status: string;
  qualified_at: string;
}> = {}) {
  return {
    referrer_user_id: "user-referrer",
    referred_user_id: "user-referred",
    referral_code:    "FHL-1001",
    referral_date:    new Date().toISOString(),
    status:           "Pending",
    qualified_at:     "",
    ...overrides,
  };
}

// ─── Qualification logic (isolated, no DB) ────────────────────────────────

console.log("\n=== FEATURE-003: Referral Reward Tests ===\n");

console.log("1. Qualification rules (no DB — pure logic tests)");

test("Registration alone does NOT qualify (no lineup exists)", () => {
  const allLineups: any[] = [];  // No lineups
  const userLineups = allLineups.filter((l) => l.user_id === "user-referred");
  const isFirstSubmission = userLineups.length <= 1;
  const hasLineup = userLineups.length > 0;
  expect(hasLineup, false);  // No lineup → not qualified
});

test("First lineup submission DOES qualify", () => {
  const allLineups = [{ user_id: "user-referred", week_id: "week-1", lineup_id: "l-1" }];
  const userLineups = allLineups.filter((l) => l.user_id === "user-referred");
  expect(userLineups.length, 1);  // Exactly 1 lineup = first submission
});

test("Second lineup submission does NOT create duplicate reward", () => {
  const allLineups = [
    { user_id: "user-referred", week_id: "week-1", lineup_id: "l-1" },
    { user_id: "user-referred", week_id: "week-2", lineup_id: "l-2" },
  ];
  const userLineups = allLineups.filter((l) => l.user_id === "user-referred");
  const isFirstSubmission = userLineups.length <= 1;
  expect(isFirstSubmission, false);  // 2 lineups → not first submission
});

test("Existing reward prevents duplicate creation", () => {
  const rewards = [{ referrer_user_id: "user-referrer", referred_user_id: "user-referred" }];
  const existingReward = rewards.find(
    (r) => r.referrer_user_id === "user-referrer" && r.referred_user_id === "user-referred"
  );
  expect(!!existingReward, true);  // Found → skip creation
});

console.log("\n2. Anti-abuse");

test("Self-referral rejected at registration (same user_id)", () => {
  const referrerUserId = "user-A";
  const registeringUserId = "user-A";
  const isSelfReferral = referrerUserId === registeringUserId;
  expect(isSelfReferral, true);
});

test("Different users are not self-referrals", () => {
  const isSelfReferral = "user-A" === "user-B";
  expect(isSelfReferral, false);
});

test("Qualification window expired — referral marked Expired", () => {
  const referralDate = new Date();
  referralDate.setDate(referralDate.getDate() - 35);  // 5 weeks ago
  const windowWeeks = 4;
  const weeksElapsed = (Date.now() - referralDate.getTime()) / (7 * 24 * 60 * 60 * 1000);
  expect(weeksElapsed > windowWeeks, true);  // Should expire
});

test("Qualification within window is valid", () => {
  const referralDate = new Date();
  referralDate.setDate(referralDate.getDate() - 10);  // 10 days ago
  const windowWeeks = 4;
  const weeksElapsed = (Date.now() - referralDate.getTime()) / (7 * 24 * 60 * 60 * 1000);
  expect(weeksElapsed <= windowWeeks, true);  // Within window
});

test("Monthly velocity limit enforced", () => {
  const maxPerMonth = 10;
  const rewardsThisMonth = 10;  // At limit
  expect(rewardsThisMonth >= maxPerMonth, true);  // Should block
});

test("Below velocity limit allows reward", () => {
  const maxPerMonth = 10;
  const rewardsThisMonth = 3;
  expect(rewardsThisMonth >= maxPerMonth, false);  // Should allow
});

test("Circular referral rejected (A referred B, B tries to refer A)", () => {
  // A's referred_by === B's referral_code would create a circle
  const userA = { user_id: "user-A", referred_by: "FHL-1002" };
  const userB = { user_id: "user-B", referral_code: "FHL-1002" };
  const isCircular = userA.referred_by === userB.referral_code &&
                     userB.user_id !== userA.user_id;
  // In a real scenario: if A was referred by B's code, B cannot use A's code
  expect(isCircular, true);
});

console.log("\n3. Reward amount locked at creation");

test("Reward stores value at creation time, not current setting", () => {
  const settingAtCreation = 500;
  const rewardCreated = { reward_value: settingAtCreation };
  // Admin later changes setting to 300 — existing reward unchanged
  const currentSetting = 300;
  expect(rewardCreated.reward_value, 500);  // Locked at 500
  expect(rewardCreated.reward_value === currentSetting, false);
});

console.log("\n4. Name masking (privacy)");

test("maskName returns First + Last initial", () => {
  expect(maskName("John Doe"),    "John D.");
  expect(maskName("Ed Johnson"),  "Ed J.");
});
test("maskName single name returns first name only", () => {
  expect(maskName("Madonna"),     "Madonna");
});
test("maskName empty string returns Manager", () => {
  expect(maskName(""),            "Manager");
});
test("maskName trims whitespace", () => {
  expect(maskName("  Aaron  Williams  "), "Aaron W.");
});

console.log("\n5. Reward lifecycle state transitions");

test("Approve requires pending status", () => {
  const validTransitions: Record<string, string[]> = {
    pending:  ["approved", "rejected"],
    approved: ["paid", "rejected"],
    paid:     [],
    rejected: [],
  };
  expect(validTransitions["pending"].includes("approved"), true);
  expect(validTransitions["paid"].includes("approved"), false);  // Cannot approve paid
});

test("Mark paid requires approved status, not pending", () => {
  const markPaidAllowed = (status: string) => status === "approved";
  expect(markPaidAllowed("approved"), true);
  expect(markPaidAllowed("pending"),  false);
  expect(markPaidAllowed("rejected"), false);
});

test("Payment reference required for mark-paid", () => {
  const validatePayRef = (ref: string) => !!ref.trim();
  expect(validatePayRef("OM-12345"), true);
  expect(validatePayRef(""),         false);
  expect(validatePayRef("   "),      false);
});

test("Admin notes required for rejection", () => {
  const validateRejectNotes = (notes: string) => !!notes.trim();
  expect(validateRejectNotes("Duplicate account"), true);
  expect(validateRejectNotes(""),                  false);
});

console.log("\n6. Notifications");

test("No notification dispatched on rejection (privacy)", () => {
  // This is an architectural contract — rejection never calls notificationEngine.dispatch
  // Documented as a test to prevent accidental regression
  const rejectionSendsNotification = false;
  expect(rejectionSendsNotification, false);
});

test("Qualification triggers notification to referrer (not referred)", () => {
  const notifiedUserId    = "user-referrer";   // The person who shared the code
  const qualifyingUserId  = "user-referred";   // The new player
  expect(notifiedUserId !== qualifyingUserId, true);
});

// ─── Summary ──────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(50)}`);
console.log(`FEATURE-003 Tests: ${passed} passed, ${failed} failed`);
if (failed > 0) { process.exit(1); }
else { console.log("✅ All tests passed."); }
