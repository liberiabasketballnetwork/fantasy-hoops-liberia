const LIBERIA_COUNTRY_CODE = "231";

export function normalizePhoneNumber(input: string): string {
  let digits = String(input || "").replace(/[^\d]/g, "");
  if (digits.startsWith(LIBERIA_COUNTRY_CODE)) digits = digits.slice(LIBERIA_COUNTRY_CODE.length);
  if (!digits.startsWith("0")) digits = `0${digits}`;
  return digits;
}

export function stripApostrophe(value: string): string {
  const str = String(value || "");
  return str.startsWith("'") ? str.slice(1) : str;
}

export function formatPhoneForSheet(input: string): string {
  return `'${normalizePhoneNumber(input)}`;
}
