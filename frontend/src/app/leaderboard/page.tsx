"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export default function LeaderboardPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectionData, setSelectionData] = useState<any>(null);

  useEffect(() => {
    api
      .get("/leaderboard")
      .then((res) => setData(res.data))
      .finally(() => setLoading(false));

    api
      .get("/selection-stats")
      .then((res) => setSelectionData(res.data))
      .catch(() => setSelectionData(null));
  }, []);

  function shareToFacebook() {
    const text = encodeURIComponent(
      "My Fantasy Hoops Liberia team is ready this week. Think you can beat me? 🏀🇱🇷"
    );
    const url = encodeURIComponent(typeof window !== "undefined" ? window.location.origin : "");
    window.open(
      `https://www.facebook.com/sharer/sharer.php?u=${url}&quote=${text}`,
      "_blank"
    );
  }

  if (loading) return <p className="text-center text-gray-400">Loading leaderboard...</p>;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">🏆 Weekly Leaderboard</h1>
        <button onClick={shareToFacebook} className="btn-primary text-sm">
          Share on Facebook
        </button>
      </div>

      {!data?.week ? (
        <p className="text-gray-400">No active gameweek yet.</p>
      ) : (
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
              {data.leaderboard.length === 0 && (
                <tr>
                  <td colSpan={3} className="p-3 text-center text-gray-500">
                    No scores yet — check back after games are played.
                  </td>
                </tr>
              )}
              {data.leaderboard.map((row: any) => (
                <tr key={row.leaderboard_id} className="border-t border-[#1f2733]">
                  <td className="p-3">#{row.rank}</td>
                  <td className="p-3">{row.display_name}</td>
                  <td className="p-3 text-right font-bold text-court-orange">{row.score}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectionData?.week && (
        <div className="card p-5">
          <h2 className="font-bold mb-1">📈 Selection Percentage</h2>

          {selectionData.locked ? (
            <p className="text-sm text-gray-400">
              🔒 Locked until the submission deadline passes — this stays hidden until lineups
              are due, so it can't be used to copy other managers' picks.
            </p>
          ) : selectionData.stats.length === 0 ? (
            <p className="text-sm text-gray-500">No lineups submitted for this gameweek yet.</p>
          ) : (
            <>
              <p className="text-xs text-gray-400 mb-4">
                What share of this week&apos;s {selectionData.total_managers} manager
                {selectionData.total_managers === 1 ? "" : "s"} picked each player.
              </p>
              <div className="flex flex-col gap-3">
                {selectionData.stats.map((s: any) => (
                  <div key={s.player_id}>
                    <div className="flex justify-between text-sm mb-1">
                      <span>{s.display_name}</span>
                      <span className="text-gray-400">Selected by {s.percentage}% of managers</span>
                    </div>
                    <div className="w-full h-2 bg-[#1f2733] rounded overflow-hidden">
                      <div className="h-full bg-court-orange" style={{ width: `${s.percentage}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
