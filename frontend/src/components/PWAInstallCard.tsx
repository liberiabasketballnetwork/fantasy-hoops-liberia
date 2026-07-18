"use client";

import { useEffect, useState } from "react";
import { usePWA } from "@/context/PWAContext";
import { usePWAInstall } from "@/hooks/usePWAInstall";

// ─── Chromium install card ────────────────────────────────────────────────────

function ChromiumCard({ onInstall, onLater, onDismiss }: {
  onInstall: () => void;
  onLater: () => void;
  onDismiss: () => void;
}) {
  return (
    <div
      role="status"
      aria-label="Install Fantasy Hoops Liberia"
      className="card border-l-4 border-court-orange p-5 flex flex-col gap-4
                 animate-[fadeSlideIn_300ms_ease-out]"
    >
      <div className="flex items-start justify-between gap-4">
        {/* Icon + heading */}
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/icon-192.png"
            alt="Fantasy Hoops Liberia app icon"
            width={48}
            height={48}
            className="rounded-xl flex-shrink-0"
            onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
          />
          <div>
            <p className="font-bold text-sm leading-tight">Install Fantasy Hoops</p>
            <p className="text-xs text-gray-400 mt-0.5">
              Launch with one tap from your home screen.
            </p>
          </div>
        </div>
        {/* Dismiss ✕ */}
        <button
          onClick={onDismiss}
          aria-label="Dismiss install prompt"
          className="text-gray-500 hover:text-gray-300 text-lg leading-none flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-court-orange rounded"
        >
          ✕
        </button>
      </div>

      {/* Benefits */}
      <ul className="flex flex-col gap-1 text-xs text-gray-400">
        <li>✓ One-tap access from your home screen</li>
        <li>✓ Faster loading — no browser chrome</li>
        <li>✓ Never miss lineup deadlines or leaderboard updates</li>
      </ul>

      {/* CTAs */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={onInstall}
          className="btn-primary text-sm"
        >
          Install App
        </button>
        <button
          onClick={onLater}
          className="text-xs text-gray-400 hover:text-gray-200 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-court-orange rounded"
        >
          Maybe Later
        </button>
      </div>
    </div>
  );
}

// ─── iOS instruction card ─────────────────────────────────────────────────────

function IOSCard({ onGotIt, onLater, onDismiss }: {
  onGotIt: () => void;
  onLater: () => void;
  onDismiss: () => void;
}) {
  return (
    <div
      role="status"
      aria-label="Add Fantasy Hoops Liberia to your Home Screen"
      className="card border-l-4 border-court-orange p-5 flex flex-col gap-4
                 animate-[fadeSlideIn_300ms_ease-out]"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/icon-192.png"
            alt="Fantasy Hoops Liberia app icon"
            width={48}
            height={48}
            className="rounded-xl flex-shrink-0"
            onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
          />
          <div>
            <p className="font-bold text-sm leading-tight">Add to Home Screen</p>
            <p className="text-xs text-gray-400 mt-0.5">Install Fantasy Hoops on your iPhone.</p>
          </div>
        </div>
        <button
          onClick={onDismiss}
          aria-label="Dismiss install prompt"
          className="text-gray-500 hover:text-gray-300 text-lg leading-none flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-court-orange rounded"
        >
          ✕
        </button>
      </div>

      {/* iOS instructions */}
      <ol className="flex flex-col gap-2 text-xs text-gray-300">
        <li className="flex items-center gap-2">
          <span className="w-5 h-5 rounded-full bg-court-orange text-white text-center text-[10px] font-bold leading-5 flex-shrink-0">1</span>
          Tap the <strong>Share</strong> button <span className="text-court-orange">↑</span> at the bottom of Safari
        </li>
        <li className="flex items-center gap-2">
          <span className="w-5 h-5 rounded-full bg-court-orange text-white text-center text-[10px] font-bold leading-5 flex-shrink-0">2</span>
          Scroll down and tap <strong>Add to Home Screen</strong>
        </li>
        <li className="flex items-center gap-2">
          <span className="w-5 h-5 rounded-full bg-court-orange text-white text-center text-[10px] font-bold leading-5 flex-shrink-0">3</span>
          Tap <strong>Add</strong> in the top right corner
        </li>
      </ol>

      {/* CTAs */}
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={onGotIt} className="btn-primary text-sm">Got It</button>
        <button
          onClick={onLater}
          className="text-xs text-gray-400 hover:text-gray-200 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-court-orange rounded"
        >
          Maybe Later
        </button>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface PWAInstallCardProps {
  /** Signals that the user has submitted a lineup — gates the prompt. */
  hasTeam: boolean;
}

export default function PWAInstallCard({ hasTeam }: PWAInstallCardProps) {
  const { canInstall, isInstalled, isIOS, triggerInstall } = usePWA();
  const { shouldShow, dismissSoft, dismissForever, markInstalled, getDismissalCount } =
    usePWAInstall();

  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Wait 3 seconds then evaluate all conditions
    const timer = setTimeout(() => {
      if (
        hasTeam &&
        !isInstalled &&
        (canInstall || isIOS) &&
        shouldShow()
      ) {
        setVisible(true);
      }
    }, 3000);
    return () => clearTimeout(timer);
  // Re-evaluate if these change (e.g. install completes while timer is running)
  }, [hasTeam, isInstalled, canInstall, isIOS]); // eslint-disable-line react-hooks/exhaustive-deps

  // Hide immediately if installed mid-session
  useEffect(() => {
    if (isInstalled) setVisible(false);
  }, [isInstalled]);

  if (!visible) return null;

  // ── Handlers ───────────────────────────────────────────────────────────────

  async function handleInstall() {
    const outcome = await triggerInstall();
    if (outcome === "accepted") {
      markInstalled();
      setVisible(false);
    }
    // If dismissed in native prompt, keep card visible — user may reconsider
  }

  function handleLater() {
    dismissSoft();
    setVisible(false);
  }

  function handleDismiss() {
    // Third dismissal or ✕ press — become permanent
    const count = getDismissalCount();
    if (count >= 2) {
      dismissForever();
    } else {
      dismissSoft();
    }
    setVisible(false);
  }

  function handleIOSGotIt() {
    // iOS can't confirm install programmatically — treat as installed
    markInstalled();
    setVisible(false);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (isIOS) {
    return (
      <IOSCard
        onGotIt={handleIOSGotIt}
        onLater={handleLater}
        onDismiss={handleDismiss}
      />
    );
  }

  return (
    <ChromiumCard
      onInstall={handleInstall}
      onLater={handleLater}
      onDismiss={handleDismiss}
    />
  );
}
