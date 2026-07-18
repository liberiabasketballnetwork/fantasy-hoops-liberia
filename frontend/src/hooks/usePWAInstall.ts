/**
 * usePWAInstall — INSTALL-001
 *
 * Manages install prompt dismissal state in localStorage.
 * All localStorage operations are wrapped in try/catch for private-browsing safety.
 */

const KEYS = {
  DISMISSED_AT:    "pwa_install_dismissed_at",
  DISMISSED_COUNT: "pwa_install_dismissed_count",
  NEVER:           "pwa_install_never",
  INSTALLED:       "pwa_installed",
} as const;

const MAX_SOFT_DISMISSALS = 2;
export const INSTALL_REMINDER_DAYS = 7;

// ─── localStorage helpers ─────────────────────────────────────────────────────

function lsGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

function lsSet(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* private browsing — silently ignore */ }
}

function lsRemove(key: string): void {
  try { localStorage.removeItem(key); } catch { /* ignore */ }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function usePWAInstall() {

  /** Whether the install card should currently be shown. */
  function shouldShow(): boolean {
    // Permanent dismissal
    if (lsGet(KEYS.NEVER) === "true") return false;
    // Already installed (confirmed by appinstalled or manual flag)
    if (lsGet(KEYS.INSTALLED) === "true") return false;

    // Soft dismissal — check if reminder period has expired
    const dismissedAt = lsGet(KEYS.DISMISSED_AT);
    if (dismissedAt) {
      const daysSince =
        (Date.now() - Number(dismissedAt)) / (1000 * 60 * 60 * 24);
      if (daysSince < INSTALL_REMINDER_DAYS) return false;
      // Period expired — clear the timestamp so the card can reappear
      lsRemove(KEYS.DISMISSED_AT);
    }

    return true;
  }

  /**
   * User chose "Maybe Later".
   * Increments dismissal count. On the third dismissal, becomes permanent.
   */
  function dismissSoft(): void {
    const count = Number(lsGet(KEYS.DISMISSED_COUNT) ?? "0") + 1;
    if (count > MAX_SOFT_DISMISSALS) {
      // Third dismissal → permanent
      dismissForever();
      return;
    }
    lsSet(KEYS.DISMISSED_COUNT, String(count));
    lsSet(KEYS.DISMISSED_AT, String(Date.now()));
  }

  /** User chose "Don't show again" or ✕ on the third dismissal. */
  function dismissForever(): void {
    lsSet(KEYS.NEVER, "true");
  }

  /** Called after install is confirmed (appinstalled or iOS "Got it"). */
  function markInstalled(): void {
    lsSet(KEYS.INSTALLED, "true");
    // Clean up dismissal state — no longer needed
    lsRemove(KEYS.DISMISSED_AT);
    lsRemove(KEYS.DISMISSED_COUNT);
    lsRemove(KEYS.NEVER);
  }

  /** Current dismissal count (0–MAX). */
  function getDismissalCount(): number {
    return Number(lsGet(KEYS.DISMISSED_COUNT) ?? "0");
  }

  return { shouldShow, dismissSoft, dismissForever, markInstalled, getDismissalCount };
}
