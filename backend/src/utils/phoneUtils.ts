/**
 * phoneUtils.ts — AUTH-011
 *
 * Single source of truth for all phone number handling.
 * Used by: authRoutes, adminRoutes, any future phone-handling route.
 *
 * Canonical format: 10-digit Liberian local number beginning with 0
 * Example: 0887519817
 *
 * Sheet storage format: apostrophe-prefixed to prevent numeric coercion
 * Example: '0887519817
 */

const LIBERIA_COUNTRY_CODE = "231";

/**
 * Normalize any supported phone format to canonical local format.
 * Handles: apostrophe prefix, spaces, hyphens, +231 / 231 prefix,
 * missing leading zero, and existing canonical format.
 *
 * @example
 * normalizePhoneNumber("'0887519817") // "0887519817"
 * normalizePhoneNumber("+231887519817") // "0887519817"
 * normalizePhoneNumber("088 751 9817")  // "0887519817"
 */
export function normalizePhoneNumber(input: string): string {
  // Strip apostrophe (Google Sheets protection prefix)
  let cleaned = String(input || "").trim();
  if (cleaned.startsWith("'")) cleaned = cleaned.slice(1);

  // Remove all non-digit characters (spaces, hyphens, dots, +)
  let digits = cleaned.replace(/[^\d]/g, "");

  // Strip Liberian country code (with or without leading +)
  if (digits.startsWith(LIBERIA_COUNTRY_CODE)) {
    digits = digits.slice(LIBERIA_COUNTRY_CODE.length);
  }

  // Ensure canonical leading zero
  if (digits.length > 0 && !digits.startsWith("0")) {
    digits = `0${digits}`;
  }

  return digits;
}

/**
 * Strip the Google Sheets apostrophe protection prefix.
 * Safe to call on values that do not have the prefix.
 */
export function stripApostrophe(value: string): string {
  const str = String(value || "");
  return str.startsWith("'") ? str.slice(1) : str;
}

/**
 * Format a normalized phone number for storage in Google Sheets.
 * Adds the apostrophe prefix that prevents Google Sheets from
 * treating the number as a numeric value.
 */
export function formatPhoneForSheet(input: string): string {
  return `'${normalizePhoneNumber(input)}`;
}

/**
 * Normalize a phone number read from the Users sheet.
 * Combines stripApostrophe + normalizePhoneNumber in one call.
 * Use this when comparing a sheet value against user input.
 */
export function normalizeSheetPhone(sheetValue: string): string {
  return normalizePhoneNumber(stripApostrophe(String(sheetValue || "")));
}

/**
 * Validate that a normalized phone number looks like a valid
 * Liberian mobile number (9 or 10 digits starting with 0).
 */
export function isValidPhone(normalized: string): boolean {
  return /^0\d{8,9}$/.test(normalized);
}
