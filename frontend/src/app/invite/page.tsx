"use client";

import { useState, useEffect } from "react";
import { ToastContainer, useToast } from "@/components/ui";
import { api } from "@/lib/api";

// ─── Invite URL ───────────────────────────────────────────────────────────

const INVITE_URL = "https://fantasyhoops.online";

function buildMessage(headline: string) {
  return `🏀 ${headline}

Join me on Fantasy Hoops Liberia and build your dream team.

🏆 Win weekly prizes
📈 Climb the leaderboard
🔥 Challenge your friends

Play now:
${INVITE_URL}`;
}

const INVITE_URL_ENCODED = encodeURIComponent(INVITE_URL);

// ─── Share channels (unchanged from GEP-001) ──────────────────────────────

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
    getUrl: (msg: string) => `https://wa.me/?text=${encodeURIComponent(msg)}`,
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
    getUrl: (_msg: string) => `https://www.facebook.com/sharer/sharer.php?u=${INVITE_URL_ENCODED}`,
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
    getUrl: (_msg: string) => `https://m.me/?link=${INVITE_URL_ENCODED}`,
  },
  {
    id:    "sms",
    label: "SMS",
    color: "bg-[#1f2733] hover:bg-[#2a3441] text-gray-200 border border-[#2a3441]",
    icon:  <span className="text-xl leading-none" aria-hidden>💬</span>,
    getUrl: (msg: string) => `sms:?body=${encodeURIComponent(msg)}`,
  },
] as const;

// ─── Page ─────────────────────────────────────────────────────────────────

export default function InvitePage() {
  const { toasts, toast, dismiss } = useToast();
  const [copied,  setCopied]  = useState(false);
  const [sharing, setSharing] = useState(false);

  // Platform Settings — headline, prizes, manager count
  const [headline,       setHeadline]       = useState("Think you know Liberian basketball? Prove it!");
  const [communityTitle, setCommunityTitle] = useState("Fantasy Hoops Community");
  const [myCode,         setMyCode]         = useState<string | null>(null);

  // Platform Stats — single source for all community metrics (ADMIN-015)
  const [stats, setStats] = useState<{
    registeredManagers:     number | null;
    activeManagersThisWeek: number | null;
    completedGameweeks:     number | null;
    prizeMoneyAwarded:      number | null;
  }>({ registeredManagers: null, activeManagersThisWeek: null, completedGameweeks: null, prizeMoneyAwarded: null });

  useEffect(() => {
    // Load platform settings for headline / community title
    api.get("/platform-settings").then((res: any) => {
      if (res.data.inviteHeadline)    setHeadline(res.data.inviteHeadline);
      if (res.data.communityHeadline) setCommunityTitle(res.data.communityHeadline);
    }).catch(() => {});

    // Load personal referral code (GEP-002.1)
    api.get("/referral/my-code").then((res: any) => {
      setMyCode(res.data.referral_code);
    }).catch(() => {});
    api.get("/platform-stats").then((res: any) => {
      setStats({
        registeredManagers:     res.data.registeredManagers     ?? null,
        activeManagersThisWeek: res.data.activeManagersThisWeek ?? null,
        completedGameweeks:     res.data.completedGameweeks      ?? null,
        prizeMoneyAwarded:      res.data.prizeMoneyAwarded       ?? null,
      });
    }).catch(() => {});
  }, []);

  const inviteMessage = buildMessage(headline);

  // ── Copy ───────────────────────────────────────────────────────────────
  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(inviteMessage);
      setCopied(true);
      toast("success", "✓ Invite message copied! Share it anywhere.");
      setTimeout(() => setCopied(false), 3000);
    } catch {
      const el = document.getElementById("invite-text") as HTMLTextAreaElement | null;
      el?.select();
      toast("info", "Couldn't auto-copy — select the text above and copy manually.");
    }
  }

  // ── Native share ───────────────────────────────────────────────────────
  async function handleNativeShare() {
    if (!navigator.share) return;
    setSharing(true);
    try {
      await navigator.share({ title: "Fantasy Hoops Liberia", text: inviteMessage, url: INVITE_URL });
      toast("success", "🙌 Thanks for spreading the word!");
    } catch (err: any) {
      if (err?.name !== "AbortError") toast("error", "Share failed. Try another option below.");
    } finally {
      setSharing(false);
    }
  }

  // ── Social channel ─────────────────────────────────────────────────────
  function handleChannel(ch: typeof CHANNELS[number]) {
    window.open(ch.getUrl(inviteMessage), "_blank", "noopener,noreferrer");
    toast("success", `🙌 Thanks for sharing via ${ch.label}!`);
  }

  const nativeShareSupported = typeof navigator !== "undefined" && !!navigator.share;

  return (
    <div className="flex flex-col gap-6 max-w-lg mx-auto">
      <ToastContainer toasts={toasts} onDismiss={dismiss} />

      {/* Header */}
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">🏀 Invite a Friend</h1>

        {/* Enhancement 2: Competition banner */}
        <p className="text-sm font-semibold text-court-orange">
          Challenge your friends and see who knows Liberian basketball best!
        </p>
      </div>

      {/* Invite message */}
      <div className="card p-4 flex flex-col gap-3">
        <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Your Invite Message</p>
        <textarea
          id="invite-text"
          readOnly
          rows={8}
          value={inviteMessage}
          className="w-full bg-[#0b0f14] border border-[#1f2733] rounded-lg p-3
                     text-sm text-gray-200 resize-none focus:outline-none
                     focus-visible:ring-2 focus-visible:ring-court-orange
                     leading-relaxed font-mono"
          aria-label="Invite message"
        />
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
                         focus-visible:ring-2 focus-visible:ring-court-orange disabled:opacity-50"
              aria-label="Share using device share sheet"
            >
              {sharing ? "Sharing…" : "↑ Share"}
            </button>
          )}
        </div>
      </div>

      {/* Social proof card — ADMIN-015: /platform-stats */}
      <div className="card p-4 flex flex-col gap-3">
        <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">🏀 {communityTitle}</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-[#0b0f14] rounded-lg p-3 text-center">
            <p className="text-lg font-bold text-court-orange">
              {stats.registeredManagers !== null ? stats.registeredManagers : "—"}
            </p>
            <p className="text-xs text-gray-500 mt-0.5 leading-tight">👥 Registered<br />Managers</p>
          </div>
          <div className="bg-[#0b0f14] rounded-lg p-3 text-center">
            <p className="text-lg font-bold text-court-orange">
              {stats.activeManagersThisWeek !== null ? stats.activeManagersThisWeek : "—"}
            </p>
            <p className="text-xs text-gray-500 mt-0.5 leading-tight">🏀 Active<br />This Week</p>
          </div>
          <div className="bg-[#0b0f14] rounded-lg p-3 text-center">
            <p className="text-lg font-bold text-court-orange">
              {stats.completedGameweeks !== null ? stats.completedGameweeks : "—"}
            </p>
            <p className="text-xs text-gray-500 mt-0.5 leading-tight">🏆 Weeks<br />Completed</p>
          </div>
          <div className="bg-[#0b0f14] rounded-lg p-3 text-center">
            <p className="text-lg font-bold text-court-orange">
              {stats.prizeMoneyAwarded !== null
                ? `L${Number(stats.prizeMoneyAwarded).toLocaleString()}`
                : "—"}
            </p>
            <p className="text-xs text-gray-500 mt-0.5 leading-tight">💰 Prize Money<br />Awarded</p>
          </div>
        </div>
      </div>

      {/* Personal referral code (GEP-002.1) */}
      {myCode && (
        <div className="card p-4 flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-1">Your Referral Code</p>
            <span className="text-2xl font-bold text-court-orange tracking-widest">{myCode}</span>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={handleCopy}
              className="px-3 py-2 rounded text-xs font-semibold min-h-[40px] bg-[#1f2733] hover:bg-[#2a3441] text-gray-200"
            >
              📋 Copy Code
            </button>
            <a href="/referrals" className="px-3 py-2 rounded text-xs font-semibold min-h-[40px] bg-[#1f2733] hover:bg-[#2a3441] text-gray-200 flex items-center">
              View History →
            </a>
          </div>
        </div>
      )}

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

      {/* Enhancement 4: Updated footer */}
      <p className="text-xs text-gray-500 text-center">
        🇱🇷 The more managers join, the bigger the competition becomes. Invite a friend today!
      </p>

      {/* Enhancement 5: Coming Soon teaser */}
      <div
        aria-label="Coming soon features"
        className="card border border-dashed border-[#2a3441] p-4 flex flex-col gap-2 opacity-70"
      >
        <div className="flex items-center gap-2">
          <span className="text-base">🚀</span>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Coming Soon</p>
          <span className="text-[10px] bg-[#1f2733] text-gray-500 px-2 py-0.5 rounded-full">Preview</span>
        </div>
        <p className="text-sm text-gray-500 leading-relaxed">
          Invite friends. Earn badges. Unlock exclusive rewards.
        </p>
      </div>
    </div>
  );
}
