"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { FormBadge, PriceBadge } from "@/components/ui";

interface AchievementWithBadge {
  achievement_id: string;
  badge_name: string;
  icon: string;
  earned_at: string;
}

export default function DashboardPage() {
  const { user, loading } = useAuth();

  const [lineup, setLineup] = useState<any>(null);
  const [leaderboard, setLeaderboard] = useState<any>(null);
  const [myRank, setMyRank] = useState<any>(null);
  const [advisor, setAdvisor] = useState<any>(null);
  const [recentBadges, setRecentBadges] = useState<AchievementWithBadge[]>([]);
  const [teams, setTeams] = useState<Record<string, string>>({});
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (loading || !user) { setFetching(false); return; }

    async function load() {
      try {
        const [lbRes, teamsRes] = await Promise.all([
          api.get("/leaderboard"),
          api.get("/teams"),
        ]);
        setLeaderboard(lbRes.data);

        const tm: Record<string, string> = {};
        for (const t of teamsRes.data.teams || []) tm[t.team_id] = t.team_name;
        setTeams(tm);

        const week = lbRes.data.week;
        if (week) {
          // Parallel: my lineup, advisor, achievements
          const [lineupRes, advRes, achRes] = await Promise.all([
            api.get("/my-lineup", { params: { week_id: week.week_id } }).catch(() => null),
            api.get("/team-advisor").catch(() => null),
            api.get("/achievements").catch(() => null),
          ]);

          if (lineupRes) setLineup(lineupRes.data.lineup);
          if (advRes) setAdvisor(advRes.data);
          if (achRes) setRecentBadges((achRes.data.earned || []).slice(0, 3));

          // My rank from leaderboard
          const myEntry = (lbRes.data.leaderboard || []).find(
            (e: any) => e.user_id === user.user_id
          );
          setMyRank(myEntry || null);
        }
      } catch {
        // silently handle — dashboard degrades gracefully
      } finally {
        setFetching(false);
      }
    }
    load();
  }, [loading, user]);

  if (loading || fetching) return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 rounded-full border-4 border-[#1f2733] border-t-court-orange animate-spin" />
        <p className="text-sm text-gray-400">Loading dashboard...</p>
      </div>
    </div>
  );

  if (!user) return (
    <div className="text-center card p-8">
      <p className="mb-4">You need to log in to view your dashboard.</p>
      <Link href="/login" className="btn-primary">Log in</Link>
    </div>
  );

  const week = leaderboard?.week;
  const lineupPlayers = lineup?.players || [];
  const captainId = lineup?.captain_player_id;
  const hasLineup = lineupPlayers.length > 0;
  const isLocked = week && String(week.is_locked).toUpperCase() === "TRUE";

  return (
    <div className="flex flex-col gap-5">
      {/* Welcome */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">
            Welcome, {user.display_name || user.full_name?.split(" ")[0]} 👋
          </h1>
          <p className="text-sm text-gray-400">
            {week ? `Gameweek: ${week.start_date} → ${week.end_date}` : "No active gameweek."}
          </p>
        </div>
        {myRank && (
          <div className="card px-4 py-2 text-center">
            <p className="text-xs text-gray-400">Your Rank</p>
            <p className="text-2xl font-bold text-court-orange">#{myRank.rank}</p>
            <p className="text-xs text-gray-400">{myRank.score} pts</p>
          </div>
        )}
      </div>

      {/* ── Lineup status ───────────────────────────────────────────────── */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold">🏀 This Week's Lineup</h2>
          {week && !isLocked && (
            <Link href="/players" className="text-xs text-court-orange hover:opacity-80">
              {hasLineup ? "Edit →" : "Pick Players →"}
            </Link>
          )}
        </div>

        {!week ? (
          <p className="text-sm text-gray-400">No active gameweek — check back soon.</p>
        ) : !hasLineup ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-gray-400">
              {isLocked
                ? "The deadline has passed. No lineup was submitted for this gameweek."
                : "You haven't submitted a lineup yet."}
            </p>
            {!isLocked && (
              <Link href="/players" className="btn-primary w-fit text-sm">Pick Your 5 Players →</Link>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {lineupPlayers.map((p: any) => (
              <div key={p.player_id} className="flex items-center justify-between text-sm py-1.5 border-b border-[#1f2733] last:border-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{p.full_name}</span>
                  {p.player_id === captainId && (
                    <span className="text-xs bg-court-orange text-white px-1.5 py-0.5 rounded">C</span>
                  )}
                  {p.form && <FormBadge form={p.form} variant="icon" />}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-400">{p.position}</span>
                  <PriceBadge
                    current_price={Number(p.current_price ?? p.fantasy_price ?? 0)}
                    price_change={p.price_change ?? 0}
                    price_trend={p.price_trend ?? "same"}
                    variant="inline"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* ── Team health ──────────────────────────────────────────────────── */}
        {advisor?.has_lineup && advisor.team_health && (
          <div className="card p-5">
            <h2 className="font-bold mb-3">🧠 Team Health</h2>
            <div className="flex items-center gap-4">
              <div className={`w-14 h-14 rounded-full border-4 flex items-center justify-center flex-shrink-0
                ${advisor.team_health.score >= 75 ? "border-court-green" : advisor.team_health.score >= 60 ? "border-yellow-400" : "border-red-500"}`}>
                <span className={`text-lg font-bold ${advisor.team_health.score >= 75 ? "text-court-green" : advisor.team_health.score >= 60 ? "text-yellow-400" : "text-red-400"}`}>
                  {advisor.team_health.score}
                </span>
              </div>
              <div>
                <p className={`font-bold ${advisor.team_health.score >= 75 ? "text-court-green" : advisor.team_health.score >= 60 ? "text-yellow-400" : "text-red-400"}`}>
                  {advisor.team_health.label}
                </p>
                {advisor.suggested_captain && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    Captain tip: <span className="text-court-orange">{advisor.suggested_captain.player_name}</span>
                  </p>
                )}
              </div>
            </div>
            {advisor.alerts?.length > 0 && (
              <p className="text-xs text-gray-400 mt-3 leading-relaxed">{advisor.alerts[0].message}</p>
            )}
            <Link href="/team-advisor" className="text-xs text-court-orange mt-2 block">Full advice →</Link>
          </div>
        )}

        {/* ── My rank this week ─────────────────────────────────────────────── */}
        {myRank ? (
          <div className="card p-5">
            <h2 className="font-bold mb-3">🏆 This Week's Standing</h2>
            <div className="flex flex-col gap-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">Position</span>
                <span className="font-bold text-court-orange text-xl">#{myRank.rank}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Fantasy Points</span>
                <span className="font-bold">{myRank.score}</span>
              </div>
            </div>
            <Link href="/leaderboard" className="text-xs text-court-orange mt-3 block">Full leaderboard →</Link>
          </div>
        ) : (
          <div className="card p-5">
            <h2 className="font-bold mb-3">🏆 Leaderboard</h2>
            <p className="text-sm text-gray-400 mb-3">Submit your lineup to appear on the leaderboard.</p>
            <Link href="/leaderboard" className="text-xs text-court-orange">View leaderboard →</Link>
          </div>
        )}
      </div>

      {/* ── Recent achievements ──────────────────────────────────────────────── */}
      {recentBadges.length > 0 && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold">🏅 Recent Badges</h2>
            <Link href="/achievements" className="text-xs text-court-orange">All badges →</Link>
          </div>
          <div className="flex gap-3 flex-wrap">
            {recentBadges.map((b) => (
              <div key={b.achievement_id} className="flex items-center gap-2 bg-[#0b0f14] rounded-lg px-3 py-2">
                <span className="text-xl">{b.icon}</span>
                <span className="text-sm font-medium">{b.badge_name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Quick links ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { href: "/market",       icon: "📈", label: "Market"    },
          { href: "/compare",      icon: "⚖️", label: "Compare"   },
          { href: "/optimizer",    icon: "🤖", label: "Optimizer" },
          { href: "/leagues",      icon: "🏆", label: "Leagues"   },
        ].map((item) => (
          <Link key={item.href} href={item.href} className="card p-4 text-center hover:border-court-orange transition-colors">
            <span className="text-2xl block mb-1">{item.icon}</span>
            <span className="text-sm font-medium">{item.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
