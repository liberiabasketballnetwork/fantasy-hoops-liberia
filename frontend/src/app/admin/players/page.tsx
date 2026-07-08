"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useRequireAdmin } from "@/hooks/useRequireAdmin";
import { PriceBadge } from "@/components/ui";

export default function AdminPlayersPage() {
  const { user, loading } = useRequireAdmin();
  const [players, setPlayers] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({
    full_name: "",
    team_id: "",
    position: "PG",
    fantasy_price: 0,
    average_points: 0,
    average_rebounds: 0,
    average_assists: 0,
  });

  async function load() {
    const [playersRes, teamsRes] = await Promise.all([api.get("/players"), api.get("/teams")]);
    setPlayers(playersRes.data.players || []);
    setTeams(teamsRes.data.teams || []);
  }

  useEffect(() => {
    if (user?.isAdmin) load();
  }, [user]);

  async function addPlayer() {
    setMessage("");
    try {
      await api.post("/admin/add-player", form);
      setMessage("✅ Player added.");
      setForm({ ...form, full_name: "" });
      load();
    } catch (err: any) {
      setMessage(err?.response?.data?.error || "Failed to add player.");
    }
  }

  async function deletePlayer(id: string) {
    try {
      await api.delete(`/admin/delete-player/${id}`);
      load();
    } catch (err: any) {
      setMessage(err?.response?.data?.error || "Failed to delete player.");
    }
  }

  if (loading || !user) return <p className="text-center text-gray-400">Loading...</p>;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">🧺 Manage Players</h1>
      {message && <div className="card p-3 text-sm">{message}</div>}

      <div className="card p-5">
        <h2 className="font-bold mb-3">Add Player</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input className="input-field" placeholder="Full name" value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          <select className="input-field" value={form.team_id}
            onChange={(e) => setForm({ ...form, team_id: e.target.value })}>
            <option value="">Select team</option>
            {teams.map((t) => (
              <option key={t.team_id} value={t.team_id}>{t.team_name}</option>
            ))}
          </select>
          <select className="input-field" value={form.position}
            onChange={(e) => setForm({ ...form, position: e.target.value })}>
            {["PG", "SG", "SF", "PF", "C"].map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <input type="number" className="input-field" placeholder="Avg points" value={form.average_points}
            onChange={(e) => setForm({ ...form, average_points: Number(e.target.value) })} />
          <input type="number" className="input-field" placeholder="Avg rebounds" value={form.average_rebounds}
            onChange={(e) => setForm({ ...form, average_rebounds: Number(e.target.value) })} />
          <input type="number" className="input-field" placeholder="Avg assists" value={form.average_assists}
            onChange={(e) => setForm({ ...form, average_assists: Number(e.target.value) })} />
        </div>
        <button onClick={addPlayer} className="btn-primary mt-3">Add Player</button>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[#0b0f14] text-gray-400">
            <tr>
              <th className="text-left p-3">Name</th>
              <th className="text-left p-3">Position</th>
              <th className="text-left p-3">PPG</th>
              <th className="text-left p-3">RPG</th>
              <th className="text-left p-3">APG</th>
              <th className="text-right p-3">Price</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {players.map((p) => (
              <tr key={p.player_id} className="border-t border-[#1f2733]">
                <td className="p-3">{p.full_name}</td>
                <td className="p-3">{p.position}</td>
                <td className="p-3">{p.average_points}</td>
                <td className="p-3">{p.average_rebounds}</td>
                <td className="p-3">{p.average_assists}</td>
                <td className="p-3 text-right">
                  <PriceBadge
                    current_price={Number(p.current_price ?? p.fantasy_price ?? 0)}
                    previous_price={p.previous_price}
                    price_change={p.price_change}
                    price_trend={p.price_trend}
                    variant="inline"
                  />
                </td>
                <td className="p-3 text-right">
                  <button onClick={() => deletePlayer(p.player_id)} className="text-red-400 text-xs">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
