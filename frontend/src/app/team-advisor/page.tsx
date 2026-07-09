"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { FormBadge, PriceBadge } from "@/components/ui";

// ─── Types ──────────────────────────────────────────────────────────────────

interface PlayerRec {
  player_id: string;
  player_name: string;
  team_id: string;
  current_price: number;
  season_average_fantasy_points: number;
  form: "hot" | "good" | "average" | "cold";
  value_per_credit: number;
  reason: string;
}

interface TransferSuggestion {
  out: PlayerRec;
  in: PlayerRec;
  reason: string;
}

interface TeamAlert {
  type: string;
  player_name: string;
  message: string;
}

interface AdvisorData {
  has_lineup: boolean;
  week_id: string | null;
  team_health: { score: number; label: string } | null;
  strongest_player: PlayerRec | null;
  weakest_player: PlayerRec | null;
  suggested_captain: PlayerRec | null;
  suggested_transfer: TransferSuggestion | null;
  budget_analysis: { credits_used: number; credits_remaining: number; budget_cap: number; message: string } | null;
  alerts: TeamAlert[];
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card p-5 flex flex-col gap-3">
      <h2 className="font-bold text-base border-b border-[#1f2733] pb-3">{title}</h2>
      {children}
    </div>
  );
}

function StatRow({ label, value, highlight = false }: { label: string; value: string | number; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-gray-400">{label}</span>
      <span className={`font-semibold ${highlight ? "text-court-orange" : ""}`}>{value}</span>
    </div>
  );
}

function PlayerCard({ player, teams }: { player: PlayerRec; teams: Record<string, string> }) {
  return (
    <div className="bg-[#0b0f14] rounded-lg p-3 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-bold">{player.player_name}</p>
          <p className="text-xs text-gray-400">{teams[player.team_id] || "—"}</p>
        </div>
        <FormBadge form={player.form} variant="pill" />
      </div>
      <div className="flex items-center justify-between">
        <PriceBadge current_price={player.current_price} price_trend="same" variant="inline" />
        <span className="text-xs text-gray-400">Avg {player.season_average_fantasy_points.toFixed(1)} FP</span>
        <span className="text-xs text-court-orange font-semibold">{player.value_per_credit.toFixed(2)}/cr</span>
      </div>
      <p className="text-xs text-gray-500 leading-relaxed">{player.reason}</p>
    </div>
  );
}

// Health score colour
function healthColor(score: number) {
  if (score >= 75) return "text-court-green";
  if (score >= 60) return "text-yellow-400";
  return "text-red-400";
}
function healthRingColor(score: number) {
  if (score >= 75) return "border-court-green";
  if (score >= 60) return "border-yellow-400";
  return "border-red-500";
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function TeamAdvisorPage() {
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = useState<AdvisorData | null>(null);
  const [teams, setTeams] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (authLoading) return;
    if (!user) { setLoading(false); return; }

    Promise.all([api.get("/team-advisor"), api.get("/teams")])
      .then(([advRes, teamsRes]) => {
        setData(advRes.data);
        const tm: Record<string, string> = {};
        for (const t of teamsRes.data.teams || []) tm[t.team_id] = t.team_name;
        setTeams(tm);
      })
      .catch(() => setError("Failed to load team advice. Please try again."))
      .finally(() => setLoading(false));
  }, [user, authLoading]);

  // ── Not logged in ──
  if (!authLoading && !user) {
    return (
      <div className="card p-8 text-center">
        <p className="text-gray-400 mb-4">Log in to receive personalised team advice.</p>
        <Link href="/login" className="btn-primary">Log in</Link>
      </div>
    );
  }

  // ── Loading ──
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full border-4 border-[#1f2733] border-t-court-orange animate-spin" />
          <p className="text-sm text-gray-400">Analysing your team...</p>
        </div>
      </div>
    );
  }

  // ── Error ──
  if (error) {
    return <div className="card p-6 text-center text-red-400 text-sm">{error}</div>;
  }

  // ── No lineup ──
  if (!data || !data.has_lineup) {
    return (
      <div className="flex flex-col gap-5">
        <h1 className="text-2xl font-bold">🧠 Team Advisor</h1>
        <div className="card p-8 text-center flex flex-col items-center gap-4">
          <span className="text-4xl">📋</span>
          <p className="font-bold">No Lineup Found</p>
          <p className="text-sm text-gray-400 max-w-sm">
            Submit your lineup to receive personalised team advice.
          </p>
          <Link href="/players" className="btn-primary">Pick Your Team →</Link>
        </div>
      </div>
    );
  }

  const { team_health, strongest_player, weakest_player, suggested_captain, suggested_transfer, budget_analysis, alerts } = data;

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">🧠 Team Advisor</h1>
          <p className="text-sm text-gray-400">Personalised recommendations for your lineup.</p>
        </div>
        <Link href="/players" className="text-court-orange text-sm">Edit Lineup →</Link>
      </div>

      {/* ── Team Health ─────────────────────────────────────────────────── */}
      {team_health && (
        <div className="card p-6 flex items-center gap-6">
          <div
            className={`w-20 h-20 rounded-full border-4 flex items-center justify-center flex-shrink-0 ${healthRingColor(team_health.score)}`}
          >
            <span className={`text-2xl font-bold ${healthColor(team_health.score)}`}>
              {team_health.score}
            </span>
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide">Team Health</p>
            <p className={`text-xl font-bold ${healthColor(team_health.score)}`}>
              {team_health.label}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Based on form, fantasy averages, and value for money.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* ── Suggested Captain ──────────────────────────────────────────── */}
        {suggested_captain && (
          <Section title="⚡ Suggested Captain">
            <PlayerCard player={suggested_captain} teams={teams} />
          </Section>
        )}

        {/* ── Budget Analysis ────────────────────────────────────────────── */}
        {budget_analysis && (
          <Section title="💰 Budget Summary">
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">Credits Used</span>
                <span className="font-bold">{budget_analysis.credits_used} / {budget_analysis.budget_cap}</span>
              </div>
              <div className="w-full h-2 bg-[#1f2733] rounded overflow-hidden">
                <div
                  className="h-full bg-court-orange rounded"
                  style={{ width: `${Math.min((budget_analysis.credits_used / budget_analysis.budget_cap) * 100, 100)}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">Credits Remaining</span>
                <span className={`font-bold ${budget_analysis.credits_remaining > 0 ? "text-court-green" : "text-gray-300"}`}>
                  {budget_analysis.credits_remaining}
                </span>
              </div>
              <p className="text-xs text-gray-500">{budget_analysis.message}</p>
            </div>
          </Section>
        )}

        {/* ── Strongest Player ───────────────────────────────────────────── */}
        {strongest_player && (
          <Section title="💪 Strongest Player">
            <PlayerCard player={strongest_player} teams={teams} />
          </Section>
        )}

        {/* ── Weakest Player ─────────────────────────────────────────────── */}
        {weakest_player && (
          <Section title="⚠️ Weakest Player">
            <PlayerCard player={weakest_player} teams={teams} />
          </Section>
        )}
      </div>

      {/* ── Suggested Transfer ─────────────────────────────────────────────── */}
      {suggested_transfer ? (
        <Section title="🔄 Suggested Transfer">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              {/* OUT */}
              <div className="flex-1 bg-red-500/10 border border-red-600/30 rounded-lg p-3">
                <p className="text-xs text-red-400 font-semibold uppercase mb-2">OUT</p>
                <p className="font-bold">{suggested_transfer.out.player_name}</p>
                <p className="text-xs text-gray-400 mt-0.5">{suggested_transfer.out.current_price} cr · {suggested_transfer.out.value_per_credit.toFixed(2)}/cr</p>
              </div>
              {/* Arrow */}
              <div className="flex items-center justify-center text-gray-500 text-xl">↓</div>
              {/* IN */}
              <div className="flex-1 bg-court-green/10 border border-court-green/30 rounded-lg p-3">
                <p className="text-xs text-court-green font-semibold uppercase mb-2">IN</p>
                <p className="font-bold">{suggested_transfer.in.player_name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <FormBadge form={suggested_transfer.in.form} variant="pill" />
                  <span className="text-xs text-gray-400">{suggested_transfer.in.current_price} cr · {suggested_transfer.in.value_per_credit.toFixed(2)}/cr</span>
                </div>
              </div>
            </div>
            <p className="text-xs text-gray-500">{suggested_transfer.reason}</p>
          </div>
        </Section>
      ) : (
        <Section title="🔄 Suggested Transfer">
          <p className="text-sm text-gray-500">
            No better-value transfer found within your current budget and team rules.
            Your lineup looks solid!
          </p>
        </Section>
      )}

      {/* ── Alerts ─────────────────────────────────────────────────────────── */}
      {alerts.length > 0 && (
        <Section title="🔔 Alerts">
          <div className="flex flex-col gap-2">
            {alerts.map((alert, i) => (
              <div key={i} className="text-sm text-gray-300 bg-[#0b0f14] rounded-lg px-3 py-2 leading-relaxed">
                {alert.message}
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}
