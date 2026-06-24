"use client";

export default function HistoryPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">📜 Historical Rankings</h1>
      <p className="text-gray-400 text-sm max-w-xl">
        Once multiple gameweeks have been played, past weekly leaderboards will appear
        here. This page pulls from the same <code>Leaderboard</code> sheet using{" "}
        <code>GET /leaderboard/week/:weekId</code> for each completed week — an admin
        can extend this page with a week-selector dropdown as more weeks are added.
      </p>
      <div className="card p-6 text-center text-gray-500">
        No completed gameweeks yet. Check back after Week 1 finishes!
      </div>
    </div>
  );
}
