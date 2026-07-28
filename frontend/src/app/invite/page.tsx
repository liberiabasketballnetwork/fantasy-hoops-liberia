"use client";

import { useState } from "react";
import { ToastContainer, useToast } from "@/components/ui";

// ─── Constants ─────────────────────────────────────────────────────────────

const INVITE_URL = "https://fantasyhoops.online";

const INVITE_MESSAGE = `🏀 Think you know Liberian basketball? Prove it!

Join me on Fantasy Hoops Liberia and build your dream team. Compete every week, climb the leaderboard, and win real prizes!

Play now: ${INVITE_URL}`;

const INVITE_MESSAGE_ENCODED = encodeURIComponent(INVITE_MESSAGE);
const INVITE_URL_ENCODED     = encodeURIComponent(INVITE_URL);

// ─── Share channels ─────────────────────────────────────────────────────────

const CHANNELS = [
  {
    id:    "whatsapp",
    label: "WhatsApp",
    color: "bg-[#25D366] hover:bg-[#1ebe5d] text-white",
    icon:  (
      <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current" aria-hidden>
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
        <path d="M11.997 0C5.373 0 0 5.373 0 12c0 2.117.554 4.103 1.522 5.83L0 24l6.335-1.658C8.04 23.406 9.977 24 12 24c6.624 0 12-5.373 12-12S18.624 0 12 0h-.003zm.003 21.818c-1.818 0-3.504-.492-4.95-1.345l-.355-.211-3.683.964.982-3.589-.232-.369C2.533 15.723 2.182 13.9 2.182 12c0-5.414 4.401-9.818 9.818-9.818 5.414 0 9.818 4.404 9.818 9.818 0 5.417-4.404 9.818-9.818 9.818z"/>
      </svg>
    ),
    getUrl: () => `https://wa.me/?text=${INVITE_MESSAGE_ENCODED}`,
  },
  {
    id:    "facebook",
    label: "Facebook",
    color: "bg-[#1877F2] hover:bg-[#166fe5] text-white",
    icon: (
      <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current" aria-hidden>
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
      </svg>
    ),
    getUrl: () => `https://www.facebook.com/sharer/sharer.php?u=${INVITE_URL_ENCODED}`,
  },
  {
    id:    "messenger",
    label: "Messenger",
    color: "bg-[#0099FF] hover:bg-[#007fd9] text-white",
    icon: (
      <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current" aria-hidden>
        <path d="M12 0C5.373 0 0 4.975 0 11.111c0 3.497 1.745 6.616 4.472 8.652V24l4.086-2.242c1.09.301 2.246.464 3.442.464 6.627 0 12-4.974 12-11.111C24 4.975 18.627 0 12 0zm1.193 14.963l-3.056-3.259-5.963 3.259L10.986 8.4l3.13 3.259L20 8.4l-6.807 6.563z"/>
      </svg>
    ),
    getUrl: () => `https://m.me/?link=${INVITE_URL_ENCODED}`,
  },
  {
    id:    "sms",
    label: "SMS",
    color: "bg-[#1f2733] hover:bg-[#2a3441] text-gray-200 border border-[#2a3441]",
    icon:  <span className="text-xl leading-none" aria-hidden>💬</span>,
    getUrl: () => `sms:?body=${INVITE_MESSAGE_ENCODED}`,
  },
] as const;

// ─── Page ───────────────────────────────────────────────────────────────────

export default function InvitePage() {
  const { toasts, toast, dismiss } = useToast();
  const [copied,   setCopied]   = useState(false);
  const [sharing,  setSharing]  = useState(false);

  // ── Copy link ────────────────────────────────────────────────────────────
  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(INVITE_MESSAGE);
      setCopied(true);
      toast("success", "✓ Invite message copied! Share it anywhere.");
      setTimeout(() => setCopied(false), 3000);
    } catch {
      // Fallback: select the textarea
      const el = document.getElementById("invite-text") as HTMLTextAreaElement | null;
      el?.select();
      toast("info", "Couldn't auto-copy — select the text above and copy manually.");
    }
  }

  // ── Native share (Web Share API) ─────────────────────────────────────────
  async function handleNativeShare() {
    if (!navigator.share) return;
    setSharing(true);
    try {
      await navigator.share({ title: "Fantasy Hoops Liberia", text: INVITE_MESSAGE, url: INVITE_URL });
      toast("success", "🙌 Thanks for spreading the word!");
    } catch (err: any) {
      // AbortError = user cancelled — not an error
      if (err?.name !== "AbortError") {
        toast("error", "Share failed. Try another option below.");
      }
    } finally {
      setSharing(false);
    }
  }

  // ── Social/SMS channel share ─────────────────────────────────────────────
  function handleChannel(channel: typeof CHANNELS[number]) {
    window.open(channel.getUrl(), "_blank", "noopener,noreferrer");
    toast("success", `🙌 Thanks for sharing via ${channel.label}!`);
  }

  const nativeShareSupported = typeof navigator !== "undefined" && !!navigator.share;

  return (
    <div className="flex flex-col gap-6 max-w-lg mx-auto">
      <ToastContainer toasts={toasts} onDismiss={dismiss} />

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">🏀 Invite a Friend</h1>
        <p className="text-sm text-gray-400 mt-1">
          Help grow the Fantasy Hoops Liberia community.
          Share the game with friends who love basketball!
        </p>
      </div>

      {/* Invite message preview */}
      <div className="card p-4 flex flex-col gap-3">
        <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Your Invite Message</p>
        <textarea
          id="invite-text"
          readOnly
          rows={6}
          value={INVITE_MESSAGE}
          className="w-full bg-[#0b0f14] border border-[#1f2733] rounded-lg p-3
                     text-sm text-gray-200 resize-none focus:outline-none
                     focus-visible:ring-2 focus-visible:ring-court-orange
                     leading-relaxed font-mono"
          aria-label="Invite message"
        />

        {/* Primary actions */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleCopy}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold
                        min-h-[44px] transition-colors focus:outline-none
                        focus-visible:ring-2 focus-visible:ring-court-orange
                        ${copied
                          ? "bg-court-green/20 text-court-green border border-court-green/40"
                          : "btn-primary"}`}
            aria-label="Copy invite message"
          >
            {copied ? "✓ Copied!" : "📋 Copy Message"}
          </button>

          {nativeShareSupported && (
            <button
              onClick={handleNativeShare}
              disabled={sharing}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold
                         min-h-[44px] bg-[#1f2733] hover:bg-[#2a3441] text-gray-200
                         border border-[#2a3441] transition-colors focus:outline-none
                         focus-visible:ring-2 focus-visible:ring-court-orange
                         disabled:opacity-50"
              aria-label="Share using device share sheet"
            >
              {sharing ? "Sharing…" : "↑ Share"}
            </button>
          )}
        </div>
      </div>

      {/* Share channels */}
      <div className="card p-4 flex flex-col gap-3">
        <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Share via</p>
        <div className="grid grid-cols-2 gap-2">
          {CHANNELS.map((ch) => (
            <button
              key={ch.id}
              onClick={() => handleChannel(ch)}
              className={`flex items-center gap-2.5 px-4 py-3 rounded-lg
                          text-sm font-semibold min-h-[48px] transition-colors
                          focus:outline-none focus-visible:ring-2 focus-visible:ring-court-orange
                          ${ch.color}`}
              aria-label={`Share via ${ch.label}`}
            >
              {ch.icon}
              {ch.label}
            </button>
          ))}
        </div>
      </div>

      {/* Footer note */}
      <p className="text-xs text-gray-600 text-center pb-2">
        🇱🇷 Every invitation helps build the Liberian fantasy basketball community.
      </p>
    </div>
  );
}
