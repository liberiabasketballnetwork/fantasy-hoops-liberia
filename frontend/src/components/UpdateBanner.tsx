"use client";

import { usePWA } from "@/context/PWAContext";
import { usePathname } from "next/navigation";

/**
 * UpdateBanner — PWA-002
 *
 * Shows a non-intrusive banner when a new version of the app has been
 * deployed and the new service worker is waiting to take over.
 *
 * Guard: hidden on the players page to avoid interrupting lineup submission.
 */
export default function UpdateBanner() {
  const { updateAvailable, applyUpdate } = usePWA();
  const pathname = usePathname();

  // Never show during lineup submission — worst possible time for a reload
  const isLineupsPage = pathname === "/players";
  if (!updateAvailable || isLineupsPage) return null;

  return (
    <div
      role="status"
      aria-label="App update available"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50
                 flex items-center gap-3 bg-[#1f2733] border border-[#2a3441]
                 rounded-xl px-4 py-3 shadow-xl text-sm
                 animate-[fadeSlideIn_300ms_ease-out]"
    >
      <span className="text-court-orange text-lg">⚡</span>
      <span className="text-gray-200">New version available</span>
      <button
        onClick={applyUpdate}
        className="px-3 py-1 rounded-lg bg-court-orange text-white text-xs font-semibold
                   hover:opacity-90 transition-opacity focus:outline-none
                   focus-visible:ring-2 focus-visible:ring-court-orange"
      >
        Update Now
      </button>
    </div>
  );
}
