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

  // Rollback protection UI state - purely additive, does not affect any
  // existing week/score/team logic above.
  const [rollbackWeekId, setRollbackWeekId] = useState<string | null>(null);
  const [rollingBack, setRollingBack] = useState(false);

  // Force-add-game override state — only shown for locked weeks.
  const [forceGameWeekId, setForceGameWeekId] = useState<string | null>(null);
  const [forceGameForm, setForceGameForm] = useState({ home_team: "", away_team: "", game_date: "" });
  const [forcingGame, setForcingGame] = useState(false);

  // Admin display name edit state.
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editingDisplayName, setEditingDisplayName] = useState("");

  // Admin reset-password state.
  const [resetPasswordUserId, setResetPasswordUserId] = useState<string | null>(null);
  const [resetPasswordUserName, setResetPasswordUserName] = useState("");
  const [resettingPassword, setResettingPassword] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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

  async function resetWeek(weekId: string) {
    try {
      await api.post("/admin/reset-week", { week_id: weekId });
      setMessage("🔁 Week reset.");
      loadAll();
    } catch (err: any) {
      setMessage(err?.response?.data?.error || "Failed to reset week.");
    }
  }

  // Rollback protection - purely additive. Does not touch score
  // calculation, lock/reset, or any other existing week action above.
  async function confirmRollback() {
    if (!rollbackWeekId) return;
    setRollingBack(true);
    try {
      await api.post("/admin/calculation-backup/rollback", { week_id: rollbackWeekId });
      setMessage("Last calculation successfully rolled back.");
      setRollbackWeekId(null);
      loadAll();
    } catch (err: any) {
      setMessage(err?.response?.data?.error || "Failed to roll back the last calculation.");
    } finally {
      setRollingBack(false);
    }
  }

  async function confirmResetPassword() {
    if (!resetPasswordUserId) return;
    setResettingPassword(true);
    try {
      const res = await api.post(`/admin/users/${resetPasswordUserId}/reset-password`);
      setTempPassword(res.data.temp_password);
      setCopied(false);
    } catch (err: any) {
      setMessage(err?.response?.data?.error || "Failed to reset password.");
      setResetPasswordUserId(null);
    } finally {
      setResettingPassword(false);
    }
  }

  async function adminSaveDisplayName(userId: string) {
    if (!editingDisplayName.trim()) return;
    try {
      await api.patch(`/admin/users/${userId}/display-name`, { display_name: editingDisplayName });
      setMessage("✅ Display name updated.");
      setEditingUserId(null);
      loadAll();
    } catch (err: any) {
      setMessage(err?.response?.data?.error || "Failed to update display name.");
    }
  }

  async function confirmForceAddGame() {
    if (!forceGameWeekId) return;
    setForcingGame(true);
    try {
      const res = await api.post("/admin/force-add-game", {
        ...forceGameForm,
        week_id: forceGameWeekId,
      });
      setMessage(`✅ ${res.data.message}`);
      setForceGameWeekId(null);
      setForceGameForm({ home_team: "", away_team: "", game_date: "" });
    } catch (err: any) {
      setMessage(err?.response?.data?.error || "Failed to add game via override.");
    } finally {
      setForcingGame(false);
    }
  }

  // Weekly score calculation engine - the active scoring system. The old
  // "Calculate Scores" button/handler (scoringEngine.ts-backed) was
  // removed during a codebase cleanup pass.
  const [calculatingWeeklyScores, setCalculatingWeeklyScores] = useState(false);
  const [updatingPrices, setUpdatingPrices] = useState(false);

  async function calculateWeeklyScores(weekId: string) {
    setCalculatingWeeklyScores(true);
    setMessage("");
    try {
      const res = await api.post("/admin/calculate-weekly-scores", { week_id: weekId });
      setMessage(res.data.message || "Weekly scores calculated successfully.");
      loadAll();
    } catch (err: any) {
      setMessage(err?.response?.data?.error || "Failed to calculate weekly scores.");
    } finally {
      setCalculatingWeeklyScores(false);
    }
  }

  async function updatePlayerPrices(weekId: string) {
    setUpdatingPrices(true);
    setMessage("");
    try {
      const res = await api.post("/admin/update-player-prices", { week_id: weekId });
      setMessage(res.data.message || "Player prices updated.");
      loadAll();
    } catch (err: any) {
      const msg =
        err?.response?.data?.error ||
        err?.message ||
        "Failed to update player prices. Check Render logs for details.";
      setMessage(msg);
    } finally {
      setUpdatingPrices(false);
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
        <Link href="/admin/import-stats" className="card p-4 hover:border-court-orange">
          <p className="font-bold">📄 Import Stats</p>
          <p className="text-xs text-gray-400">Upload an HTML stats file and preview parsed data</p>
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
              <button
                onClick={() => calculateWeeklyScores(w.week_id)}
                disabled={calculatingWeeklyScores}
                className="px-3 py-1 rounded bg-blue-600 text-xs"
              >
                {calculatingWeeklyScores ? "Calculating..." : "Calculate Weekly Scores"}
              </button>
              <button
                onClick={() => updatePlayerPrices(w.week_id)}
                disabled={updatingPrices}
                className="px-3 py-1 rounded bg-blue-600 text-xs"
              >
                {updatingPrices ? "Updating..." : "Update Player Prices"}
              </button>
              <button onClick={() => resetWeek(w.week_id)} className="px-3 py-1 rounded bg-red-700 text-xs">Reset Week</button>
              <button onClick={() => setRollbackWeekId(w.week_id)} className="px-3 py-1 rounded bg-red-700 text-xs">Rollback Last Calculation</button>
              {String(w.is_locked).toUpperCase() === "TRUE" && (
                <button
                  onClick={() => setForceGameWeekId(w.week_id)}
                  className="px-3 py-1 rounded bg-yellow-600 text-xs font-semibold"
                >
                  ⚠️ Force Add Game
                </button>
              )}
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
          {users.map((u: any) => (
            <div key={u.user_id} className="border-b border-[#1f2733] py-2">
              <div className="flex justify-between items-center">
                <div>
                  <span className="font-medium">{u.full_name}</span>
                  {u.display_name && (
                    <span className="ml-2 text-xs text-court-orange">@{u.display_name}</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-gray-400 text-xs">{u.phone || u.email || "—"}</span>
                  <button
                    onClick={() => {
                      setEditingUserId(u.user_id);
                      setEditingDisplayName(u.display_name || "");
                    }}
                    className="text-xs text-court-orange"
                  >
                    Edit Name
                  </button>
                  <button
                    onClick={() => {
                      setResetPasswordUserId(u.user_id);
                      setResetPasswordUserName(u.display_name || u.full_name);
                      setTempPassword(null);
                    }}
                    className="text-xs text-red-400"
                  >
                    Reset Password
                  </button>
                </div>
              </div>
              {editingUserId === u.user_id && (
                <div className="flex items-center gap-2 mt-2">
                  <input
                    className="input-field flex-1 py-1 text-xs"
                    placeholder="Display name"
                    value={editingDisplayName}
                    onChange={(e) => setEditingDisplayName(e.target.value)}
                  />
                  <button
                    onClick={() => adminSaveDisplayName(u.user_id)}
                    className="px-2 py-1 rounded bg-court-orange text-xs"
                  >Save</button>
                  <button
                    onClick={() => setEditingUserId(null)}
                    className="px-2 py-1 rounded bg-[#1f2733] text-xs"
                  >✕</button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {rollbackWeekId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="card p-6 max-w-md w-full border-2 border-red-700">
            <h2 className="font-bold text-red-500 mb-2">⚠️ WARNING</h2>
            <p className="text-sm text-gray-300 mb-5">
              Are you sure you want to rollback the last score calculation? This will restore
              the previous state.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setRollbackWeekId(null)}
                disabled={rollingBack}
                className="px-4 py-2 rounded-lg bg-[#1f2733] text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={confirmRollback}
                disabled={rollingBack}
                className="px-4 py-2 rounded-lg bg-red-700 text-sm font-semibold"
              >
                {rollingBack ? "Rolling back..." : "Confirm Rollback"}
              </button>
            </div>
          </div>
        </div>
      )}

      {(resetPasswordUserId || tempPassword) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="card p-6 max-w-md w-full border-2 border-red-700">
            {!tempPassword ? (
              <>
                <h2 className="font-bold text-red-400 mb-2">Reset Password</h2>
                <p className="text-sm text-gray-300 mb-5">
                  Are you sure you want to reset the password for{" "}
                  <span className="font-bold">{resetPasswordUserName}</span>? A secure
                  temporary password will be generated. Share it with the user and ask
                  them to change it immediately.
                </p>
                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => setResetPasswordUserId(null)}
                    disabled={resettingPassword}
                    className="px-4 py-2 rounded-lg bg-[#1f2733] text-sm font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmResetPassword}
                    disabled={resettingPassword}
                    className="px-4 py-2 rounded-lg bg-red-700 text-sm font-semibold"
                  >
                    {resettingPassword ? "Resetting..." : "Confirm Reset"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 className="font-bold text-green-400 mb-2">✅ Password Reset</h2>
                <p className="text-sm text-gray-300 mb-3">
                  Share this temporary password with the user. It will not be shown again.
                </p>
                <div className="flex items-center gap-2 bg-[#0b0f14] rounded-lg px-4 py-3 mb-4">
                  <code className="flex-1 text-court-orange font-bold tracking-widest text-sm">
                    {tempPassword}
                  </code>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(tempPassword);
                      setCopied(true);
                    }}
                    className="px-3 py-1 rounded bg-[#1f2733] text-xs"
                  >
                    {copied ? "Copied!" : "Copy"}
                  </button>
                </div>
                <button
                  onClick={() => { setTempPassword(null); setResetPasswordUserId(null); }}
                  className="w-full px-4 py-2 rounded-lg bg-[#1f2733] text-sm font-semibold"
                >
                  Done
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {forceGameWeekId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="card p-6 max-w-md w-full border-2 border-yellow-600">
            <h2 className="font-bold text-yellow-400 mb-2">⚠️ WARNING</h2>
            <p className="text-sm text-gray-300 mb-4">
              This allows adding a missing fixture after weekly lock. This should only be used
              to correct scheduling mistakes. Users will remain locked.
            </p>
            <div className="flex flex-col gap-3 mb-5">
              <input
                className="input-field"
                placeholder="Home team"
                value={forceGameForm.home_team}
                onChange={(e) => setForceGameForm({ ...forceGameForm, home_team: e.target.value })}
              />
              <input
                className="input-field"
                placeholder="Away team"
                value={forceGameForm.away_team}
                onChange={(e) => setForceGameForm({ ...forceGameForm, away_team: e.target.value })}
              />
              <input
                type="date"
                className="input-field"
                value={forceGameForm.game_date}
                onChange={(e) => setForceGameForm({ ...forceGameForm, game_date: e.target.value })}
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setForceGameWeekId(null);
                  setForceGameForm({ home_team: "", away_team: "", game_date: "" });
                }}
                disabled={forcingGame}
                className="px-4 py-2 rounded-lg bg-[#1f2733] text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={confirmForceAddGame}
                disabled={forcingGame || !forceGameForm.home_team || !forceGameForm.away_team || !forceGameForm.game_date}
                className="px-4 py-2 rounded-lg bg-yellow-600 text-sm font-semibold"
              >
                {forcingGame ? "Adding..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
