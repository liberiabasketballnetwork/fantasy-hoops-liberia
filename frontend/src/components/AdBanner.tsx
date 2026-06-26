"use client";

import { useEffect, useState } from "react";
import Script from "next/script";

const ADSENSE_CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT || "";
const ADSENSE_SLOTS = (process.env.NEXT_PUBLIC_ADSENSE_SLOTS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const ROTATE_INTERVAL_MS = 20000; // rotate to the next ad slot every 20s

/**
 * Renders a rotating AdSense banner. Set NEXT_PUBLIC_ADSENSE_CLIENT to your
 * AdSense publisher ID (e.g. "ca-pub-1234567890123456") and
 * NEXT_PUBLIC_ADSENSE_SLOTS to one or more ad slot IDs, comma-separated, to
 * enable this. If NEXT_PUBLIC_ADSENSE_CLIENT is not set, nothing renders and
 * the AdSense script never loads — so users see zero extra load when ads
 * aren't configured.
 */
export default function AdBanner() {
  const [slotIndex, setSlotIndex] = useState(0);
  const [scriptLoaded, setScriptLoaded] = useState(false);

  useEffect(() => {
    if (ADSENSE_SLOTS.length <= 1) return;
    const interval = setInterval(() => {
      setSlotIndex((i) => (i + 1) % ADSENSE_SLOTS.length);
    }, ROTATE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!scriptLoaded) return;
    try {
      // @ts-ignore - adsbygoogle is injected globally by the AdSense script
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (e) {
      // AdSense occasionally throws if called before the script fully settles -
      // safe to ignore, the ad slot just won't fill on this rotation.
    }
  }, [scriptLoaded, slotIndex]);

  if (!ADSENSE_CLIENT || ADSENSE_SLOTS.length === 0) return null;

  const currentSlot = ADSENSE_SLOTS[slotIndex];

  return (
    <div className="w-full flex justify-center py-2">
      <Script
        async
        src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`}
        crossOrigin="anonymous"
        strategy="lazyOnload"
        onLoad={() => setScriptLoaded(true)}
      />
      <ins
        key={currentSlot}
        className="adsbygoogle"
        style={{ display: "block", width: "100%", maxWidth: "728px", minHeight: "90px" }}
        data-ad-client={ADSENSE_CLIENT}
        data-ad-slot={currentSlot}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  );
}
