/**
 * Display name validation rules for Fantasy Hoops Liberia.
 * Shared by registration, profile update, and admin edit flows.
 *
 * Rules:
 *  - Required
 *  - Max 32 characters
 *  - Allowed characters: letters, numbers, spaces, underscore, hyphen
 *  - Trim leading/trailing spaces before validation
 *  - Case-insensitive uniqueness
 *  - Reserved names blocked (case-insensitive)
 */

const RESERVED_NAMES = [
  "admin",
  "administrator",
  "fantasy hoops",
  "fantasy hoops liberia",
  "liberia basketball network",
  "lbn",
  "system",
  "moderator",
  "support",
];

const ALLOWED_PATTERN = /^[a-zA-Z0-9 _-]+$/;

export interface DisplayNameValidationResult {
  valid: boolean;
  error?: string;
  trimmed?: string;
}

export function validateDisplayName(raw: string): DisplayNameValidationResult {
  const trimmed = (raw || "").trim();

  if (!trimmed) {
    return { valid: false, error: "Display name is required." };
  }

  if (trimmed.length > 32) {
    return { valid: false, error: "Display name must be 32 characters or fewer." };
  }

  if (!ALLOWED_PATTERN.test(trimmed)) {
    return {
      valid: false,
      error:
        "Display name can only contain letters, numbers, spaces, underscores (_) and hyphens (-).",
    };
  }

  const lower = trimmed.toLowerCase();
  if (RESERVED_NAMES.includes(lower)) {
    return {
      valid: false,
      error: `"${trimmed}" is a reserved name and cannot be used.`,
    };
  }

  return { valid: true, trimmed };
}

/**
 * Checks whether a display name is already taken by another user.
 * Pass current user's user_id to exclude their own existing name when editing.
 */
export function isDisplayNameTaken(
  candidateName: string,
  allUsers: Record<string, any>[],
  excludeUserId?: string
): boolean {
  const lower = candidateName.trim().toLowerCase();
  return allUsers.some(
    (u) =>
      String(u.user_id) !== String(excludeUserId) &&
      String(u.display_name || "").trim().toLowerCase() === lower
  );
}
