"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

// ─── localStorage keys ─────────────────────────────────────────────────────

const LS_STATUS    = "community_status";    // "joined" | "later" | null
const LS_JOINED_AT = "community_joined_at";
const LS_LATER_AT  = "community_later_at";

function lsGet(k: string): string | null {
  try { return localStorage.getItem(k); } catch { return null; }
}
function lsSet(k: string, v: string): void {
  try { localStorage.setItem(k, v); } catch { /* private browsing */ }
}

// ─── Analytics helper ──────────────────────────────────────────────────────

async function track(event: "shown" | "join_clicked" | "dismissed") {
  try {
    await api.post("/community/analytics", { event, timestamp: new Date().toISOString() }).catch(() => {});
  } catch { /* non-fatal */ }
}

// ─── Component ─────────────────────────────────────────────────────────────

interface Props { hasTeam: boolean; }

export default function CommunityCard({ hasTeam }: Props) {
  const [visible,     setVisible]     = useState(false);
  const [whatsappUrl, setWhatsappUrl] = useState("");
  const [cardText,    setCardText]    = useState<string | null>(null);
  const [tracked,     setTracked]     = useState(false);

  useEffect(() => {
    if (!hasTeam) return;

    const status   = lsGet(LS_STATUS);
    const laterAt  = lsGet(LS_LATER_AT);

    // Already joined — never show
    if (status === "joined") return;

    // "Maybe Later" — only re-show after 7 days
    if (status === "later" && laterAt) {
      const daysSince = (Date.now() - Number(laterAt)) / (1000 * 60 * 60 * 24);
      if (daysSince < 7) return;
    }

    // Fetch community settings from backend
    api.get("/community/settings").then((res) => {
      const { enabled, whatsapp_url, card_text } = res.data;
      if (!enabled || !whatsapp_url) return;
      setWhatsappUrl(whatsapp_url);
      if (card_text) setCardText(card_text);
      setVisible(true);
    }).catch(() => { /* settings unavailable — don't show */ });
  }, [hasTeam]);

  // Track "shown" once
  useEffect(() => {
    if (visible && !tracked) {
      track("shown");
      setTracked(true);
    }
  }, [visible, tracked]);

  if (!visible) return null;

  function handleJoin() {
    track("join_clicked");
    lsSet(LS_STATUS,    "joined");
    lsSet(LS_JOINED_AT, String(Date.now()));
    window.open(whatsappUrl, "_blank", "noopener,noreferrer");
    setVisible(false);
  }

  function handleLater() {
    track("dismissed");
    lsSet(LS_STATUS,   "later");
    lsSet(LS_LATER_AT, String(Date.now()));
    setVisible(false);
  }

  const benefits = cardText
    ? cardText.split("\n").filter(Boolean)
    : [
        "🏀 Weekly reminders",
        "📢 Player news",
        "🏆 Winner announcements",
        "💰 Prize updates",
        "🎙 LBN content",
        "💬 Basketball discussions",
      ];

  return (
    <div
      role="complementary"
      aria-label="Join the Fantasy Hoops Liberia Community"
      className="card border-l-4 border-court-orange p-5 flex flex-col gap-4
                 animate-[fadeSlideIn_300ms_ease-out]"
    >
      {/* Header */}
      <div>
        <p className="font-bold text-base">🎉 Join the Fantasy Hoops Liberia Community</p>
        <p className="text-sm text-gray-400 mt-0.5">
          Stay connected with Fantasy Managers.
        </p>
      </div>

      {/* Benefits */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        {benefits.map((b, i) => (
          <p key={i} className="text-sm text-gray-300">{b}</p>
        ))}
      </div>

      {/* CTAs */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={handleJoin}
          className="flex items-center gap-2 px-4 py-2 rounded-lg
                     bg-[#25D366] hover:bg-[#1ebe5d] text-white font-semibold text-sm
                     transition-colors min-h-[44px] focus:outline-none
                     focus-visible:ring-2 focus-visible:ring-[#25D366]"
        >
          <svg viewBox="0 0 24 24" className="w-4 h-4 fill-white flex-shrink-0" aria-hidden>
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
            <path d="M11.997 0C5.373 0 0 5.373 0 12c0 2.117.554 4.103 1.522 5.83L0 24l6.335-1.658C8.04 23.406 9.977 24 12 24c6.624 0 12-5.373 12-12S18.624 0 12 0h-.003zm.003 21.818c-1.818 0-3.504-.492-4.95-1.345l-.355-.211-3.683.964.982-3.589-.232-.369C2.533 15.723 2.182 13.9 2.182 12c0-5.414 4.401-9.818 9.818-9.818 5.414 0 9.818 4.404 9.818 9.818 0 5.417-4.404 9.818-9.818 9.818z"/>
          </svg>
          Join WhatsApp Community
        </button>
        <button
          onClick={handleLater}
          className="text-sm text-gray-400 hover:text-gray-200 transition-colors
                     min-h-[44px] px-3 focus:outline-none
                     focus-visible:ring-2 focus-visible:ring-court-orange rounded"
        >
          Maybe Later
        </button>
      </div>
    </div>
  );
}
