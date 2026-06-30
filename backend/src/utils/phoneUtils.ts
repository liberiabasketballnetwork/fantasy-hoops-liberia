/**
 * Phone number helpers for Fantasy Hoops Liberia.
 *
 * Background: Google Sheets auto-converts numeric-looking text into actual
 * numbers, which silently strips a leading zero (e.g. "0881465193" becomes
 * 881465193). The existing workaround - prefixing the value with a leading
 * apostrophe before writing it (e.g. "'0881465193") - tells Sheets "store
 * this as text," and Sheets does not persist the apostrophe itself in the
 * cell's actual value. That existing behavior is preserved unchanged here;
 * this module only adds normalization on top of it.
 */

const LIBERIA_COUNTRY_CODE = "231";

/**
 * Normalizes any reasonable phone number input (with or without a leading
 * "+231" country code, with or without spaces/dashes) into the local
 * format starting with a leading zero, e.g.:
 *   "+231881465193" -> "0881465193"
 *   "231881465193"  -> "0881465193"
 *   "0881465193"    -> "0881465193"
 *   "881465193"     -> "0881465193"
 */
export function normalizePhoneNumber(input: string): string {
  let digits = String(input || "").replace(/[^\d]/g, "");

  if (digits.startsWith(LIBERIA_COUNTRY_CODE)) {
    digits = digits.slice(LIBERIA_COUNTRY_CODE.length);
  }

  if (!digits.startsWith("0")) {
    digits = `0${digits}`;
  }

  return digits;
}

/**
 * Removes a leading apostrophe from a value read back from Google Sheets,
 * if present. Sheets itself does not normally persist the apostrophe in
 * the cell's value (it's purely a "force text" formatting marker), but
 * this strips it defensively in case it's ever present - e.g. from a
 * manually-edited cell, an imported CSV, or any other edge case - so
 * comparisons never break either way.
 */
export function stripApostrophe(value: string): string {
  const str = String(value || "");
  return str.startsWith("'") ? str.slice(1) : str;
}

/**
 * Normalizes a phone number AND prefixes it with the leading apostrophe
 * Google Sheets needs to preserve the leading zero. Use this any time a
 * phone number is about to be written to the Users sheet.
 *   formatPhoneForSheet("+231881465193") -> "'0881465193"
 */
export function formatPhoneForSheet(input: string): string {
  return `'${normalizePhoneNumber(input)}`;
}
