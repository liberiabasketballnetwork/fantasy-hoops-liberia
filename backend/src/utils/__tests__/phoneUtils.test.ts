/**
 * AUTH-011 — Phone Normalization Tests
 *
 * Run: npx ts-node src/utils/__tests__/phoneUtils.test.ts
 */

import { normalizePhoneNumber, normalizeSheetPhone, formatPhoneForSheet, stripApostrophe, isValidPhone } from "../phoneUtils";

// ─── Test runner ──────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(description: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✅ ${description}`);
    passed++;
  } catch (err: any) {
    console.error(`  ❌ ${description}\n     ${err.message}`);
    failed++;
  }
}

function expect(actual: any, expected: any) {
  if (actual !== expected) {
    throw new Error(`Expected "${expected}" but got "${actual}"`);
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────

console.log("\n=== AUTH-011: Phone Normalization Tests ===\n");

console.log("1. All supported formats normalize to the same canonical value");
const CANONICAL = "0887519817";
const formats = [
  "'0887519817",   // Sheet apostrophe format
  "0887519817",    // Plain local
  "887519817",     // Missing leading zero
  "+231887519817", // International E.164
  "231887519817",  // Country code without +
  "088 751 9817",  // Spaces
  "0887-519-817",  // Hyphens
  " 0887519817 ",  // Surrounding whitespace
];
formats.forEach(f => {
  test(`normalizeSheetPhone("${f}") === "${CANONICAL}"`, () => {
    expect(normalizeSheetPhone(f), CANONICAL);
  });
});

console.log("\n2. normalizePhoneNumber (no apostrophe prefix)");
test(`normalizePhoneNumber("0887519817") === "0887519817"`, () => {
  expect(normalizePhoneNumber("0887519817"), "0887519817");
});
test(`normalizePhoneNumber("+231887519817") === "0887519817"`, () => {
  expect(normalizePhoneNumber("+231887519817"), "0887519817");
});
test(`normalizePhoneNumber("887519817") === "0887519817"`, () => {
  expect(normalizePhoneNumber("887519817"), "0887519817");
});

console.log("\n3. stripApostrophe");
test(`stripApostrophe("'0887519817") === "0887519817"`, () => {
  expect(stripApostrophe("'0887519817"), "0887519817");
});
test(`stripApostrophe("0887519817") === "0887519817"`, () => {
  expect(stripApostrophe("0887519817"), "0887519817");
});
test(`stripApostrophe("") === ""`, () => {
  expect(stripApostrophe(""), "");
});

console.log("\n4. formatPhoneForSheet");
test(`formatPhoneForSheet("0887519817") === "'0887519817"`, () => {
  expect(formatPhoneForSheet("0887519817"), "'0887519817");
});
test(`formatPhoneForSheet("+231887519817") === "'0887519817"`, () => {
  expect(formatPhoneForSheet("+231887519817"), "'0887519817");
});
test(`formatPhoneForSheet("887519817") === "'0887519817"`, () => {
  expect(formatPhoneForSheet("887519817"), "'0887519817");
});

console.log("\n5. isValidPhone");
test(`isValidPhone("0887519817") === true`, () => {
  expect(isValidPhone("0887519817"), true);
});
test(`isValidPhone("0776123456") === true (9 digits with leading 0)`, () => {
  expect(isValidPhone("0776123456"), true);
});
test(`isValidPhone("") === false`, () => {
  expect(isValidPhone(""), false);
});
test(`isValidPhone("12345") === false (too short)`, () => {
  expect(isValidPhone("12345"), false);
});

console.log("\n6. Duplicate detection simulation");
test("All 7 input formats produce the same key — duplicate would be caught", () => {
  const seen = new Set<string>();
  const incoming = formats.map(f => normalizeSheetPhone(f));
  incoming.forEach(n => seen.add(n));
  // All normalize to CANONICAL → only 1 unique key → duplicate detected
  expect(seen.size, 1);
});

test("Two different phone numbers produce different keys", () => {
  const seen = new Set<string>();
  seen.add(normalizePhoneNumber("0887519817"));
  seen.add(normalizePhoneNumber("0776123456"));
  expect(seen.size, 2);
});

console.log("\n7. Edge cases");
test("Empty string does not throw", () => {
  const result = normalizePhoneNumber("");
  expect(typeof result, "string");
});
test("null-like value does not throw", () => {
  const result = normalizeSheetPhone(undefined as any);
  expect(typeof result, "string");
});
test("Sheet apostrophe on international format normalizes correctly", () => {
  expect(normalizeSheetPhone("'+231887519817"), "0887519817");
});

// ─── Summary ──────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(45)}`);
console.log(`AUTH-011 Tests: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error("❌ Some tests failed.");
  process.exit(1);
} else {
  console.log("✅ All tests passed.");
}
