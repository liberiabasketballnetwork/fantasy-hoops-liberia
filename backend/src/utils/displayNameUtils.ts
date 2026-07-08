const RESERVED_NAMES = ["admin","administrator","fantasy hoops","fantasy hoops liberia","liberia basketball network","lbn","system","moderator","support"];
const ALLOWED_PATTERN = /^[a-zA-Z0-9 _-]+$/;

export interface DisplayNameValidationResult { valid: boolean; error?: string; trimmed?: string; }

export function validateDisplayName(raw: string): DisplayNameValidationResult {
  const trimmed = (raw || "").trim();
  if (!trimmed) return { valid: false, error: "Display name is required." };
  if (trimmed.length > 32) return { valid: false, error: "Display name must be 32 characters or fewer." };
  if (!ALLOWED_PATTERN.test(trimmed)) return { valid: false, error: "Display name can only contain letters, numbers, spaces, underscores (_) and hyphens (-)." };
  if (RESERVED_NAMES.includes(trimmed.toLowerCase())) return { valid: false, error: `"${trimmed}" is a reserved name and cannot be used.` };
  return { valid: true, trimmed };
}

export function isDisplayNameTaken(candidateName: string, allUsers: Record<string, any>[], excludeUserId?: string): boolean {
  const lower = candidateName.trim().toLowerCase();
  return allUsers.some((u) => String(u.user_id) !== String(excludeUserId) && String(u.display_name || "").trim().toLowerCase() === lower);
}
