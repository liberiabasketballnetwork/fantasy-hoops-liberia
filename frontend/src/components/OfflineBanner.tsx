"use client";

import { usePWA } from "@/context/PWAContext";

/**
 * OfflineBanner — PWA-002
 *
 * Persistent banner shown at the top of the page whenever the device
 * has no network connection. Dismisses automatically when reconnected.
 */
export default function OfflineBanner() {
  const { isOnline } = usePWA();

  if (isOnline) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="w-full bg-[#1c1207] border-b border-yellow-700/50
                 px-4 py-2 flex items-center justify-center gap-2 text-sm text-yellow-400"
    >
      <span aria-hidden="true">⚡</span>
      <span>
        You&apos;re offline — some features are unavailable until you reconnect.
      </span>
    </div>
  );
}
