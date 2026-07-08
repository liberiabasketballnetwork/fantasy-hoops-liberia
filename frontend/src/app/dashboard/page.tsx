"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";

export default function DashboardPage() {
  const { user, loading } = useAuth();
  const [lineup, setLineup] = useState<any>(null);
  const [leaderboard, setLeaderboard] = useState<any>(null);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const lbRes = await api.get("/leaderboard");
        setLeaderboard(lbRes.data);

        if (lbRes.data.week) {
          const lineupRes = await api.get("/my-lineup", {
            params: { week_id: lbRes.data.week.week_id },
          });
          setLineup(lineupRes.data.lineup);
        }
      } catch (e) {
        // not logged in or no data yet - fine for an MVP dashboard
      } finally {
        setFetching(false);
      }
    }
    if (!loading) load();
  }, [loading]);

  if (loading || fetching) return <p className="text-center text-gray-400">Loading dashboard...</p>;

  if (!user) {
    return (
      <div className="text-center card p-8">
        <p className="mb-4">You need to log in to view your dashboard.</p>
        <Link href="/login" className="btn-primary">
          Log in
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Welcome, {user.full_name?.split(" ")[0]} 👋</h1>

      <div className="card p-5">
        <h2 className="font-bold mb-2">This Week&apos;s Lineup</h2>
        {leaderboard?.week ? (
          lineup ? (
            <p className="text-sm text-gray-400">
              You&apos;ve submitted your lineup for this gameweek. Good luck! 🍀
            </p>
          ) : (
            <div>
              <p className="text-sm text-gray-400 mb-3">
                You haven&apos;t submitted a lineup for the current gameweek yet.
              </p>
              <Link href="/players" className="btn-primary">
                Pick Your 5 Players
              </Link>
            </div>
          )
        ) : (
          <p className="text-sm text-gray-400">No active gameweek yet — check back soon.</p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link href="/leaderboard" className="card p-5 hover:border-court-orange">
          <h3 className="font-bold mb-1">🏆 Leaderboard</h3>
          <p className="text-sm text-gray-400">See where you rank this week.</p>
        </Link>
        <Link href="/players" className="card p-5 hover:border-court-orange">
          <h3 className="font-bold mb-1">📊 Player Stats</h3>
          <p className="text-sm text-gray-400">Browse all players and their averages.</p>
        </Link>
      </div>
    </div>
  );
}
