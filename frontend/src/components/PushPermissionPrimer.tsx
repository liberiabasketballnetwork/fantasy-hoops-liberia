"use client";

import { usePushNotifications } from "@/hooks/usePushNotifications";
import { usePWA } from "@/context/PWAContext";
import { useState } from "react";

/**
 * PushPermissionPrimer — PWA-003
 *
 * Two-step permission primer. Never shows the browser prompt directly —
 * shows this UI first, then triggers the browser prompt only if the user
 * explicitly taps "Enable Notifications".
 *
 * Conditions to show (all must be true):
 *  - hasTeam: user has submitted a lineup (engagement gate)
 *  - shouldShowPrimer() returns true (localStorage gates)
 *  - isOnline: no point subscribing offline
 *  - serviceWorker supported
 */
interface Props {
  hasTeam: boolean;
}

export default function PushPermissionPrimer({ hasTeam }: Props) {
  const { isOnline } = usePWA();
  const { shouldShowPrimer, subscribe, dismissPrimer, neverAsk, isLoading } = usePushNotifications();
  const [visible, setVisible] = useState(true);
  const [subscribed, setSubscribed] = useState(false);

  if (!visible)   return null;
  if (!hasTeam)   return null;
  if (!isOnline)  return null;
  if (!shouldShowPrimer()) return null;
  if (typeof window === "undefined" || !("Notification" in window)) return null;

  async function handleEnable() {
    const ok = await subscribe();
    if (ok) {
      setSubscribed(true);
      setTimeout(() => setVisible(false), 2000);
    } else {
      // Denied or error — dismiss and respect
      setVisible(false);
    }
  }

  function handleLater() {
    dismissPrimer();
    setVisible(false);
  }

  function handleNever() {
    neverAsk();
    setVisible(false);
  }

  if (subscribed) {
    return (
      <div className="card border-l-4 border-court-green p-4 flex items-center gap-3 animate-[fadeSlideIn_300ms_ease-out]">
        <span className="text-2xl">🔔</span>
        <p className="text-sm font-semibold text-court-green">Notifications enabled! You&apos;re all set.</p>
      </div>
    );
  }

  return (
    <div
      role="dialog"
      aria-label="Enable push notifications"
      className="card border-l-4 border-court-orange p-5 flex flex-col gap-4
                 animate-[fadeSlideIn_300ms_ease-out]"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="text-3xl">🔔</span>
          <div>
            <p className="font-bold text-sm">Stay in the game</p>
            <p className="text-xs text-gray-400 mt-0.5">
              Get instant alerts for results, badges, and league updates.
            </p>
          </div>
        </div>
        <button
          onClick={handleNever}
          aria-label="Dismiss notification prompt"
          className="text-gray-500 hover:text-gray-300 text-lg flex-shrink-0
                     focus:outline-none focus-visible:ring-2 focus-visible:ring-court-orange rounded"
        >
          ✕
        </button>
      </div>

      <ul className="flex flex-col gap-1 text-xs text-gray-400">
        <li>✓ Weekly results the moment they drop</li>
        <li>✓ Badges and achievements</li>
        <li>✓ Lineup deadline reminders</li>
        <li>✓ League champion alerts</li>
      </ul>

      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={handleEnable}
          disabled={isLoading}
          className="btn-primary text-sm disabled:opacity-50"
        >
          {isLoading ? "Setting up…" : "Enable Notifications"}
        </button>
        <button
          onClick={handleLater}
          className="text-xs text-gray-400 hover:text-gray-200 transition-colors
                     focus:outline-none focus-visible:ring-2 focus-visible:ring-court-orange rounded"
        >
          Maybe Later
        </button>
      </div>
    </div>
  );
}
