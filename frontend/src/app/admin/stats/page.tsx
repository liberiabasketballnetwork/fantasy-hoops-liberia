"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useRequireAdmin } from "@/hooks/useRequireAdmin";

export default function AdminStatsPage() {
  const { user, loading } = useRequireAdmin();
  const [players, setPlayers] = useState<any[]>([]);
  const [games, setGames] = useState<any[]>([]);
  const [message, setMessage] = useState("");

  const [gameForm, setGameForm] = useState({ home_team: "", away_team: "", game_date: "" });
  const [statForm, setStatForm] = useState({
    game_id: "",
    player_id: "",
    points: 0,
    rebounds: 0,
    assists: 0,
    steals: 0,
    blocks: 0,
    turnovers: 0,
    minutes_played: 0,
  });

  async function load() {
    const playersRes = await api.get("/players");
    setPlayers(playersRes.data.players || []);
  }

  useEffect(() => {
    if (user?.isAdmin) load();
  }, [user]);

  async function addGame() {
    setMessage("");
    try {
      const res = await api.post("/admin/add-game", gameForm);
      setGames([...games, res.data.game]);
      setMessage("✅ Game added.");
    } catch (err: any) {
      setMessage(err?.response?.data?.error || "Failed to add game.");
    }
  }

  async function submitStat() {
    setMessage("");
    try {
      await api.post("/admin/input-stats", statForm);
      setMessage("✅ Stat line saved.");
    } catch (err: any) {
      setMessage(err?.response?.data?.error || "Failed to save stat.");
    }
  }

  if (loading || !user) return <p className="text-center text-gray-400">Loading...</p>;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">📈 Input Game Stats</h1>
      {message && <div className="card p-3 text-sm">{message}</div>}

      <div className="card p-5">
        <h2 className="font-bold mb-3">1. Add a Game</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input className="input-field" placeholder="Home team" value={gameForm.home_team}
            onChange={(e) => setGameForm({ ...gameForm, home_team: e.target.value })} />
          <input className="input-field" placeholder="Away team" value={gameForm.away_team}
            onChange={(e) => setGameForm({ ...gameForm, away_team: e.target.value })} />
          <input type="date" className="input-field" value={gameForm.game_date}
            onChange={(e) => setGameForm({ ...gameForm, game_date: e.target.value })} />
        </div>
        <button onClick={addGame} className="btn-primary mt-3">Add Game</button>
        {games.length > 0 && (
          <p className="text-xs text-gray-400 mt-2">
            Latest game_id: <code>{games[games.length - 1].game_id}</code> — paste it below.
          </p>
        )}
      </div>

      <div className="card p-5">
        <h2 className="font-bold mb-3">2. Enter Player Stat Line</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <input className="input-field" placeholder="Game ID" value={statForm.game_id}
            onChange={(e) => setStatForm({ ...statForm, game_id: e.target.value })} />
          <select className="input-field" value={statForm.player_id}
            onChange={(e) => setStatForm({ ...statForm, player_id: e.target.value })}>
            <option value="">Select player</option>
            {players.map((p) => <option key={p.player_id} value={p.player_id}>{p.full_name}</option>)}
          </select>
          {(["points", "rebounds", "assists", "steals", "blocks", "turnovers", "minutes_played"] as const).map((field) => (
            <input
              key={field}
              type="number"
              className="input-field"
              placeholder={field}
              value={(statForm as any)[field]}
              onChange={(e) => setStatForm({ ...statForm, [field]: Number(e.target.value) })}
            />
          ))}
        </div>
        <button onClick={submitStat} className="btn-primary mt-3">Save Stat Line</button>
      </div>

      <p className="text-xs text-gray-500">
        After entering stats for all players, go to the Admin Dashboard and click
        &quot;Calculate Weekly Scores&quot; on the active gameweek to update the leaderboard.
      </p>
    </div>
  );
}
