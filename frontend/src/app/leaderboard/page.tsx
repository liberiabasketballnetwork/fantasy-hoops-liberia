"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export default function LeaderboardPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get("/leaderboard")
      .then((res) => setData(res.data))
      .finally(() => setLoading(false));
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

  if (loading) return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-label="Loading leaderboard">
      <div className="skeleton h-8 w-56" />
      <div className="card p-4 flex flex-col gap-3">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="flex items-center gap-3 py-1">
            <div className="skeleton w-6 h-4 flex-shrink-0" />
            <div className="skeleton w-8 h-8 rounded-full flex-shrink-0" />
            <div className="skeleton flex-1 h-4" />
            <div className="skeleton w-14 h-4 flex-shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );

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
                  <td className="p-3">{(row as any).display_name || "Unknown"}</td>
                  <td className="p-3 text-right font-bold text-court-orange">{row.score}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
