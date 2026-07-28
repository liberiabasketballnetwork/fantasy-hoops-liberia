"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { ToastContainer, useToast } from "@/components/ui";
import Link from "next/link";

const BASE_URL = "https://fantasyhoops.online";

interface ReferralEntry {
  display_name:  string;
  referral_date: string;
  status:        string;
}

export default function ReferralsPage() {
  const { user, loading: authLoading } = useAuth();
  const { toasts, toast, dismiss }     = useToast();

  const [code,     setCode]     = useState("");
  const [history,  setHistory]  = useState<ReferralEntry[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [copied,   setCopied]   = useState<"code" | "link" | null>(null);

  const referralLink = code ? `${BASE_URL}/register?ref=${code}` : "";

  useEffect(() => {
    if (!user || authLoading) return;
    Promise.all([
      api.get("/referral/my-code"),
      api.get("/referral/my-history"),
    ]).then(([codeRes, histRes]) => {
      setCode(codeRes.data.referral_code);
      setHistory(histRes.data.referrals || []);
    }).catch(() => {})
      .finally(() => setLoading(false));
  }, [user, authLoading]);

  async function copyText(text: string, type: "code" | "link") {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(type);
      toast("success", type === "code" ? "✓ Referral code copied!" : "✓ Referral link copied!");
      setTimeout(() => setCopied(null), 3000);
    } catch {
      toast("info", "Couldn't auto-copy. Select and copy manually.");
    }
  }

  async function handleShare() {
    if (!navigator.share) return;
    try {
      await navigator.share({
        title: "Join Fantasy Hoops Liberia",
        text:  `🏀 Join Fantasy Hoops Liberia and compete every week! Use my referral link:`,
        url:   referralLink,
      });
      toast("success", "🙌 Thanks for sharing!");
    } catch (err: any) {
      if (err?.name !== "AbortError") toast("error", "Share failed.");
    }
  }

  if (!authLoading && !user) {
    return (
      <div className="card p-8 text-center max-w-md mx-auto">
        <p className="mb-4">Log in to view your referral information.</p>
        <Link href="/login" className="btn-primary">Log in</Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-lg mx-auto">
      <ToastContainer toasts={toasts} onDismiss={dismiss} />

      <div>
        <h1 className="text-2xl font-bold">🤝 My Referrals</h1>
        <p className="text-sm text-gray-400 mt-1">
          Share your code and earn recognition when friends join.
        </p>
      </div>

      {/* Referral code + link card */}
      {loading ? (
        <div className="card p-5 h-40 animate-pulse" />
      ) : (
        <div className="card p-5 flex flex-col gap-4">
          {/* Code */}
          <div className="flex flex-col gap-2">
            <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">My Referral Code</p>
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-3xl font-bold text-court-orange tracking-widest">{code || "—"}</span>
              {code && (
                <button
                  onClick={() => copyText(code, "code")}
                  className={`px-3 py-1.5 rounded text-xs font-semibold min-h-[36px] transition-colors ${
                    copied === "code"
                      ? "bg-court-green/20 text-court-green border border-court-green/40"
                      : "bg-[#1f2733] hover:bg-[#2a3441] text-gray-200"
                  }`}
                >
                  {copied === "code" ? "✓ Copied!" : "Copy Code"}
                </button>
              )}
            </div>
          </div>

          {/* Link */}
          {referralLink && (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">My Referral Link</p>
              <div className="bg-[#0b0f14] rounded-lg px-3 py-2 text-xs text-gray-400 font-mono break-all">
                {referralLink}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => copyText(referralLink, "link")}
                  className={`px-3 py-2 rounded text-xs font-semibold min-h-[40px] transition-colors ${
                    copied === "link"
                      ? "bg-court-green/20 text-court-green border border-court-green/40"
                      : "btn-primary"
                  }`}
                >
                  {copied === "link" ? "✓ Copied!" : "📋 Copy Link"}
                </button>
                {typeof navigator !== "undefined" && navigator.share && (
                  <button
                    onClick={handleShare}
                    className="px-3 py-2 rounded text-xs font-semibold min-h-[40px] bg-[#1f2733] hover:bg-[#2a3441] text-gray-200"
                  >
                    ↑ Share
                  </button>
                )}
                <Link href="/invite" className="px-3 py-2 rounded text-xs font-semibold min-h-[40px] bg-[#1f2733] hover:bg-[#2a3441] text-gray-200 flex items-center">
                  More Share Options →
                </Link>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Referral history */}
      <div className="card p-5 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Friends Referred</p>
          <span className="text-xs bg-[#1f2733] text-gray-400 px-2 py-0.5 rounded-full">{history.length}</span>
        </div>

        {loading ? (
          <div className="h-16 animate-pulse bg-[#1f2733] rounded" />
        ) : history.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-sm text-gray-400">No referrals yet.</p>
            <p className="text-xs text-gray-600 mt-1">Share your code and start building your squad!</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 border-b border-[#1f2733]">
                <th className="text-left py-2">Friend</th>
                <th className="text-left py-2">Date Joined</th>
                <th className="text-right py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {history.map((r, i) => (
                <tr key={i} className="border-b border-[#1f2733] last:border-0">
                  <td className="py-2.5 font-medium">{r.display_name}</td>
                  <td className="py-2.5 text-gray-400 text-xs">
                    {new Date(r.referral_date).toLocaleDateString()}
                  </td>
                  <td className="py-2.5 text-right">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      r.status === "Active"
                        ? "bg-court-green/15 text-court-green"
                        : "bg-yellow-500/15 text-yellow-400"
                    }`}>
                      {r.status === "Active" ? "✔ Active" : "⏳ Pending"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
