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

  // Emergency Tools panel
  const [emergencyOpen, setEmergencyOpen] = useState(false);

  // UX-001: Users refresh state
  const [usersRefreshing, setUsersRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // ADMIN-006: Gameweek Participation
  const [selectionStats, setSelectionStats] = useState<any>(null);

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
      const [weeksRes, teamsRes, usersRes, settingsRes, statsRes] = await Promise.all([
        api.get("/leaderboard").catch(() => ({ data: { week: null } })),
        api.get("/teams").catch(() => ({ data: { teams: [] } })),
        api.get("/admin/users").catch((err: any) => { console.error("admin/users error:", err?.response?.status, err?.response?.data); return { data: { users: [] } }; }),
        api.get("/admin/settings").catch(() => ({ data: { salary_cap_enabled: true, budget_cap: 100 } })),
        api.get("/admin/selection-stats").catch(() => null), // ADMIN-006: graceful degradation
      ]);
      setTeams(teamsRes.data.teams || []);
      setUsers(usersRes.data.users || []);
      setSettings(settingsRes.data);
      if (weeksRes.data.week) setWeeks([weeksRes.data.week]);
      setSelectionStats(statsRes?.data ?? null); // ADMIN-006: null if request failed
      setLastUpdated(new Date()); // UX-001: record successful load time
    } catch (e) {
      console.error(e);
      // UX-001: do NOT update lastUpdated on failure — preserve last known good time
    }
  }

  // UX-001: Refresh button handler — wraps loadAll with loading state
  async function refreshUsers() {
    setUsersRefreshing(true);
    try {
      await loadAll();
    } finally {
      setUsersRefreshing(false);
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
      const res = await api.post("/admin/calculation-backup/rollback", { week_id: rollbackWeekId });
      setRollbackWeekId(null);
      setModal({
        open: true,
        type: "success",
        title: "Weekly Rollback Completed",
        message: "The gameweek has been restored to its pre-calculation state.",
        details: [
          "Leaderboard restored",
          `${res.data.restored_player_prices_count ?? 0} player prices restored`,
          `${res.data.removed_price_history_count ?? 0} price history rows removed`,
        ],
      });
      loadAll();
    } catch (err: any) {
      setRollbackWeekId(null);
      setModal({
        open: true,
        type: "error",
        title: "Rollback Failed",
        message: err?.response?.data?.error || "Failed to roll back the last calculation.",
      });
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
      <LoadingOverlay visible={rollingBack} title="Rolling Back..." message="Restoring leaderboard, player prices, and price history." />

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

      {/* Weekly Operations */}
      <div className="card p-5">
        <h2 className="font-bold mb-4">📅 Weekly Operations</h2>

        {/* No week at all */}
        {weeks.length === 0 && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-gray-400">No active gameweek. Create one below.</p>
            <div className="flex flex-wrap gap-2">
              <input type="date" className="input-field w-auto" placeholder="Start date" value={weekForm.start_date} onChange={(e) => setWeekForm({ ...weekForm, start_date: e.target.value })} />
              <input type="date" className="input-field w-auto" placeholder="End date" value={weekForm.end_date} onChange={(e) => setWeekForm({ ...weekForm, end_date: e.target.value })} />
              <input type="datetime-local" className="input-field w-auto" placeholder="Deadline" value={weekForm.submission_deadline} onChange={(e) => setWeekForm({ ...weekForm, submission_deadline: e.target.value })} />
              <button onClick={createWeek} className="btn-primary text-sm">Create Gameweek</button>
            </div>
          </div>
        )}

        {/* Week exists */}
        {weeks.map((w) => {
          const isLocked    = String(w.is_locked).toUpperCase() === "TRUE";
          const scoresCalc  = String(w.scores_calculated).toUpperCase() === "TRUE";
          const pricesUpd   = String(w.prices_updated).toUpperCase() === "TRUE";

          return (
            <div key={w.week_id} className="flex flex-col gap-5">

              {/* Status bar */}
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex flex-wrap items-center gap-3 text-sm text-gray-400">
                  <span>{w.start_date} → {w.end_date}</span>
                  <span>·</span>
                  <span>Deadline: {w.submission_deadline}</span>
                </div>
                <span className={`text-sm font-bold px-2.5 py-0.5 rounded-full ${isLocked ? "bg-red-500/15 text-red-400" : "bg-court-green/15 text-court-green"}`}>
                  {isLocked ? "🔒 Locked" : "🟢 Active"}
                </span>
              </div>

              {/* Workflow checklist */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { label: "Scores Calculated", done: scoresCalc },
                  { label: "Prices Updated",    done: pricesUpd  },
                  { label: "Badges Evaluated",  done: false       },
                  { label: "Notifications Sent",done: false       },
                ].map(({ label, done }) => (
                  <div
                    key={label}
                    className={`text-xs px-3 py-2 rounded-lg flex items-center gap-1.5 ${
                      done ? "bg-court-green/10 text-court-green" : "bg-[#0b0f14] text-gray-500"
                    }`}
                  >
                    <span>{done ? "✓" : "○"}</span>
                    <span>{label}</span>
                  </div>
                ))}
              </div>

              {/* Active week operations */}
              {!isLocked && (
                <div className="flex flex-col gap-2">
                  <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Workflow</p>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => lockWeek(w.week_id)} className="px-3 py-1.5 rounded bg-[#1f2733] hover:bg-[#2a3441] text-xs font-semibold">
                      🔒 Lock Week
                    </button>
                    <button
                      onClick={() => calculateWeeklyScores(w.week_id)}
                      disabled={calculatingWeeklyScores}
                      className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-xs font-semibold disabled:opacity-50"
                    >
                      {calculatingWeeklyScores ? "Calculating..." : "📊 Calculate Scores"}
                    </button>
                    <button
                      onClick={() => updatePlayerPrices(w.week_id)}
                      disabled={updatingPrices}
                      className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-xs font-semibold disabled:opacity-50"
                    >
                      {updatingPrices ? "Updating..." : "💰 Update Prices"}
                    </button>
                    <button
                      onClick={async () => {
                        try {
                          const res = await api.post(`/admin/achievements/evaluate/${w.week_id}`);
                          setMessage(`✅ ${res.data.message}`);
                        } catch (err: any) {
                          setMessage(err?.response?.data?.error || "Failed to evaluate achievements.");
                        }
                      }}
                      className="px-3 py-1.5 rounded bg-[#1f2733] hover:bg-[#2a3441] text-xs font-semibold"
                    >
                      🏅 Evaluate Badges
                    </button>
                    <a href={`/reports/${w.week_id}`} className="px-3 py-1.5 rounded bg-[#1f2733] hover:bg-[#2a3441] text-xs font-semibold inline-block">
                      📋 View Report
                    </a>
                  </div>
                </div>
              )}

              {/* Locked week: success panel + create next week */}
              {isLocked && (
                <div className="flex flex-col gap-4">
                  <div className="rounded-lg border border-court-green/30 bg-court-green/5 p-4">
                    <p className="text-sm font-semibold text-court-green">✅ Gameweek Finalized</p>
                    <p className="text-xs text-gray-400 mt-1">
                      This gameweek has been locked and finalized. You may now create the next gameweek.
                    </p>
                  </div>
                  <a href={`/reports/${w.week_id}`} className="px-3 py-1.5 rounded bg-[#1f2733] hover:bg-[#2a3441] text-xs font-semibold inline-block w-fit">
                    📋 View Final Report
                  </a>
                  <div className="flex flex-col gap-2">
                    <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Create Next Gameweek</p>
                    <div className="flex flex-wrap gap-2">
                      <input type="date" className="input-field w-auto" placeholder="Start date" value={weekForm.start_date} onChange={(e) => setWeekForm({ ...weekForm, start_date: e.target.value })} />
                      <input type="date" className="input-field w-auto" placeholder="End date" value={weekForm.end_date} onChange={(e) => setWeekForm({ ...weekForm, end_date: e.target.value })} />
                      <input type="datetime-local" className="input-field w-auto" placeholder="Deadline" value={weekForm.submission_deadline} onChange={(e) => setWeekForm({ ...weekForm, submission_deadline: e.target.value })} />
                      <button onClick={createWeek} className="btn-primary text-sm">Create Gameweek</button>
                    </div>
                  </div>
                </div>
              )}

              {/* Emergency Tools — collapsed by default */}
              <div className="border-t border-[#1f2733] pt-3">
                <button
                  onClick={() => setEmergencyOpen((o) => !o)}
                  className="flex items-center gap-2 text-xs text-yellow-500 font-semibold hover:text-yellow-400 transition-colors"
                >
                  <span className={`transition-transform ${emergencyOpen ? "rotate-90" : ""}`}>▶</span>
                  ⚠️ Emergency Tools
                </button>
                {emergencyOpen && (
                  <div className="mt-3 flex flex-col gap-3 pl-4 border-l border-yellow-600/30">
                    <p className="text-xs text-gray-500">
                      These operations are destructive. Use only to recover from calculation errors.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => resetWeek(w.week_id)} className="px-3 py-1.5 rounded bg-red-900/40 border border-red-700/50 text-red-400 text-xs font-semibold hover:bg-red-900/60">
                        🔁 Reset Week
                      </button>
                      <button onClick={() => setRollbackWeekId(w.week_id)} className="px-3 py-1.5 rounded bg-red-900/40 border border-red-700/50 text-red-400 text-xs font-semibold hover:bg-red-900/60">
                        ↩️ Rollback Last Calculation
                      </button>
                      {isLocked && (
                        <button onClick={() => setForceGameWeekId(w.week_id)} className="px-3 py-1.5 rounded bg-yellow-900/40 border border-yellow-700/50 text-yellow-400 text-xs font-semibold hover:bg-yellow-900/60">
                          ⚠️ Force Add Game
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>

            </div>
          );
        })}
      </div>

      {/* ADMIN-006: Gameweek Participation */}
      {selectionStats && (
        <div className="card p-5">
          <h2 className="font-bold mb-4">📊 Gameweek Participation</h2>

          {/* Week label */}
          {selectionStats.week && (
            <p className="text-xs text-gray-400 mb-4">
              Week: {selectionStats.week.start_date} → {selectionStats.week.end_date}
            </p>
          )}

          {/* Summary stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            {[
              { label: "Registered Managers", value: users.length },
              { label: "Submitted Teams", value: selectionStats.total_managers ?? 0 },
              { label: "Pending Managers", value: Math.max(0, users.length - (selectionStats.total_managers ?? 0)) },
              {
                label: "Participation Rate",
                value: users.length > 0
                  ? `${((selectionStats.total_managers ?? 0) / users.length * 100).toFixed(1)}%`
                  : "—",
              },
            ].map(({ label, value }) => (
              <div key={label} className="bg-[#0b0f14] rounded-lg p-3">
                <p className="text-xs text-gray-500">{label}</p>
                <p className="text-xl font-bold text-court-orange mt-0.5">{value}</p>
              </div>
            ))}
          </div>

          {/* Top 5 selected players */}
          {selectionStats.stats?.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-2">Top 5 Selected Players</p>
              <div className="flex flex-col gap-1.5">
                {selectionStats.stats.slice(0, 5).map((row: any, i: number) => (
                  <div key={row.player_id} className="flex items-center justify-between text-sm py-1.5 border-b border-[#1f2733] last:border-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-600 w-4">{i + 1}.</span>
                      <span className="font-medium">{row.full_name}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-400">
                      <span>{row.count} selection{row.count !== 1 ? "s" : ""}</span>
                      <span className="text-court-orange font-semibold w-10 text-right">{row.percentage}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {selectionStats.total_managers === 0 && (
            <p className="text-sm text-gray-500">No lineups submitted yet for this gameweek.</p>
          )}
        </div>
      )}

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
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <div>
            <h2 className="font-bold">Users ({users.length})</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Last updated: {lastUpdated ? lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Never"}
            </p>
          </div>
          <button
            onClick={refreshUsers}
            disabled={usersRefreshing}
            className="px-3 py-1.5 rounded bg-[#1f2733] hover:bg-[#2a3441] text-xs font-semibold disabled:opacity-50 transition-colors"
          >
            {usersRefreshing ? "🔄 Refreshing..." : "🔄 Refresh"}
          </button>
        </div>
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
