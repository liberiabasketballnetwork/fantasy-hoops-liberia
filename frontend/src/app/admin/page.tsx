"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useRequireAdmin } from "@/hooks/useRequireAdmin";

export default function AdminDashboard() {
  const { user, loading } = useRequireAdmin();
  const [weeks, setWeeks] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [message, setMessage] = useState("");

  const [weekForm, setWeekForm] = useState({ start_date: "", end_date: "", submission_deadline: "" });
  const [teamForm, setTeamForm] = useState({ team_name: "", division: "" });
  const [settings, setSettings] = useState({ salary_cap_enabled: true, budget_cap: 100 });

  async function loadAll() {
    try {
      const [weeksRes, teamsRes, usersRes, settingsRes] = await Promise.all([
        api.get("/leaderboard").catch(() => ({ data: { week: null } })),
        api.get("/teams"),
        api.get("/admin/users"),
        api.get("/admin/settings").catch(() => ({ data: { salary_cap_enabled: true, budget_cap: 100 } })),
      ]);
      setTeams(teamsRes.data.teams || []);
      setUsers(usersRes.data.users || []);
      setSettings(settingsRes.data);
      if (weeksRes.data.week) setWeeks([weeksRes.data.week]);
    } catch (e) {
      console.error(e);
    }
  }

  useEffect(() => {
    if (user?.isAdmin) loadAll();
  }, [user]);

  async function createWeek() {
    setMessage("");
    try {
      await api.post("/admin/create-week", weekForm);
      setMessage("✅ Gameweek created.");
      loadAll();
    } catch (err: any) {
      setMessage(err?.response?.data?.error || "Failed to create week.");
    }
  }

  async function lockWeek(weekId: string) {
    try {
      await api.post("/admin/lock-week", { week_id: weekId });
      setMessage("🔒 Week locked.");
      loadAll();
    } catch (err: any) {
      setMessage(err?.response?.data?.error || "Failed to lock week.");
    }
  }

  async function calculateScores(weekId: string) {
    try {
      await api.post("/admin/calculate-scores", { week_id: weekId });
      setMessage("📊 Scores calculated and leaderboard updated.");
    } catch (err: any) {
      setMessage(err?.response?.data?.error || "Failed to calculate scores.");
    }
  }

  async function resetWeek(weekId: string) {
    try {
      await api.post("/admin/reset-week", { week_id: weekId });
      setMessage("🔁 Week reset.");
      loadAll();
    } catch (err: any) {
      setMessage(err?.response?.data?.error || "Failed to reset week.");
    }
  }

  async function createTeam() {
    setMessage("");
    try {
      await api.post("/admin/add-team", teamForm);
      setMessage("✅ Team added.");
      setTeamForm({ team_name: "", division: "" });
      loadAll();
    } catch (err: any) {
      setMessage(err?.response?.data?.error || "Failed to add team.");
    }
  }

  async function toggleSalaryCap() {
    const newValue = !settings.salary_cap_enabled;
    setSettings({ ...settings, salary_cap_enabled: newValue });
    try {
      await api.post("/admin/settings", { salary_cap_enabled: newValue });
      // Re-fetch from the server to confirm what was actually saved, rather
      // than trusting the optimistic UI update.
      const confirmRes = await api.get("/admin/settings");
      setSettings(confirmRes.data);
      setMessage(`✅ Salary cap ${confirmRes.data.salary_cap_enabled ? "enabled" : "disabled"}.`);
    } catch (err: any) {
      setSettings({ ...settings, salary_cap_enabled: !newValue });
      setMessage(err?.response?.data?.error || "Failed to update setting.");
    }
  }

  async function updateBudgetCap(value: number) {
    setSettings({ ...settings, budget_cap: value });
    try {
      await api.post("/admin/settings", { budget_cap: value });
      const confirmRes = await api.get("/admin/settings");
      setSettings(confirmRes.data);
    } catch (err: any) {
      setMessage(err?.response?.data?.error || "Failed to update budget.");
    }
  }

  if (loading || !user) return <p className="text-center text-gray-400">Loading admin panel...</p>;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">⚙️ Admin Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Link href="/admin/players" className="card p-4 hover:border-court-orange">
          <p className="font-bold">🧺 Manage Players</p>
          <p className="text-xs text-gray-400">Add, edit, delete players</p>
        </Link>
        <Link href="/admin/stats" className="card p-4 hover:border-court-orange">
          <p className="font-bold">📈 Input Stats</p>
          <p className="text-xs text-gray-400">Enter game stats & games</p>
        </Link>
        <Link href="/admin/leaderboard" className="card p-4 hover:border-court-orange">
          <p className="font-bold">🏆 Leaderboard Tools</p>
          <p className="text-xs text-gray-400">Calculate scores, lock/reset weeks</p>
        </Link>
        <Link href="/players" className="card p-4 hover:border-court-orange">
          <p className="font-bold">👀 View as Player</p>
          <p className="text-xs text-gray-400">See the public player-selection page</p>
        </Link>
      </div>

      {message && <div className="card p-3 text-sm">{message}</div>}

      <div className="card p-5">
        <h2 className="font-bold mb-3">Salary Cap System</h2>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-sm">
              {settings.salary_cap_enabled
                ? "Enabled — users must stay within their budget when picking 5 players."
                : "Disabled — users can pick any 5 players regardless of price."}
            </p>
          </div>
          <button
            onClick={toggleSalaryCap}
            className={`px-4 py-2 rounded-lg text-sm font-semibold ${
              settings.salary_cap_enabled ? "bg-court-orange" : "bg-[#1f2733]"
            }`}
          >
            {settings.salary_cap_enabled ? "ON — Click to Disable" : "OFF — Click to Enable"}
          </button>
        </div>

        {settings.salary_cap_enabled && (
          <div className="mt-4 flex items-center gap-3">
            <label className="text-sm text-gray-400">Budget per user:</label>
            <input
              type="number"
              className="input-field w-28"
              value={settings.budget_cap}
              onChange={(e) => updateBudgetCap(Number(e.target.value))}
            />
            <span className="text-sm text-gray-400">credits</span>
          </div>
        )}
      </div>

      <div className="card p-5">
        <h2 className="font-bold mb-3">Create New Gameweek</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input type="date" className="input-field" value={weekForm.start_date}
            onChange={(e) => setWeekForm({ ...weekForm, start_date: e.target.value })} />
          <input type="date" className="input-field" value={weekForm.end_date}
            onChange={(e) => setWeekForm({ ...weekForm, end_date: e.target.value })} />
          <input type="datetime-local" className="input-field" value={weekForm.submission_deadline}
            onChange={(e) => setWeekForm({ ...weekForm, submission_deadline: e.target.value })} />
        </div>
        <button onClick={createWeek} className="btn-primary mt-3">Start New Week</button>
      </div>

      <div className="card p-5">
        <h2 className="font-bold mb-3">Current Gameweek</h2>
        {weeks.length === 0 ? (
          <p className="text-sm text-gray-400">No active gameweek.</p>
        ) : (
          weeks.map((w) => (
            <div key={w.week_id} className="flex flex-wrap items-center gap-3 text-sm">
              <span>
                {w.start_date} → {w.end_date} ({String(w.is_locked).toUpperCase() === "TRUE" ? "🔒 Locked" : "🔓 Open"})
              </span>
              <button onClick={() => lockWeek(w.week_id)} className="px-3 py-1 rounded bg-[#1f2733] text-xs">Lock Week</button>
              <button onClick={() => calculateScores(w.week_id)} className="px-3 py-1 rounded bg-court-orange text-xs">Calculate Scores</button>
              <button onClick={() => resetWeek(w.week_id)} className="px-3 py-1 rounded bg-red-700 text-xs">Reset Week</button>
            </div>
          ))
        )}
      </div>

      <div className="card p-5">
        <h2 className="font-bold mb-3">Add Team</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input className="input-field" placeholder="Team name" value={teamForm.team_name}
            onChange={(e) => setTeamForm({ ...teamForm, team_name: e.target.value })} />
          <input className="input-field" placeholder="Division (optional)" value={teamForm.division}
            onChange={(e) => setTeamForm({ ...teamForm, division: e.target.value })} />
        </div>
        <button onClick={createTeam} className="btn-primary mt-3">Add Team</button>

        <div className="mt-4 flex flex-wrap gap-2">
          {teams.map((t) => (
            <span key={t.team_id} className="px-3 py-1 rounded bg-[#1f2733] text-xs">
              {t.team_name}
            </span>
          ))}
        </div>
      </div>

      <div className="card p-5">
        <h2 className="font-bold mb-3">Users ({users.length})</h2>
        <div className="flex flex-col gap-1 text-sm max-h-60 overflow-y-auto">
          {users.map((u) => (
            <div key={u.user_id} className="flex justify-between border-b border-[#1f2733] py-1">
              <span>{u.full_name}</span>
              <span className="text-gray-400">{u.email}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
