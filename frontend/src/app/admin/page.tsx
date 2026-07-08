"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useRequireAdmin } from "@/hooks/useRequireAdmin";
import { AppModal, ConfirmDialog, LoadingOverlay } from "@/components/ui";

export default function AdminPage() {
  const { user, loading } = useRequireAdmin();
  const [weeks, setWeeks] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [message, setMessage] = useState("");
  const [settings, setSettings] = useState({ salary_cap_enabled: true, budget_cap: 100 });
  const [weekForm, setWeekForm] = useState({ start_date: "", end_date: "", submission_deadline: "" });
  const [teamForm, setTeamForm] = useState({ team_name: "", division: "" });

  // Rollback state
  const [rollbackWeekId, setRollbackWeekId] = useState<string | null>(null);
  const [rollingBack, setRollingBack] = useState(false);

  // Force-add-game state
  const [forceGameWeekId, setForceGameWeekId] = useState<string | null>(null);
  const [forceGameForm, setForceGameForm] = useState({ home_team: "", away_team: "", game_date: "" });
  const [forcingGame, setForcingGame] = useState(false);

  // Admin user edit state
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editingDisplayName, setEditingDisplayName] = useState("");

  // Reset password state
  const [resetPasswordUserId, setResetPasswordUserId] = useState<string | null>(null);
  const [resetPasswordUserName, setResetPasswordUserName] = useState("");
  const [resettingPassword, setResettingPassword] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // FHDS: Weekly score calculation
  const [calculatingWeeklyScores, setCalculatingWeeklyScores] = useState(false);

  // FHDS: Price update
  const [updatingPrices, setUpdatingPrices] = useState(false);

  // FHDS: AppModal state
  const [modal, setModal] = useState<{
    open: boolean;
    type: "success" | "warning" | "error" | "info";
    title: string;
    message: string;
    details?: string[];
  }>({ open: false, type: "success", title: "", message: "" });
  const closeModal = () => setModal((m) => ({ ...m, open: false }));

  useEffect(() => { loadAll(); }, []);

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

  async function confirmForceAddGame() {
    if (!forceGameWeekId) return;
    setForcingGame(true);
    try {
      const res = await api.post("/admin/force-add-game", { ...forceGameForm, week_id: forceGameWeekId });
      setMessage(`✅ ${res.data.message}`);
      setForceGameWeekId(null);
      setForceGameForm({ home_team: "", away_team: "", game_date: "" });
    } catch (err: any) {
      setMessage(err?.response?.data?.error || "Failed to add game via override.");
    } finally {
      setForcingGame(false);
    }
  }

  // FHDS: Calculate Weekly Scores with LoadingOverlay + AppModal
  async function calculateWeeklyScores(weekId: string) {
    setCalculatingWeeklyScores(true);
    try {
      const res = await api.post("/admin/calculate-weekly-scores", { week_id: weekId });
      const count = res.data.leaderboard?.length ?? 0;
      setModal({
        open: true,
        type: "success",
        title: "Weekly Scores Calculated",
        message: "The leaderboard has been updated for this gameweek.",
        details: [
          `${count} user score${count !== 1 ? "s" : ""} processed`,
          "Leaderboard updated",
          "Weekly calculation completed",
        ],
      });
      loadAll();
    } catch (err: any) {
      const errMsg = err?.response?.data?.error || "Failed to calculate weekly scores.";
      const isAlreadyDone = errMsg.toLowerCase().includes("already calculated");
      setModal({
        open: true,
        type: isAlreadyDone ? "warning" : "error",
        title: isAlreadyDone ? "Already Calculated" : "Calculation Failed",
        message: errMsg,
      });
    } finally {
      setCalculatingWeeklyScores(false);
    }
  }

  // FHDS: Update Player Prices with LoadingOverlay + AppModal
  async function updatePlayerPrices(weekId: string) {
    setUpdatingPrices(true);
    try {
      const res = await api.post("/admin/update-player-prices", { week_id: weekId });
      setModal({
        open: true,
        type: "success",
        title: "Player Prices Updated",
        message: "Fantasy prices have been adjusted based on this week's performance.",
        details: [
          `${res.data.updated_count ?? 0} players increased or decreased`,
          `${res.data.no_change_count ?? 0} players unchanged`,
          `${res.data.ignored_count ?? 0} players had no stats this week`,
          "Price history updated",
        ],
      });
      loadAll();
    } catch (err: any) {
      const errMsg = err?.response?.data?.error || "Failed to update player prices.";
      const isAlreadyDone = errMsg.toLowerCase().includes("already been updated");
      setModal({
        open: true,
        type: isAlreadyDone ? "warning" : "error",
        title: isAlreadyDone ? "Already Updated" : "Update Failed",
        message: errMsg,
      });
    } finally {
      setUpdatingPrices(false);
    }
  }

  if (loading || !user) return null;

  return (
    <div className="flex flex-col gap-5">
      {/* FHDS Loading overlays */}
      <LoadingOverlay visible={calculatingWeeklyScores} title="Calculating Weekly Scores..." message="Processing player statistics and updating the leaderboard." />
      <LoadingOverlay visible={updatingPrices} title="Updating Player Prices..." message="Adjusting fantasy prices based on this week's performance." />

      {/* FHDS Result modal */}
      <AppModal open={modal.open} type={modal.type} title={modal.title} message={modal.message} details={modal.details} confirmText="OK" onConfirm={closeModal} />

      <h1 className="text-2xl font-bold">⚙️ Admin Dashboard</h1>

      {message && <div className="card p-3 text-sm">{message}</div>}

      {/* Quick links */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Link href="/admin/stats" className="card p-4 hover:border-court-orange">
          <p className="font-bold">📈 Input Stats</p>
          <p className="text-xs text-gray-400">Enter game stats & games</p>
        </Link>
        <Link href="/admin/import-stats" className="card p-4 hover:border-court-orange">
          <p className="font-bold">📄 Import Stats</p>
          <p className="text-xs text-gray-400">Upload an HTML stats file and preview parsed data</p>
        </Link>
        <Link href="/admin/players" className="card p-4 hover:border-court-orange">
          <p className="font-bold">👥 Manage Players</p>
          <p className="text-xs text-gray-400">Add, edit, or update player info</p>
        </Link>
        <Link href="/admin/leaderboard" className="card p-4 hover:border-court-orange">
          <p className="font-bold">🏆 Leaderboard Tools</p>
          <p className="text-xs text-gray-400">View and manage leaderboard</p>
        </Link>
        <Link href="/players" className="card p-4 hover:border-court-orange">
          <p className="font-bold">👀 View as Player</p>
          <p className="text-xs text-gray-400">See the app as a user</p>
        </Link>
      </div>

      {/* Salary Cap Settings */}
      <div className="card p-5">
        <h2 className="font-bold mb-3">⚙️ Settings</h2>
        <div className="flex items-center gap-4 text-sm">
          <span>Salary Cap:</span>
          <span className={settings.salary_cap_enabled ? "text-court-green" : "text-gray-400"}>
            {settings.salary_cap_enabled ? `Enabled (${settings.budget_cap} credits)` : "Disabled"}
          </span>
          <button
            onClick={async () => {
              const newVal = !settings.salary_cap_enabled;
              await api.post("/admin/settings", { salary_cap_enabled: newVal });
              setSettings((s) => ({ ...s, salary_cap_enabled: newVal }));
            }}
            className="px-3 py-1 rounded bg-[#1f2733] text-xs"
          >
            Toggle
          </button>
        </div>
      </div>

      {/* Current Gameweek */}
      <div className="card p-5">
        <h2 className="font-bold mb-3">📅 Current Gameweek</h2>
        {weeks.length === 0 ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-gray-400">No active gameweek. Create one below.</p>
            <div className="flex flex-wrap gap-2">
              <input type="date" className="input-field w-auto" placeholder="Start date" value={weekForm.start_date} onChange={(e) => setWeekForm({ ...weekForm, start_date: e.target.value })} />
              <input type="date" className="input-field w-auto" placeholder="End date" value={weekForm.end_date} onChange={(e) => setWeekForm({ ...weekForm, end_date: e.target.value })} />
              <input type="datetime-local" className="input-field w-auto" placeholder="Deadline" value={weekForm.submission_deadline} onChange={(e) => setWeekForm({ ...weekForm, submission_deadline: e.target.value })} />
              <button onClick={createWeek} className="btn-primary text-sm">Create Gameweek</button>
            </div>
          </div>
        ) : (
          weeks.map((w) => (
            <div key={w.week_id} className="text-sm">
              <div className="flex flex-wrap gap-2 text-gray-400 mb-3">
                <span>{w.start_date} → {w.end_date}</span>
                <span>·</span>
                <span>Deadline: {w.submission_deadline}</span>
                <span>·</span>
                <span className={w.is_locked === "TRUE" ? "text-red-400" : "text-court-green"}>
                  {w.is_locked === "TRUE" ? "🔒 Locked" : "🟢 Open"}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
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
                  <button onClick={() => setForceGameWeekId(w.week_id)} className="px-3 py-1 rounded bg-yellow-600 text-xs font-semibold">
                    ⚠️ Force Add Game
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Teams */}
      <div className="card p-5">
        <h2 className="font-bold mb-3">Teams ({teams.length})</h2>
        <div className="flex flex-wrap gap-2 mb-3">
          <input className="input-field w-auto" placeholder="Team name" value={teamForm.team_name} onChange={(e) => setTeamForm({ ...teamForm, team_name: e.target.value })} />
          <input className="input-field w-auto" placeholder="Division" value={teamForm.division} onChange={(e) => setTeamForm({ ...teamForm, division: e.target.value })} />
          <button onClick={async () => { await api.post("/admin/add-team", teamForm); setMessage("✅ Team added."); loadAll(); }} className="btn-primary text-sm">Add Team</button>
        </div>
        <div className="flex flex-col gap-1 text-sm">
          {teams.map((t) => (
            <div key={t.team_id} className="flex justify-between border-b border-[#1f2733] py-1">
              <span>{t.team_name}</span>
              <span className="text-gray-400">{t.division || "—"}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Users */}
      <div className="card p-5">
        <h2 className="font-bold mb-3">Users ({users.length})</h2>
        <div className="flex flex-col gap-1 text-sm max-h-60 overflow-y-auto">
          {users.map((u: any) => (
            <div key={u.user_id} className="border-b border-[#1f2733] py-2">
              <div className="flex justify-between items-center">
                <div>
                  <span className="font-medium">{u.full_name}</span>
                  {u.display_name && <span className="ml-2 text-xs text-court-orange">@{u.display_name}</span>}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-gray-400 text-xs">{u.phone || u.email || "—"}</span>
                  <button onClick={() => { setEditingUserId(u.user_id); setEditingDisplayName(u.display_name || ""); }} className="text-xs text-court-orange">Edit Name</button>
                  <button onClick={() => { setResetPasswordUserId(u.user_id); setResetPasswordUserName(u.display_name || u.full_name); setTempPassword(null); }} className="text-xs text-red-400">Reset Password</button>
                </div>
              </div>
              {editingUserId === u.user_id && (
                <div className="flex items-center gap-2 mt-2">
                  <input className="input-field flex-1 py-1 text-xs" placeholder="Display name" value={editingDisplayName} onChange={(e) => setEditingDisplayName(e.target.value)} />
                  <button onClick={() => adminSaveDisplayName(u.user_id)} className="px-2 py-1 rounded bg-court-orange text-xs">Save</button>
                  <button onClick={() => setEditingUserId(null)} className="px-2 py-1 rounded bg-[#1f2733] text-xs">✕</button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Rollback ConfirmDialog */}
      <ConfirmDialog
        open={!!rollbackWeekId && !rollingBack && !tempPassword}
        title="Rollback Last Calculation"
        message="Are you sure you want to rollback the last score calculation? This will restore the previous state."
        confirmText="Confirm Rollback"
        loading={rollingBack}
        loadingText="Rolling back..."
        onConfirm={confirmRollback}
        onCancel={() => setRollbackWeekId(null)}
      />

      {/* Reset Password modal */}
      {(resetPasswordUserId || tempPassword) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="card p-6 max-w-md w-full border-2 border-red-700">
            {!tempPassword ? (
              <>
                <h2 className="font-bold text-red-400 mb-2">Reset Password</h2>
                <p className="text-sm text-gray-300 mb-5">
                  Reset the password for <span className="font-bold">{resetPasswordUserName}</span>? A secure temporary password will be generated.
                </p>
                <div className="flex justify-end gap-3">
                  <button onClick={() => setResetPasswordUserId(null)} disabled={resettingPassword} className="px-4 py-2 rounded-lg bg-[#1f2733] text-sm font-semibold">Cancel</button>
                  <button onClick={confirmResetPassword} disabled={resettingPassword} className="px-4 py-2 rounded-lg bg-red-700 text-sm font-semibold">
                    {resettingPassword ? "Resetting..." : "Confirm Reset"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 className="font-bold text-green-400 mb-2">✅ Password Reset</h2>
                <p className="text-sm text-gray-300 mb-3">Share this temporary password with the user. It will not be shown again.</p>
                <div className="flex items-center gap-2 bg-[#0b0f14] rounded-lg px-4 py-3 mb-4">
                  <code className="flex-1 text-court-orange font-bold tracking-widest text-sm">{tempPassword}</code>
                  <button onClick={() => { navigator.clipboard.writeText(tempPassword!); setCopied(true); }} className="px-3 py-1 rounded bg-[#1f2733] text-xs">
                    {copied ? "Copied!" : "Copy"}
                  </button>
                </div>
                <button onClick={() => { setTempPassword(null); setResetPasswordUserId(null); }} className="w-full px-4 py-2 rounded-lg bg-[#1f2733] text-sm font-semibold">Done</button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Force Add Game modal */}
      {forceGameWeekId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="card p-6 max-w-md w-full border-2 border-yellow-600">
            <h2 className="font-bold text-yellow-400 mb-2">⚠️ WARNING</h2>
            <p className="text-sm text-gray-300 mb-4">
              This allows adding a missing fixture after weekly lock. This should only be used to correct scheduling mistakes. Users will remain locked.
            </p>
            <div className="flex flex-col gap-3 mb-5">
              <input className="input-field" placeholder="Home team" value={forceGameForm.home_team} onChange={(e) => setForceGameForm({ ...forceGameForm, home_team: e.target.value })} />
              <input className="input-field" placeholder="Away team" value={forceGameForm.away_team} onChange={(e) => setForceGameForm({ ...forceGameForm, away_team: e.target.value })} />
              <input type="date" className="input-field" value={forceGameForm.game_date} onChange={(e) => setForceGameForm({ ...forceGameForm, game_date: e.target.value })} />
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => { setForceGameWeekId(null); setForceGameForm({ home_team: "", away_team: "", game_date: "" }); }} disabled={forcingGame} className="px-4 py-2 rounded-lg bg-[#1f2733] text-sm font-semibold">Cancel</button>
              <button onClick={confirmForceAddGame} disabled={forcingGame || !forceGameForm.home_team || !forceGameForm.away_team || !forceGameForm.game_date} className="px-4 py-2 rounded-lg bg-yellow-600 text-sm font-semibold">
                {forcingGame ? "Adding..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
