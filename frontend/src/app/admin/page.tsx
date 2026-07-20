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

  // Emergency Tools panel (legacy, inside weekly ops card)
  const [emergencyOpen, setEmergencyOpen] = useState(false);

  // ADMIN-008: Emergency Recovery panel — permanent, state-independent
  const [recoveryConfirm, setRecoveryConfirm] = useState<"rollback" | "reset" | null>(null);
  const [recoveryLoading, setRecoveryLoading] = useState(false);

  // ADMIN-009: Score Verification Console
  const [verifyWeekId,    setVerifyWeekId]    = useState("");
  const [verifyUserId,    setVerifyUserId]    = useState("");
  const [verifyResult,    setVerifyResult]    = useState<any>(null);
  const [verifyLoading,   setVerifyLoading]   = useState(false);
  const [verifyAdvanced,  setVerifyAdvanced]  = useState(false);
  const [auditResult,     setAuditResult]     = useState<any>(null);
  const [auditLoading,    setAuditLoading]    = useState(false);

  // ADMIN-010: Mismatch Investigation Console
  const [investigationResult, setInvestigationResult] = useState<any>(null);
  const [investigatingUserId, setInvestigatingUserId] = useState<string | null>(null);

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

  // ADMIN-008: Emergency Recovery handlers
  async function runRecoveryAction(action: "rollback" | "reset") {
    const currentWeekId = weeks[0]?.week_id;
    if (!currentWeekId) {
      setMessage("❌ No active gameweek found.");
      setRecoveryConfirm(null);
      return;
    }
    setRecoveryLoading(true);
    setRecoveryConfirm(null);
    try {
      if (action === "rollback") {
        const res = await api.post("/admin/calculation-backup/rollback", { week_id: currentWeekId });
        setMessage(`✅ Rollback completed. Restored ${res.data.restored_leaderboard_count ?? 0} leaderboard row(s) and ${res.data.restored_player_prices_count ?? 0} player price(s).`);
      } else {
        await api.post("/admin/reset-week", { week_id: currentWeekId });
        setMessage("✅ Week reset successfully. Leaderboard and fantasy scoring cleared. User teams preserved.");
      }
      await loadAll();
    } catch (err: any) {
      setMessage(err?.response?.data?.error || `❌ ${action === "rollback" ? "Rollback" : "Reset"} failed.`);
    } finally {
      setRecoveryLoading(false);
    }
  }

  // ── ADMIN-009: Score Verification ─────────────────────────────────────────

  const SCORING = { POINTS:1, REBOUNDS:1.5, ASSISTS:2, STEALS:3, BLOCKS:3, TURNOVERS:-1, CAPTAIN:2 };

  function calcFP(s: any): number {
    return (
      Number(s.points    || 0) * SCORING.POINTS    +
      Number(s.rebounds  || 0) * SCORING.REBOUNDS  +
      Number(s.assists   || 0) * SCORING.ASSISTS   +
      Number(s.steals    || 0) * SCORING.STEALS    +
      Number(s.blocks    || 0) * SCORING.BLOCKS    +
      Number(s.turnovers || 0) * SCORING.TURNOVERS
    );
  }

  async function runVerification() {
    if (!verifyWeekId || !verifyUserId) return;
    setVerifyLoading(true);
    setVerifyResult(null);
    try {
      const [lineupsRes, lpRes, statsRes, lbRes, gamesRes, weekRes] = await Promise.all([
        api.get("/admin/data/user-lineups"),
        api.get("/admin/data/lineup-players"),
        api.get("/admin/data/player-stats"),
        api.get("/admin/data/leaderboard"),
        api.get("/admin/data/games"),
        api.get("/admin/data/weekly-gameweek"),
      ]);

      const lineup = (lineupsRes.data.rows || []).find(
        (l: any) => l.user_id === verifyUserId && l.week_id === verifyWeekId
      );
      if (!lineup) { setVerifyResult({ error: "No lineup found for this user/week." }); return; }

      const week = (weekRes.data.rows || []).find((w: any) => w.week_id === verifyWeekId);
      const startDate = week ? new Date(week.start_date) : null;
      const endDate   = week ? new Date(week.end_date)   : null;
      if (endDate) endDate.setHours(23, 59, 59, 999);

      const validGameIds = new Set(
        (gamesRes.data.rows || [])
          .filter((g: any) => {
            if (String(g.status).toLowerCase() !== "completed") return false;
            if (!startDate || !endDate) return true;
            const d = new Date(g.game_date);
            return d >= startDate && d <= endDate;
          })
          .map((g: any) => g.game_id)
      );

      const lineupPlayerIds = (lpRes.data.rows || [])
        .filter((lp: any) => lp.lineup_id === lineup.lineup_id)
        .map((lp: any) => lp.player_id);

      const allStats: any[] = statsRes.data.rows || [];

      // Aggregate stats per player across valid games only
      const statsByPlayer: Record<string, any> = {};
      for (const stat of allStats) {
        if (!lineupPlayerIds.includes(stat.player_id)) continue;
        if (!validGameIds.has(stat.game_id)) continue;
        if (!statsByPlayer[stat.player_id]) {
          statsByPlayer[stat.player_id] = { points:0, rebounds:0, assists:0, steals:0, blocks:0, turnovers:0, game_ids:[], stat_ids:[] };
        }
        const p = statsByPlayer[stat.player_id];
        p.points    += Number(stat.points    || 0);
        p.rebounds  += Number(stat.rebounds  || 0);
        p.assists   += Number(stat.assists   || 0);
        p.steals    += Number(stat.steals    || 0);
        p.blocks    += Number(stat.blocks    || 0);
        p.turnovers += Number(stat.turnovers || 0);
        p.game_ids.push(stat.game_id);
        p.stat_ids.push(stat.stat_id);
      }

      const users = await api.get("/admin/users");
      const userRow = (users.data.users || []).find((u: any) => u.user_id === verifyUserId);

      const players = await api.get("/players");
      const playerMap = new Map((players.data.players || []).map((p: any) => [p.player_id, p]));

      let subtotal = 0;
      let captainBonus = 0;
      const rows = lineupPlayerIds.map((pid: string) => {
        const s = statsByPlayer[pid] || { points:0, rebounds:0, assists:0, steals:0, blocks:0, turnovers:0, game_ids:[], stat_ids:[] };
        const baseFP = calcFP(s);
        const isCaptain = pid === lineup.captain_player_id;
        const fp = isCaptain ? baseFP * SCORING.CAPTAIN : baseFP;
        if (isCaptain) captainBonus = baseFP; // bonus = extra points from doubling
        subtotal += fp;
        return { pid, player: (playerMap.get(pid) as any)?.full_name || pid, ...s, baseFP, fp, isCaptain };
      });

      const lbEntry = (lbRes.data.rows || []).find(
        (r: any) => r.user_id === verifyUserId && r.week_id === verifyWeekId
      );
      const lbScore = lbEntry ? Number(lbEntry.score) : null;
      const diff = lbScore !== null ? Math.round((subtotal - lbScore) * 100) / 100 : null;

      setVerifyResult({
        userName: userRow?.display_name || userRow?.full_name || verifyUserId,
        lineup_id: lineup.lineup_id,
        captain_player_id: lineup.captain_player_id,
        week_id: verifyWeekId,
        rows,
        subtotal: Math.round(subtotal * 100) / 100,
        captainBonus: Math.round(captainBonus * 100) / 100,
        lbScore,
        diff,
        verified: diff !== null && Math.abs(diff) < 0.01,
      });
    } catch (err: any) {
      setVerifyResult({ error: err?.response?.data?.error || err?.message || "Verification failed." });
    } finally {
      setVerifyLoading(false);
    }
  }

  async function runWeekAudit() {
    if (!verifyWeekId) return;
    setAuditLoading(true);
    setAuditResult(null);
    try {
      const [lineupsRes, lpRes, statsRes, lbRes, gamesRes, weekRes, usersRes, playersRes] = await Promise.all([
        api.get("/admin/data/user-lineups"),
        api.get("/admin/data/lineup-players"),
        api.get("/admin/data/player-stats"),
        api.get("/admin/data/leaderboard"),
        api.get("/admin/data/games"),
        api.get("/admin/data/weekly-gameweek"),
        api.get("/admin/users"),
        api.get("/players"),
      ]);

      const week = (weekRes.data.rows || []).find((w: any) => w.week_id === verifyWeekId);
      const startDate = week ? new Date(week.start_date) : null;
      const endDate   = week ? new Date(week.end_date)   : null;
      if (endDate) endDate.setHours(23, 59, 59, 999);

      const validGameIds = new Set(
        (gamesRes.data.rows || [])
          .filter((g: any) => {
            if (String(g.status).toLowerCase() !== "completed") return false;
            if (!startDate || !endDate) return true;
            const d = new Date(g.game_date);
            return d >= startDate && d <= endDate;
          })
          .map((g: any) => g.game_id)
      );

      const weekLineups = (lineupsRes.data.rows || []).filter((l: any) => l.week_id === verifyWeekId);
      const allLP: any[]    = lpRes.data.rows    || [];
      const allStats: any[] = statsRes.data.rows || [];
      const allLB: any[]    = lbRes.data.rows    || [];
      const userMap = new Map((usersRes.data.users || []).map((u: any) => [u.user_id, u]));

      // Build stat map per player across valid games
      const statsByPlayer: Record<string, any> = {};
      for (const stat of allStats) {
        if (!validGameIds.has(stat.game_id)) continue;
        if (!statsByPlayer[stat.player_id]) statsByPlayer[stat.player_id] = { points:0, rebounds:0, assists:0, steals:0, blocks:0, turnovers:0 };
        const p = statsByPlayer[stat.player_id];
        p.points    += Number(stat.points    || 0);
        p.rebounds  += Number(stat.rebounds  || 0);
        p.assists   += Number(stat.assists   || 0);
        p.steals    += Number(stat.steals    || 0);
        p.blocks    += Number(stat.blocks    || 0);
        p.turnovers += Number(stat.turnovers || 0);
      }

      const auditRows = weekLineups.map((lineup: any) => {
        const pids = allLP.filter((lp: any) => lp.lineup_id === lineup.lineup_id).map((lp: any) => lp.player_id);
        let total = 0;
        for (const pid of pids) {
          const s = statsByPlayer[pid] || {};
          let fp = calcFP(s);
          if (pid === lineup.captain_player_id) fp *= SCORING.CAPTAIN;
          total += fp;
        }
        const calculated = Math.round(total * 100) / 100;
        const lbEntry = allLB.find((r: any) => r.user_id === lineup.user_id && r.week_id === verifyWeekId);
        const lbScore = lbEntry ? Number(lbEntry.score) : null;
        const diff = lbScore !== null ? Math.round((calculated - lbScore) * 100) / 100 : null;
        const user = userMap.get(lineup.user_id) as any;
        return { user_id: lineup.user_id, userName: user?.display_name || user?.full_name || lineup.user_id, calculated, lbScore, diff, verified: diff !== null && Math.abs(diff) < 0.01 };
      });

      const passed  = auditRows.filter((r: any) => r.verified).length;
      const failed  = auditRows.filter((r: any) => !r.verified).length;
      const maxDiff = auditRows.reduce((max: number, r: any) => Math.max(max, Math.abs(r.diff ?? 0)), 0);

      setAuditResult({ rows: auditRows, total: auditRows.length, passed, failed, maxDiff: Math.round(maxDiff * 100) / 100 });
    } catch (err: any) {
      setAuditResult({ error: err?.message || "Audit failed." });
    } finally {
      setAuditLoading(false);
    }
  }

  function downloadVerificationReport() {
    if (!verifyResult || verifyResult.error) return;
    const v = verifyResult;
    const lines = [
      "FANTASY HOOPS LIBERIA — SCORE VERIFICATION REPORT",
      `Date: ${new Date().toLocaleString()}`,
      `User: ${v.userName}`,
      `Week ID: ${v.week_id}`,
      `Lineup ID: ${v.lineup_id}`,
      "",
      "PLAYER BREAKDOWN",
      "Player                        PTS  REB  AST  STL  BLK  TO   Base FP   Final FP  Captain",
      ...v.rows.map((r: any) =>
        `${r.player.padEnd(30)} ${String(r.points).padEnd(4)} ${String(r.rebounds).padEnd(4)} ${String(r.assists).padEnd(4)} ${String(r.steals).padEnd(4)} ${String(r.blocks).padEnd(4)} ${String(r.turnovers).padEnd(4)} ${r.baseFP.toFixed(1).padEnd(9)} ${r.fp.toFixed(1).padEnd(9)} ${r.isCaptain ? "⭐ Captain" : ""}`
      ),
      "",
      "SUMMARY",
      `Calculated Total : ${v.subtotal.toFixed(2)}`,
      `Captain Bonus    : +${v.captainBonus.toFixed(2)}`,
      `Leaderboard Score: ${v.lbScore !== null ? v.lbScore.toFixed(2) : "N/A"}`,
      `Difference       : ${v.diff !== null ? v.diff.toFixed(2) : "N/A"}`,
      `Result           : ${v.verified ? "✅ VERIFIED" : "❌ MISMATCH"}`,
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `fhl-verification-${v.userName}-${v.week_id.slice(0,8)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── ADMIN-010: Mismatch Investigation Console ──────────────────────────────

  async function runInvestigation(targetUserId: string) {
    if (!verifyWeekId) return;
    setInvestigatingUserId(targetUserId);
    setInvestigationResult(null);

    try {
      const [lineupsRes, lpRes, statsRes, lbRes, gamesRes, weekRes, usersRes, playersRes] = await Promise.all([
        api.get("/admin/data/user-lineups"),
        api.get("/admin/data/lineup-players"),
        api.get("/admin/data/player-stats"),
        api.get("/admin/data/leaderboard"),
        api.get("/admin/data/games"),
        api.get("/admin/data/weekly-gameweek"),
        api.get("/admin/users"),
        api.get("/players"),
      ]);

      const lineup = (lineupsRes.data.rows || []).find(
        (l: any) => l.user_id === targetUserId && l.week_id === verifyWeekId
      );
      if (!lineup) { setInvestigationResult({ error: "No lineup found." }); return; }

      const week = (weekRes.data.rows || []).find((w: any) => w.week_id === verifyWeekId);
      const startDate = week ? new Date(week.start_date) : null;
      const endDate   = week ? new Date(week.end_date)   : null;
      if (endDate) endDate.setHours(23, 59, 59, 999);

      const allGames: any[] = gamesRes.data.rows || [];
      const validGameIds = new Set(
        allGames.filter((g: any) => {
          if (String(g.status).toLowerCase() !== "completed") return false;
          if (!startDate || !endDate) return true;
          const d = new Date(g.game_date);
          return d >= startDate && d <= endDate;
        }).map((g: any) => g.game_id)
      );

      const lpRows = (lpRes.data.rows || []).filter((lp: any) => lp.lineup_id === lineup.lineup_id);
      const lineupPlayerIds: string[] = lpRows.map((lp: any) => lp.player_id);
      const allStats: any[] = statsRes.data.rows || [];
      const playerMap = new Map((playersRes.data.players || []).map((p: any) => [p.player_id, p]));
      const userRow = (usersRes.data.users || []).find((u: any) => u.user_id === targetUserId);

      // ── Per-player investigation ──────────────────────────────────────────
      const playerInvestigations = lineupPlayerIds.map((pid: string) => {
        const player: any = playerMap.get(pid);
        const isCaptain   = pid === lineup.captain_player_id;

        // All stat rows for this player in valid games
        const validStats = allStats.filter(
          (s: any) => s.player_id === pid && validGameIds.has(s.game_id)
        );
        // All stat rows including OUT OF SCOPE (for stale cache detection)
        const allPlayerStats = allStats.filter((s: any) => s.player_id === pid);
        const outOfScopeStats = allPlayerStats.filter(
          (s: any) => !validGameIds.has(s.game_id)
        );

        // Aggregate raw stats across valid games
        const agg = validStats.reduce(
          (acc: any, s: any) => ({
            points:    acc.points    + Number(s.points    || 0),
            rebounds:  acc.rebounds  + Number(s.rebounds  || 0),
            assists:   acc.assists   + Number(s.assists   || 0),
            steals:    acc.steals    + Number(s.steals    || 0),
            blocks:    acc.blocks    + Number(s.blocks    || 0),
            turnovers: acc.turnovers + Number(s.turnovers || 0),
          }),
          { points:0, rebounds:0, assists:0, steals:0, blocks:0, turnovers:0 }
        );

        const baseFP      = calcFP(agg);
        const captainMult = isCaptain ? SCORING.CAPTAIN : 1;
        const finalFP     = baseFP * captainMult;

        // Stale cache detection — check stored vs canonical on each stat row
        const staleCacheIssues = validStats.filter((s: any) => {
          const storedFP  = Number(s.fantasy_points || 0);
          const rowFP     = calcFP({
            points:s.points, rebounds:s.rebounds, assists:s.assists,
            steals:s.steals, blocks:s.blocks, turnovers:s.turnovers,
          });
          return Math.abs(storedFP - rowFP) > 0.01;
        }).map((s: any) => ({
          stat_id: s.stat_id, game_id: s.game_id,
          stored:  Number(s.fantasy_points || 0),
          canonical: calcFP({ points:s.points, rebounds:s.rebounds, assists:s.assists, steals:s.steals, blocks:s.blocks, turnovers:s.turnovers }),
        }));

        return {
          pid, player_name: player?.full_name || pid, position: player?.position,
          team: player?.team_id, isCaptain, captainMult,
          agg, baseFP, finalFP,
          validStats: validStats.map((s: any) => ({
            stat_id: s.stat_id, game_id: s.game_id,
            points:s.points, rebounds:s.rebounds, assists:s.assists,
            steals:s.steals, blocks:s.blocks, turnovers:s.turnovers,
            stored_fp: Number(s.fantasy_points || 0),
            canonical_fp: calcFP({ points:s.points, rebounds:s.rebounds, assists:s.assists, steals:s.steals, blocks:s.blocks, turnovers:s.turnovers }),
          })),
          outOfScopeCount: outOfScopeStats.length,
          outOfScopeStats: outOfScopeStats.map((s: any) => ({
            stat_id: s.stat_id, game_id: s.game_id,
            stored_fp: Number(s.fantasy_points || 0),
          })),
          staleCacheIssues,
          isDNP: validStats.length === 0,
        };
      });

      // ── Lineup integrity ──────────────────────────────────────────────────
      const integrityIssues: string[] = [];
      if (lineupPlayerIds.length !== 5)
        integrityIssues.push(`Lineup has ${lineupPlayerIds.length} players (expected 5)`);
      if (!lineup.captain_player_id)
        integrityIssues.push("No captain assigned");
      if (lineup.captain_player_id && !lineupPlayerIds.includes(lineup.captain_player_id))
        integrityIssues.push("Captain is not in the lineup");

      // Team limit check (max 2 per team)
      const teamCounts: Record<string, number> = {};
      for (const pi of playerInvestigations) {
        const tid = pi.team || "unknown";
        teamCounts[tid] = (teamCounts[tid] || 0) + 1;
      }
      for (const [tid, count] of Object.entries(teamCounts)) {
        if (count > 2) integrityIssues.push(`Team ${tid} has ${count} players (max 2)`);
      }

      // ── Totals ─────────────────────────────────────────────────────────────
      const calculatedTotal = playerInvestigations.reduce((s: number, p: any) => s + p.finalFP, 0);
      const lbEntry = (lbRes.data.rows || []).find(
        (r: any) => r.user_id === targetUserId && r.week_id === verifyWeekId
      );
      const lbScore = lbEntry ? Number(lbEntry.score) : null;
      const diff    = lbScore !== null ? Math.round((calculatedTotal - lbScore) * 100) / 100 : null;

      // ── Root cause analysis ────────────────────────────────────────────────
      const rootCauses: string[] = [];
      const totalStaleIssues = playerInvestigations.reduce(
        (n: number, p: any) => n + p.staleCacheIssues.length, 0
      );
      const dnpCount = playerInvestigations.filter((p: any) => p.isDNP).length;
      const outOfScopeTotal = playerInvestigations.reduce(
        (n: number, p: any) => n + p.outOfScopeCount, 0
      );

      if (diff !== null && Math.abs(diff) > 0.01) {
        if (totalStaleIssues > 0)
          rootCauses.push(`${totalStaleIssues} stat row(s) have stale Player_Stats.fantasy_points values from the pre-ARCH-001 importer. The leaderboard score may have been written using old cached values.`);
        if (outOfScopeTotal > 0)
          rootCauses.push(`${outOfScopeTotal} stat row(s) exist outside the week date range. If these were included in a previous calculation run, the leaderboard score is inflated.`);
        if (dnpCount > 0)
          rootCauses.push(`${dnpCount} player(s) have no stats in this week's valid games (DNP). They contributed 0 FP.`);
        if (Math.abs(diff) > 0 && rootCauses.length === 0)
          rootCauses.push(`Difference of ${diff.toFixed(2)} detected but no automatic cause found. Manual review of Player_Stats and Leaderboard rows recommended.`);
      } else if (diff !== null && Math.abs(diff) <= 0.01) {
        rootCauses.push("Score verified. Calculated total matches leaderboard exactly.");
      }
      if (integrityIssues.length > 0)
        rootCauses.push(...integrityIssues.map((i: string) => `Lineup integrity: ${i}`));

      setInvestigationResult({
        userName: userRow?.display_name || userRow?.full_name || targetUserId,
        user_id: targetUserId,
        lineup_id: lineup.lineup_id,
        captain_player_id: lineup.captain_player_id,
        week_id: verifyWeekId,
        players: playerInvestigations,
        calculatedTotal: Math.round(calculatedTotal * 100) / 100,
        lbScore, diff,
        verified: diff !== null && Math.abs(diff) < 0.01,
        integrityIssues,
        rootCauses,
        totalStaleIssues,
        generatedAt: new Date().toISOString(),
      });
    } catch (err: any) {
      setInvestigationResult({ error: err?.message || "Investigation failed." });
    } finally {
      setInvestigatingUserId(null);
    }
  }

  function downloadInvestigationReport() {
    const inv = investigationResult;
    if (!inv || inv.error) return;
    const lines = [
      "FANTASY HOOPS LIBERIA — MISMATCH INVESTIGATION REPORT",
      `Generated : ${new Date(inv.generatedAt).toLocaleString()}`,
      `Manager   : ${inv.userName} (${inv.user_id})`,
      `Week ID   : ${inv.week_id}`,
      `Lineup ID : ${inv.lineup_id}`,
      `Captain   : ${inv.captain_player_id}`,
      "",
      "═══ PIPELINE TRACE ══════════════════════════════════════════════════════",
      "",
      ...inv.players.flatMap((p: any) => [
        `Player: ${p.player_name} ${p.isCaptain ? "[CAPTAIN ×2]" : ""}`,
        `  Player ID   : ${p.pid}`,
        `  Games in scope: ${p.validStats.map((s: any) => s.game_id).join(", ") || "none (DNP)"}`,
        `  Aggregated  : PTS=${p.agg.points} REB=${p.agg.rebounds} AST=${p.agg.assists} STL=${p.agg.steals} BLK=${p.agg.blocks} TO=${p.agg.turnovers}`,
        `  Base FP     : ${p.baseFP.toFixed(2)}`,
        `  Captain Mult: ×${p.captainMult}`,
        `  Final FP    : ${p.finalFP.toFixed(2)}`,
        ...(p.staleCacheIssues.length > 0 ? [
          `  ⚠ STALE CACHE DETECTED:`,
          ...p.staleCacheIssues.map((sc: any) =>
            `    Stat ${sc.stat_id}: stored=${sc.stored.toFixed(2)} canonical=${sc.canonical.toFixed(2)} diff=${(sc.canonical - sc.stored).toFixed(2)}`
          ),
        ] : []),
        ...(p.outOfScopeCount > 0 ? [`  ⚠ ${p.outOfScopeCount} stat row(s) exist OUTSIDE the week window`] : []),
        "",
      ]),
      "═══ SUMMARY ═════════════════════════════════════════════════════════════",
      `Calculated Total : ${inv.calculatedTotal.toFixed(2)}`,
      `Leaderboard Score: ${inv.lbScore !== null ? inv.lbScore.toFixed(2) : "N/A"}`,
      `Difference       : ${inv.diff !== null ? (inv.diff >= 0 ? "+" : "") + inv.diff.toFixed(2) : "N/A"}`,
      `Result           : ${inv.verified ? "✅ VERIFIED" : "❌ MISMATCH"}`,
      "",
      "═══ ROOT CAUSE ANALYSIS ═════════════════════════════════════════════════",
      ...inv.rootCauses.map((c: string, i: number) => `${i+1}. ${c}`),
      ...(inv.integrityIssues.length > 0 ? ["", "Integrity Issues:", ...inv.integrityIssues.map((x: string) => `• ${x}`)] : []),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `fhl-investigation-${inv.userName.replace(/\s+/g,"-")}-${inv.week_id.slice(0,8)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading || !user) return null;

  return (
    <div className="flex flex-col gap-5">
      {/* FHDS Loading overlays */}
      <LoadingOverlay visible={calculatingWeeklyScores} title="Calculating Weekly Scores..." message="Processing player statistics and updating the leaderboard." />
      <LoadingOverlay visible={updatingPrices} title="Updating Player Prices..." message="Adjusting fantasy prices based on this week's performance." />
      <LoadingOverlay visible={rollingBack} title="Rolling Back..." message="Restoring leaderboard, player prices, and price history." />
      <LoadingOverlay visible={recoveryLoading} title="Running Recovery..." message="Please wait — do not close this page." />

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
          const isLocked   = String(w.is_locked).toUpperCase() === "TRUE";
          const scoresCalc = String(w.scores_calculated).toUpperCase() === "TRUE";
          const pricesUpd  = String(w.prices_updated).toUpperCase() === "TRUE";

          // ADL-044: lock ≠ finalization — three distinct lifecycle states
          const isFinalized  = isLocked && scoresCalc && pricesUpd;
          const isProcessing = isLocked && !isFinalized;

          const statusBadge = isFinalized
            ? { label: "✅ Finalized", cls: "bg-court-green/15 text-court-green"  }
            : isProcessing
            ? { label: "🟡 Locked",   cls: "bg-yellow-500/15 text-yellow-400"    }
            : { label: "🟢 Open",     cls: "bg-court-green/15 text-court-green"  };

          return (
            <div key={w.week_id} className="flex flex-col gap-5">

              {/* Status bar */}
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex flex-wrap items-center gap-3 text-sm text-gray-400">
                  <span>{w.start_date} → {w.end_date}</span>
                  <span>·</span>
                  <span>Deadline: {w.submission_deadline}</span>
                </div>
                <span className={`text-sm font-bold px-2.5 py-0.5 rounded-full ${statusBadge.cls}`}>
                  {statusBadge.label}
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
                  <div key={label} className={`text-xs px-3 py-2 rounded-lg flex items-center gap-1.5 ${done ? "bg-court-green/10 text-court-green" : "bg-[#0b0f14] text-gray-500"}`}>
                    <span>{done ? "✓" : "○"}</span>
                    <span>{label}</span>
                  </div>
                ))}
              </div>

              {/* OPEN: Lock Week + all workflow actions */}
              {!isLocked && (
                <div className="flex flex-col gap-2">
                  <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Workflow</p>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => lockWeek(w.week_id)} className="px-3 py-1.5 rounded bg-[#1f2733] hover:bg-[#2a3441] text-xs font-semibold">
                      🔒 Lock Week
                    </button>
                    <button onClick={() => calculateWeeklyScores(w.week_id)} disabled={calculatingWeeklyScores} className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-xs font-semibold disabled:opacity-50">
                      {calculatingWeeklyScores ? "Calculating..." : "📊 Calculate Scores"}
                    </button>
                    <button onClick={() => updatePlayerPrices(w.week_id)} disabled={updatingPrices} className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-xs font-semibold disabled:opacity-50">
                      {updatingPrices ? "Updating..." : "💰 Update Prices"}
                    </button>
                    <button onClick={async () => { try { const res = await api.post(`/admin/achievements/evaluate/${w.week_id}`); setMessage(`✅ ${res.data.message}`); } catch (err: any) { setMessage(err?.response?.data?.error || "Failed to evaluate achievements."); }}} className="px-3 py-1.5 rounded bg-[#1f2733] hover:bg-[#2a3441] text-xs font-semibold">
                      🏅 Evaluate Badges
                    </button>
                    <a href={`/reports/${w.week_id}`} className="px-3 py-1.5 rounded bg-[#1f2733] hover:bg-[#2a3441] text-xs font-semibold inline-block">📋 View Report</a>
                  </div>
                </div>
              )}

              {/* LOCKED / PROCESSING: workflow buttons remain — submissions closed */}
              {isProcessing && (
                <div className="flex flex-col gap-3">
                  <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-4">
                    <p className="text-sm font-semibold text-yellow-400">🟡 Submissions Closed — Workflow In Progress</p>
                    <p className="text-xs text-gray-400 mt-1">Complete the processing steps below before creating the next gameweek.</p>
                  </div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Processing</p>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => calculateWeeklyScores(w.week_id)} disabled={calculatingWeeklyScores || scoresCalc} title={scoresCalc ? "Already calculated" : ""} className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-xs font-semibold disabled:opacity-50">
                      {calculatingWeeklyScores ? "Calculating..." : scoresCalc ? "📊 Scores Done ✓" : "📊 Calculate Scores"}
                    </button>
                    <button onClick={() => updatePlayerPrices(w.week_id)} disabled={updatingPrices || pricesUpd} title={pricesUpd ? "Already updated" : ""} className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-xs font-semibold disabled:opacity-50">
                      {updatingPrices ? "Updating..." : pricesUpd ? "💰 Prices Done ✓" : "💰 Update Prices"}
                    </button>
                    <button onClick={async () => { try { const res = await api.post(`/admin/achievements/evaluate/${w.week_id}`); setMessage(`✅ ${res.data.message}`); } catch (err: any) { setMessage(err?.response?.data?.error || "Failed to evaluate achievements."); }}} className="px-3 py-1.5 rounded bg-[#1f2733] hover:bg-[#2a3441] text-xs font-semibold">
                      🏅 Evaluate Badges
                    </button>
                    <a href={`/reports/${w.week_id}`} className="px-3 py-1.5 rounded bg-[#1f2733] hover:bg-[#2a3441] text-xs font-semibold inline-block">📋 View Report</a>
                  </div>
                </div>
              )}

              {/* FINALIZED: all processing complete — show create next week */}
              {isFinalized && (
                <div className="flex flex-col gap-4">
                  <div className="rounded-lg border border-court-green/30 bg-court-green/5 p-4">
                    <p className="text-sm font-semibold text-court-green">✅ Gameweek Finalized</p>
                    <p className="text-xs text-gray-400 mt-1">Scores calculated, prices updated. You may now create the next gameweek.</p>
                  </div>
                  <a href={`/reports/${w.week_id}`} className="px-3 py-1.5 rounded bg-[#1f2733] hover:bg-[#2a3441] text-xs font-semibold inline-block w-fit">📋 View Final Report</a>
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

              {/* Emergency Tools — unchanged, collapsed by default */}
              <div className="border-t border-[#1f2733] pt-3">
                <button onClick={() => setEmergencyOpen((o) => !o)} className="flex items-center gap-2 text-xs text-yellow-500 font-semibold hover:text-yellow-400 transition-colors">
                  <span className={`transition-transform ${emergencyOpen ? "rotate-90" : ""}`}>▶</span>
                  ⚠️ Emergency Tools
                </button>
                {emergencyOpen && (
                  <div className="mt-3 flex flex-col gap-3 pl-4 border-l border-yellow-600/30">
                    <p className="text-xs text-gray-500">These operations are destructive. Use only to recover from calculation errors.</p>
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => resetWeek(w.week_id)} className="px-3 py-1.5 rounded bg-red-900/40 border border-red-700/50 text-red-400 text-xs font-semibold hover:bg-red-900/60">🔁 Reset Week</button>
                      <button onClick={() => setRollbackWeekId(w.week_id)} className="px-3 py-1.5 rounded bg-red-900/40 border border-red-700/50 text-red-400 text-xs font-semibold hover:bg-red-900/60">↩️ Rollback Last Calculation</button>
                      {isLocked && (
                        <button onClick={() => setForceGameWeekId(w.week_id)} className="px-3 py-1.5 rounded bg-yellow-900/40 border border-yellow-700/50 text-yellow-400 text-xs font-semibold hover:bg-yellow-900/60">⚠️ Force Add Game</button>
                      )}
                    </div>
                  </div>
                )}
              </div>

            </div>
          );
        })}
      </div>

      {/* ADMIN-008: Emergency Recovery — always visible, state-independent */}
      <div className="card p-5 border border-red-900/40">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div>
            <h2 className="font-bold text-red-400">⚠️ Emergency Recovery</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Administrative recovery tools for exceptional situations. Requires confirmation before execution.
            </p>
          </div>
        </div>

        {weeks.length === 0 && (
          <p className="text-xs text-gray-500">No active gameweek — recovery tools will become available once a gameweek exists.</p>
        )}

        {weeks.length > 0 && (
          <div className="flex flex-col gap-4">
            {/* Rollback */}
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-200">↩️ Rollback Last Calculation</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Restore the gameweek to its pre-calculation state — scores, prices, and leaderboard.
                  Use this before recalculating with the corrected scoring engine.
                </p>
              </div>
              <button
                onClick={() => setRecoveryConfirm("rollback")}
                disabled={recoveryLoading}
                className="px-3 py-2 rounded bg-red-900/40 border border-red-700/50 text-red-400 text-xs font-semibold hover:bg-red-900/60 disabled:opacity-50 flex-shrink-0"
              >
                ↩️ Rollback
              </button>
            </div>

            <div className="border-t border-[#1f2733]" />

            {/* Reset Week */}
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-200">🔁 Reset Week</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Clear leaderboard and fantasy scoring for this week.
                  User teams are <strong className="text-gray-300">not</strong> deleted.
                  Use when Rollback has no backup available.
                </p>
              </div>
              <button
                onClick={() => setRecoveryConfirm("reset")}
                disabled={recoveryLoading}
                className="px-3 py-2 rounded bg-red-900/40 border border-red-700/50 text-red-400 text-xs font-semibold hover:bg-red-900/60 disabled:opacity-50 flex-shrink-0"
              >
                🔁 Reset
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ADMIN-008: Confirmation dialogs */}
      <ConfirmDialog
        open={recoveryConfirm === "rollback"}
        title="Rollback Last Calculation"
        message="This will restore the gameweek to its pre-calculation state. Scores, player prices, and leaderboard will be reverted. Continue?"
        confirmText="Yes, Rollback"
        cancelText="Cancel"
        onConfirm={() => runRecoveryAction("rollback")}
        onCancel={() => setRecoveryConfirm(null)}
      />
      <ConfirmDialog
        open={recoveryConfirm === "reset"}
        title="Reset Week"
        message="This will clear the leaderboard and fantasy scoring for this week. User teams will NOT be deleted. Continue?"
        confirmText="Yes, Reset Week"
        cancelText="Cancel"
        onConfirm={() => runRecoveryAction("reset")}
        onCancel={() => setRecoveryConfirm(null)}
      />

      {/* ADMIN-009: Score Verification Console */}
      <div className="card p-5">
        <h2 className="font-bold mb-1">🔍 Score Verification</h2>
        <p className="text-xs text-gray-500 mb-4">Independently recalculates any lineup score from raw stats. Read-only — no data is modified.</p>

        {/* Inputs */}
        <div className="flex flex-wrap gap-3 mb-4">
          <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
            <label className="text-xs text-gray-500">Week ID</label>
            <select className="input-field" value={verifyWeekId} onChange={(e) => { setVerifyWeekId(e.target.value); setVerifyResult(null); setAuditResult(null); }}>
              <option value="">Select week…</option>
              {weeks.map((w: any) => (
                <option key={w.week_id} value={w.week_id}>{w.start_date} → {w.end_date}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
            <label className="text-xs text-gray-500">Manager</label>
            <select className="input-field" value={verifyUserId} onChange={(e) => { setVerifyUserId(e.target.value); setVerifyResult(null); }}>
              <option value="">Select manager…</option>
              {users.map((u: any) => (
                <option key={u.user_id} value={u.user_id}>{u.display_name || u.full_name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-5">
          <button onClick={runVerification} disabled={!verifyWeekId || !verifyUserId || verifyLoading} className="btn-primary text-sm disabled:opacity-50">
            {verifyLoading ? "Verifying…" : "Verify Score"}
          </button>
          <button onClick={runWeekAudit} disabled={!verifyWeekId || auditLoading} className="px-3 py-1.5 rounded bg-[#1f2733] hover:bg-[#2a3441] text-xs font-semibold disabled:opacity-50">
            {auditLoading ? "Auditing…" : "🔎 Verify Entire Week"}
          </button>
        </div>

        {/* Single user result */}
        {verifyResult && !verifyResult.error && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="text-sm font-semibold">{verifyResult.userName}</p>
              <span className={`text-sm font-bold px-3 py-1 rounded-full ${verifyResult.verified ? "bg-court-green/15 text-court-green" : "bg-red-500/15 text-red-400"}`}>
                {verifyResult.verified ? "✅ VERIFIED" : `❌ MISMATCH ${verifyResult.diff > 0 ? "+" : ""}${verifyResult.diff?.toFixed(2)}`}
              </span>
            </div>

            {/* Player breakdown table */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-500 border-b border-[#1f2733]">
                    <th className="text-left py-2 pr-3">Player</th>
                    <th className="text-right py-2 px-2">PTS</th>
                    <th className="text-right py-2 px-2">REB</th>
                    <th className="text-right py-2 px-2">AST</th>
                    <th className="text-right py-2 px-2">STL</th>
                    <th className="text-right py-2 px-2">BLK</th>
                    <th className="text-right py-2 px-2">TO</th>
                    <th className="text-right py-2 px-2">Base FP</th>
                    <th className="text-right py-2 pl-2">Final FP</th>
                  </tr>
                </thead>
                <tbody>
                  {verifyResult.rows.map((r: any, i: number) => (
                    <tr key={i} className={`border-b border-[#1f2733] ${r.isCaptain ? "bg-court-orange/5" : ""}`}>
                      <td className="py-2 pr-3 font-medium">
                        {r.player}
                        {r.isCaptain && <span className="ml-1 text-court-orange">⭐</span>}
                        {r.baseFP === 0 && <span className="ml-1 text-gray-600 text-[10px]">DNP</span>}
                      </td>
                      <td className="text-right py-2 px-2">{r.points}</td>
                      <td className="text-right py-2 px-2">{r.rebounds}</td>
                      <td className="text-right py-2 px-2">{r.assists}</td>
                      <td className="text-right py-2 px-2">{r.steals}</td>
                      <td className="text-right py-2 px-2">{r.blocks}</td>
                      <td className="text-right py-2 px-2">{r.turnovers}</td>
                      <td className="text-right py-2 px-2 text-gray-400">{r.baseFP.toFixed(1)}</td>
                      <td className="text-right py-2 pl-2 font-bold text-court-orange">{r.fp.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Summary */}
            <div className="bg-[#0b0f14] rounded-lg p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div><p className="text-gray-500">Calculated Total</p><p className="font-bold text-lg text-court-orange">{verifyResult.subtotal.toFixed(2)}</p></div>
              <div><p className="text-gray-500">Captain Bonus</p><p className="font-bold text-lg">+{verifyResult.captainBonus.toFixed(2)}</p></div>
              <div><p className="text-gray-500">Leaderboard Score</p><p className="font-bold text-lg">{verifyResult.lbScore !== null ? verifyResult.lbScore.toFixed(2) : "—"}</p></div>
              <div><p className="text-gray-500">Difference</p><p className={`font-bold text-lg ${Math.abs(verifyResult.diff ?? 0) > 0.01 ? "text-red-400" : "text-court-green"}`}>{verifyResult.diff !== null ? (verifyResult.diff >= 0 ? "+" : "") + verifyResult.diff.toFixed(2) : "—"}</p></div>
            </div>

            {/* Advanced section */}
            <details className="group">
              <summary className="cursor-pointer text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1 w-fit">
                <span className="group-open:rotate-90 transition-transform inline-block">▶</span>
                Advanced / Debug Info
              </summary>
              <div className="mt-2 bg-[#0b0f14] rounded-lg p-3 text-xs text-gray-400 flex flex-col gap-1 font-mono">
                <p>Week ID: {verifyResult.week_id}</p>
                <p>Lineup ID: {verifyResult.lineup_id}</p>
                <p>Captain Player ID: {verifyResult.captain_player_id}</p>
                {verifyResult.rows.map((r: any, i: number) => (
                  <div key={i} className="mt-1">
                    <p className="text-gray-300">{r.player}</p>
                    <p>Player ID: {r.pid}</p>
                    <p>Games: {r.game_ids?.join(", ") || "none"}</p>
                    <p>Stat IDs: {r.stat_ids?.join(", ") || "none"}</p>
                  </div>
                ))}
              </div>
            </details>

            <button onClick={downloadVerificationReport} className="px-3 py-1.5 rounded bg-[#1f2733] hover:bg-[#2a3441] text-xs font-semibold w-fit">
              ⬇️ Download Verification Report
            </button>
          </div>
        )}

        {verifyResult?.error && (
          <p className="text-sm text-red-400">❌ {verifyResult.error}</p>
        )}

        {/* Week audit result */}
        {auditResult && !auditResult.error && (
          <div className="flex flex-col gap-4 mt-4 border-t border-[#1f2733] pt-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="text-sm font-semibold">Week Audit Results</p>
              {auditResult.failed > 0
                ? <span className="text-sm font-bold px-3 py-1 rounded-full bg-yellow-500/15 text-yellow-400">⚠️ Investigation Required</span>
                : <span className="text-sm font-bold px-3 py-1 rounded-full bg-court-green/15 text-court-green">✅ All Verified</span>
              }
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              {[
                { label: "Checked", value: auditResult.total },
                { label: "Passed",  value: auditResult.passed,  cls: "text-court-green" },
                { label: "Failed",  value: auditResult.failed,  cls: auditResult.failed > 0 ? "text-red-400" : "" },
                { label: "Max Diff",value: auditResult.maxDiff.toFixed(2), cls: auditResult.maxDiff > 0.01 ? "text-yellow-400" : "" },
              ].map(({ label, value, cls }: any) => (
                <div key={label} className="bg-[#0b0f14] rounded-lg p-3">
                  <p className="text-gray-500">{label}</p>
                  <p className={`font-bold text-lg ${cls || "text-gray-200"}`}>{value}</p>
                </div>
              ))}
            </div>
            <div className="overflow-x-auto max-h-64">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-500 border-b border-[#1f2733]">
                    <th className="text-left py-2 pr-3">Manager</th>
                    <th className="text-right py-2 px-2">Calculated</th>
                    <th className="text-right py-2 px-2">Leaderboard</th>
                    <th className="text-right py-2 px-2">Diff</th>
                    <th className="text-right py-2 pl-2">Status</th>
                    <th className="text-right py-2 pl-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {auditResult.rows.map((r: any, i: number) => (
                    <tr key={i} className="border-b border-[#1f2733]">
                      <td className="py-2 pr-3">{r.userName}</td>
                      <td className="text-right py-2 px-2">{r.calculated.toFixed(2)}</td>
                      <td className="text-right py-2 px-2">{r.lbScore !== null ? r.lbScore.toFixed(2) : "—"}</td>
                      <td className={`text-right py-2 px-2 ${Math.abs(r.diff ?? 0) > 0.01 ? "text-red-400" : "text-court-green"}`}>
                        {r.diff !== null ? (r.diff >= 0 ? "+" : "") + r.diff.toFixed(2) : "—"}
                      </td>
                      <td className="text-right py-2 pl-2">{r.verified ? "✅" : "❌"}</td>
                      <td className="text-right py-2 pl-2">
                        {!r.verified && (
                          <button
                            onClick={() => runInvestigation(r.user_id)}
                            disabled={investigatingUserId === r.user_id}
                            className="px-2 py-1 rounded bg-yellow-900/40 border border-yellow-700/50 text-yellow-400 text-[10px] font-semibold hover:bg-yellow-900/60 disabled:opacity-50"
                          >
                            {investigatingUserId === r.user_id ? "…" : "🔎 Investigate"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {auditResult?.error && <p className="text-sm text-red-400 mt-3">❌ {auditResult.error}</p>}

        {/* ADMIN-010: Investigation panel */}
        {investigationResult && !investigationResult.error && (
          <div className="mt-5 border-t border-yellow-700/30 pt-5 flex flex-col gap-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h3 className="font-bold text-sm">🔎 Investigation: {investigationResult.userName}</h3>
                <p className="text-xs text-gray-500 mt-0.5">Pipeline trace from raw stats → leaderboard</p>
              </div>
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${investigationResult.verified ? "bg-court-green/15 text-court-green" : "bg-red-500/15 text-red-400"}`}>
                {investigationResult.verified ? "✅ VERIFIED" : `❌ MISMATCH ${investigationResult.diff >= 0 ? "+" : ""}${investigationResult.diff?.toFixed(2)}`}
              </span>
            </div>

            {/* Player pipeline cards */}
            <div className="flex flex-col gap-3">
              {investigationResult.players.map((p: any, i: number) => (
                <div key={i} className={`rounded-lg border p-4 ${p.isCaptain ? "border-court-orange/40 bg-court-orange/5" : "border-[#1f2733] bg-[#0b0f14]"}`}>
                  {/* Header */}
                  <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold">{p.player_name}</p>
                      {p.isCaptain && <span className="text-xs bg-court-orange/20 text-court-orange px-2 py-0.5 rounded-full">⭐ Captain ×2</span>}
                      {p.isDNP    && <span className="text-xs bg-gray-700/50 text-gray-400 px-2 py-0.5 rounded-full">DNP</span>}
                    </div>
                    <span className="text-lg font-bold text-court-orange">{p.finalFP.toFixed(1)} FP</span>
                  </div>

                  {/* Stats grid */}
                  <div className="grid grid-cols-6 gap-2 text-xs mb-3">
                    {[["PTS", p.agg.points], ["REB", p.agg.rebounds], ["AST", p.agg.assists],
                      ["STL", p.agg.steals], ["BLK", p.agg.blocks], ["TO", p.agg.turnovers]].map(([label, val]: any) => (
                      <div key={label} className="bg-[#1f2733] rounded p-2 text-center">
                        <p className="text-gray-500">{label}</p>
                        <p className="font-bold">{val}</p>
                      </div>
                    ))}
                  </div>

                  {/* Pipeline trace */}
                  <div className="text-xs text-gray-400 flex flex-wrap gap-x-4 gap-y-1 font-mono">
                    <span>Base FP: <strong className="text-gray-200">{p.baseFP.toFixed(2)}</strong></span>
                    <span>×{p.captainMult}</span>
                    <span>Final: <strong className="text-court-orange">{p.finalFP.toFixed(2)}</strong></span>
                  </div>

                  {/* Stale cache warnings */}
                  {p.staleCacheIssues.length > 0 && (
                    <div className="mt-3 rounded bg-yellow-900/20 border border-yellow-700/40 p-2 text-xs">
                      <p className="text-yellow-400 font-semibold mb-1">⚠️ Stale Cache Detected ({p.staleCacheIssues.length} row{p.staleCacheIssues.length > 1 ? "s" : ""})</p>
                      {p.staleCacheIssues.map((sc: any, j: number) => (
                        <div key={j} className="text-yellow-200/70 font-mono">
                          Stat {sc.stat_id.slice(0,8)}… stored=<span className="text-red-400">{sc.stored.toFixed(2)}</span> canonical=<span className="text-court-green">{sc.canonical.toFixed(2)}</span> diff=<span className={sc.canonical > sc.stored ? "text-court-green" : "text-red-400"}>{(sc.canonical - sc.stored).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Out of scope stats warning */}
                  {p.outOfScopeCount > 0 && (
                    <div className="mt-2 rounded bg-red-900/20 border border-red-700/40 p-2 text-xs">
                      <p className="text-red-400 font-semibold">⚠️ {p.outOfScopeCount} stat row(s) exist outside the week date window</p>
                      <p className="text-red-300/70 text-[10px] mt-0.5">These were excluded from calculation but may have been included in a previous run.</p>
                    </div>
                  )}

                  {/* Debug IDs */}
                  <details className="mt-3 group">
                    <summary className="cursor-pointer text-[10px] text-gray-600 hover:text-gray-400 w-fit">▶ Debug IDs</summary>
                    <div className="mt-1 font-mono text-[10px] text-gray-600 flex flex-col gap-0.5">
                      <span>Player ID: {p.pid}</span>
                      {p.validStats.map((s: any, k: number) => (
                        <span key={k}>Stat {k+1}: {s.stat_id} | Game: {s.game_id}</span>
                      ))}
                    </div>
                  </details>
                </div>
              ))}
            </div>

            {/* Summary */}
            <div className="bg-[#0b0f14] rounded-lg p-4 text-xs grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div><p className="text-gray-500">Calculated</p><p className="font-bold text-lg text-court-orange">{investigationResult.calculatedTotal.toFixed(2)}</p></div>
              <div><p className="text-gray-500">Leaderboard</p><p className="font-bold text-lg">{investigationResult.lbScore !== null ? investigationResult.lbScore.toFixed(2) : "—"}</p></div>
              <div><p className="text-gray-500">Difference</p><p className={`font-bold text-lg ${Math.abs(investigationResult.diff ?? 0) > 0.01 ? "text-red-400" : "text-court-green"}`}>{investigationResult.diff !== null ? (investigationResult.diff >= 0 ? "+" : "") + investigationResult.diff.toFixed(2) : "—"}</p></div>
              <div><p className="text-gray-500">Stale Rows</p><p className={`font-bold text-lg ${investigationResult.totalStaleIssues > 0 ? "text-yellow-400" : "text-court-green"}`}>{investigationResult.totalStaleIssues}</p></div>
            </div>

            {/* Root cause */}
            {investigationResult.rootCauses.length > 0 && (
              <div className="rounded-lg border border-[#2a3441] p-4 flex flex-col gap-2">
                <p className="text-xs font-semibold text-gray-300">🧠 Root Cause Analysis</p>
                {investigationResult.rootCauses.map((cause: string, i: number) => (
                  <div key={i} className={`text-xs px-3 py-2 rounded ${investigationResult.verified ? "bg-court-green/10 text-court-green" : "bg-yellow-900/20 text-yellow-300"}`}>
                    {i+1}. {cause}
                  </div>
                ))}
              </div>
            )}

            {/* Integrity issues */}
            {investigationResult.integrityIssues.length > 0 && (
              <div className="rounded-lg border border-red-700/40 bg-red-900/10 p-4">
                <p className="text-xs font-semibold text-red-400 mb-2">⚠️ Lineup Integrity Issues</p>
                {investigationResult.integrityIssues.map((issue: string, i: number) => (
                  <p key={i} className="text-xs text-red-300">• {issue}</p>
                ))}
              </div>
            )}

            {/* Debug meta */}
            <details className="group">
              <summary className="cursor-pointer text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1 w-fit">
                <span className="group-open:rotate-90 transition-transform inline-block">▶</span>
                Full debug metadata
              </summary>
              <div className="mt-2 bg-[#0b0f14] rounded-lg p-3 text-[10px] text-gray-600 font-mono flex flex-col gap-0.5">
                <span>Lineup ID   : {investigationResult.lineup_id}</span>
                <span>Captain ID  : {investigationResult.captain_player_id}</span>
                <span>Week ID     : {investigationResult.week_id}</span>
                <span>User ID     : {investigationResult.user_id}</span>
                <span>Generated   : {new Date(investigationResult.generatedAt).toLocaleString()}</span>
              </div>
            </details>

            <button onClick={downloadInvestigationReport} className="px-3 py-1.5 rounded bg-[#1f2733] hover:bg-[#2a3441] text-xs font-semibold w-fit">
              ⬇️ Download Investigation Report
            </button>
          </div>
        )}
        {investigationResult?.error && <p className="text-sm text-red-400 mt-3">❌ {investigationResult.error}</p>}
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
