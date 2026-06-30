"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useRequireAdmin } from "@/hooks/useRequireAdmin";

export default function AdminLeaderboardPage() {
  const { user, loading } = useRequireAdmin();
  const [week, setWeek] = useState<any>(null);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [selectionStats, setSelectionStats] = useState<any[]>([]);
  const [totalManagers, setTotalManagers] = useState(0);
  const [message, setMessage] = useState("");

  async function load() {
    const res = await api.get("/leaderboard");
    setWeek(res.data.week);
    setLeaderboard(res.data.leaderboard || []);

    if (res.data.week) {
      try {
        const statsRes = await api.get("/admin/selection-stats", {
          params: { week_id: res.data.week.week_id },
        });
        setSelectionStats(statsRes.data.stats || []);
        setTotalManagers(statsRes.data.total_managers || 0);
      } catch {
        setSelectionStats([]);
        setTotalManagers(0);
      }
    }
  }

  useEffect(() => {
    if (user?.isAdmin) load();
  }, [user]);

  async function lockWeek() {
    if (!week) return;
    try {
      await api.post("/admin/lock-week", { week_id: week.week_id });
      setMessage("🔒 Week locked.");
      load();
    } catch (err: any) {
      setMessage(err?.response?.data?.error || "Failed to lock week.");
    }
  }

  async function resetWeek() {
    if (!week) return;
    try {
      await api.post("/admin/reset-week", { week_id: week.week_id });
      setMessage("🔁 Week reset.");
      load();
    } catch (err: any) {
      setMessage(err?.response?.data?.error || "Failed to reset week.");
    }
  }

  if (loading || !user) return <p className="text-center text-gray-400">Loading...</p>;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">🏆 Leaderboard Tools</h1>
      {message && <div className="card p-3 text-sm">{message}</div>}

      {!week ? (
        <p className="text-gray-400 text-sm">No active gameweek.</p>
      ) : (
        <div className="card p-5 flex flex-wrap gap-3 items-center text-sm">
          <span>
            Week: {week.start_date} → {week.end_date} (
            {String(week.is_locked).toUpperCase() === "TRUE" ? "🔒 Locked" : "🔓 Open"})
          </span>
          <button onClick={lockWeek} className="px-3 py-1 rounded bg-[#1f2733] text-xs">
            Lock Week
          </button>
          <button onClick={resetWeek} className="px-3 py-1 rounded bg-red-700 text-xs">
            Reset Week
          </button>
        </div>
      )}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[#0b0f14] text-gray-400">
            <tr>
              <th className="text-left p-3">Rank</th>
              <th className="text-left p-3">Player</th>
              <th className="text-right p-3">Score</th>
            </tr>
          </thead>
          <tbody>
            {leaderboard.length === 0 && (
              <tr>
                <td colSpan={3} className="p-3 text-center text-gray-500">No scores yet.</td>
              </tr>
            )}
            {leaderboard.map((row) => (
              <tr key={row.leaderboard_id} className="border-t border-[#1f2733]">
                <td className="p-3">#{row.rank}</td>
                <td className="p-3">{row.full_name}</td>
                <td className="p-3 text-right font-bold text-court-orange">{row.score}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card p-5">
        <h2 className="font-bold mb-1">📈 Selection Percentage</h2>
        <p className="text-xs text-gray-400 mb-4">
          What share of this week&apos;s {totalManagers} manager{totalManagers === 1 ? "" : "s"} picked
          each player. Useful for spotting herd behavior and differential picks.
        </p>

        {selectionStats.length === 0 ? (
          <p className="text-sm text-gray-500">No lineups submitted for this gameweek yet.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {selectionStats.map((s) => (
              <div key={s.player_id}>
                <div className="flex justify-between text-sm mb-1">
                  <span>{s.full_name}</span>
                  <span className="text-gray-400">
                    Selected by {s.percentage}% of managers ({s.count}/{totalManagers})
                  </span>
                </div>
                <div className="w-full h-2 bg-[#1f2733] rounded overflow-hidden">
                  <div
                    className="h-full bg-court-orange"
                    style={{ width: `${s.percentage}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
