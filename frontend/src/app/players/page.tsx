"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { AppModal, LoadingOverlay, PriceBadge, FormBadge, Last5Sparkline, ToastContainer, useToast } from "@/components/ui";

const MAX_PLAYERS_PER_TEAM = 2;

export default function PlayersPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const { toasts, toast: addToast, dismiss: removeToast } = useToast();
  const [players, setPlayers] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [watchedIds, setWatchedIds] = useState<Set<string>>(new Set());
  const [teamFilter, setTeamFilter] = useState<string>("");
  const [selected, setSelected] = useState<string[]>([]);
  const [captain, setCaptain] = useState<string>("");
  const [weekId, setWeekId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [salaryCapEnabled, setSalaryCapEnabled] = useState(true);
  const [budgetCap, setBudgetCap] = useState(100);
  // HOTFIX-006A: track submitted state
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);

  // FHDS AppModal state
  const [modal, setModal] = useState<{
    open: boolean;
    type: "success" | "warning" | "error" | "info";
    title: string;
    message: string;
    details?: string[];
  }>({ open: false, type: "warning", title: "", message: "" });
  const closeModal = () => setModal((m) => ({ ...m, open: false }));

  useEffect(() => {
    async function load() {
      try {
        // Stage 1: parallel fetches that don't need week_id
        const [playersRes, teamsRes, lbRes, settingsRes, watchRes] = await Promise.all([
          api.get("/players"),
          api.get("/teams"),
          api.get("/leaderboard"),
          api.get("/settings").catch(() => ({ data: { salary_cap_enabled: true, budget_cap: 100 } })),
          api.get("/watchlist/ids").catch(() => ({ data: { ids: [] } })),
        ]);
        setPlayers(playersRes.data.players || []);
        setTeams(teamsRes.data.teams || []);
        setSalaryCapEnabled(settingsRes.data.salary_cap_enabled);
        setBudgetCap(settingsRes.data.budget_cap);
        setWatchedIds(new Set(watchRes.data.ids || []));

        const currentWeekId = lbRes.data.week?.week_id;
        if (currentWeekId) {
          setWeekId(currentWeekId);

          // Stage 2: HOTFIX-006A — fetch existing lineup using resolved week_id
          const lineupRes = await api.get("/my-lineup", { params: { week_id: currentWeekId } }).catch(() => null);
          if (lineupRes?.data?.lineup && lineupRes.data.players?.length > 0) {
            // Merge pattern from HOTFIX-005: join players array into lineup object
            const existingLineup = { ...lineupRes.data.lineup, players: lineupRes.data.players };
            const existingPlayerIds = lineupRes.data.players.map((p: any) => p.player_id);
            setSelected(existingPlayerIds);
            setCaptain(existingLineup.captain_player_id || "");
            setAlreadySubmitted(true);
          }
        }
      } catch (e) {
        console.error(e);
      }
    }
    load();
  }, []);

  function teamName(teamId: string) {
    return teams.find((t) => t.team_id === teamId)?.team_name || "Free Agent";
  }

  const visiblePlayers = teamFilter ? players.filter((p) => p.team_id === teamFilter) : players;

  const spent = selected.reduce((sum, id) => {
    const p = players.find((pl) => pl.player_id === id);
    return sum + Number(p?.fantasy_price || 0);
  }, 0);
  const remaining = budgetCap - spent;

  const teamCounts: Record<string, number> = {};
  for (const id of selected) {
    const p = players.find((pl) => pl.player_id === id);
    if (p?.team_id) teamCounts[p.team_id] = (teamCounts[p.team_id] || 0) + 1;
  }

  function toggleSelect(playerId: string) {
    // HOTFIX-006A: selection disabled when lineup already submitted
    if (alreadySubmitted) return;

    const player = players.find((p) => p.player_id === playerId);
    const price = Number(player?.fantasy_price || 0);

    if (selected.includes(playerId)) {
      setSelected(selected.filter((id) => id !== playerId));
      if (captain === playerId) setCaptain("");
      return;
    }

    if (selected.length >= 5) {
      setModal({ open: true, type: "warning", title: "Team Full", message: "You can only select 5 players. Remove one first." });
      return;
    }

    if (salaryCapEnabled && spent + price > budgetCap) {
      setModal({
        open: true,
        type: "warning",
        title: "Salary Cap Exceeded",
        message: "You don't have enough credits to add this player.",
        details: [
          `Credits used: ${spent} / ${budgetCap}`,
          `This player costs: ${price} credits`,
          `Credits remaining: ${remaining}`,
        ],
      });
      return;
    }

    const teamId = player?.team_id;
    if (teamId && (teamCounts[teamId] || 0) >= MAX_PLAYERS_PER_TEAM) {
      setModal({
        open: true,
        type: "warning",
        title: "Maximum Players Reached",
        message: "You may only select two players from the same team.",
        details: [
          `You already have ${MAX_PLAYERS_PER_TEAM} players from ${teamName(teamId)}.`,
          "Choose a player from a different team.",
        ],
      });
      return;
    }

    setSelected([...selected, playerId]);
  }

  async function submitLineup() {
    if (!user) { router.push("/login"); return; }

    if (selected.length !== 5) {
      setModal({ open: true, type: "warning", title: "Incomplete Team", message: "Select exactly 5 players before submitting." });
      return;
    }

    if (!captain) {
      setModal({
        open: true,
        type: "warning",
        title: "Captain Required",
        message: "Please select one player as Captain before submitting.",
        details: ["Tap 'Make Captain' on any of your selected players."],
      });
      return;
    }

    if (salaryCapEnabled && spent > budgetCap) {
      setModal({
        open: true,
        type: "warning",
        title: "Salary Cap Exceeded",
        message: "Your lineup exceeds the budget cap. Remove a player first.",
        details: [`Credits used: ${spent} / ${budgetCap}`],
      });
      return;
    }

    if (!weekId) {
      setModal({ open: true, type: "warning", title: "No Active Week", message: "There's no active gameweek right now." });
      return;
    }

    setSubmitting(true);
    try {
      await api.post("/submit-lineup", {
        week_id: weekId,
        player_ids: selected,
        captain_player_id: captain,
      });
      const captainPlayer = players.find((p) => p.player_id === captain);
      setAlreadySubmitted(true); // HOTFIX-006A: lock page after successful submission
      setModal({
        open: true,
        type: "success",
        title: "Team Submitted Successfully",
        message: "Good luck this week! 🏀",
        details: [
          `Captain: ${captainPlayer?.full_name || "Unknown"}`,
          `Credits used: ${spent} / ${budgetCap}`,
        ],
      });
    } catch (err: any) {
      setModal({
        open: true,
        type: "error",
        title: "Submission Failed",
        message: err?.response?.data?.error || "Failed to submit lineup.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleWatch(playerId: string, playerName: string) {
    const isWatched = watchedIds.has(playerId);
    try {
      if (isWatched) {
        await api.delete(`/watchlist/${playerId}`);
        setWatchedIds((prev) => { const next = new Set(prev); next.delete(playerId); return next; });
        addToast("info", `${playerName} removed from watchlist.`);
      } else {
        await api.post("/watchlist", { player_id: playerId });
        setWatchedIds((prev) => new Set([...prev, playerId]));
        addToast("success", `${playerName} added to watchlist!`);
      }
    } catch (err: any) {
      addToast("error", err?.response?.data?.error || "Could not update watchlist.");
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <ToastContainer toasts={toasts} onDismiss={removeToast} />
      <LoadingOverlay visible={submitting} title="Submitting Team..." message="Saving your lineup for this week." />

      <AppModal
        open={modal.open}
        type={modal.type}
        title={modal.title}
        message={modal.message}
        details={modal.details}
        confirmText="OK"
        onConfirm={closeModal}
      />

      <div>
        <h1 className="text-2xl font-bold">Pick Your 5</h1>
        <p className="text-sm text-gray-400">
          {alreadySubmitted
            ? "✓ Lineup submitted for this gameweek."
            : `Selected: ${selected.length}/5 ${captain ? "· Captain selected" : ""}`}
        </p>
      </div>

      {/* HOTFIX-006A: read-only notice when lineup already submitted */}
      {alreadySubmitted && (
        <div className="card p-4 border border-court-green/30 bg-court-green/5">
          <p className="text-sm font-semibold text-court-green">✅ Your lineup is locked in for this gameweek.</p>
          <p className="text-xs text-gray-400 mt-1">
            You can still watch players and browse the market. Selections are read-only until the next gameweek.
          </p>
        </div>
      )}

      <div className="card p-4">
        <p className="text-sm font-bold mb-2">LINEUP RULES</p>
        <ul className="text-sm text-gray-300 flex flex-col gap-1">
          <li>✓ Pick 5 Players</li>
          <li>✓ Maximum 2 players per team</li>
          {salaryCapEnabled && <li>✓ Stay under {budgetCap} credits</li>}
          <li>✓ Select 1 Captain (double points)</li>
        </ul>
        <p className="text-xs text-gray-500 mt-3">
          Player prices update after every completed gameweek based on fantasy performance.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <label className="text-sm text-gray-400">Filter by team:</label>
        <select className="input-field w-auto" value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)}>
          <option value="">All teams</option>
          {teams.map((t) => <option key={t.team_id} value={t.team_id}>{t.team_name}</option>)}
        </select>
      </div>

      {salaryCapEnabled && (
        <div className="card p-4 flex items-center justify-between sticky top-16 z-10">
          <div>
            <p className="text-xs text-gray-400">Budget remaining</p>
            <p className={`text-xl font-bold ${remaining < 0 ? "text-red-400" : "text-court-orange"}`}>
              {remaining} / {budgetCap} credits
            </p>
          </div>
          <div className="w-1/2 h-2 bg-[#1f2733] rounded overflow-hidden">
            <div className={`h-full ${spent > budgetCap ? "bg-red-500" : "bg-court-orange"}`} style={{ width: `${Math.min((spent / budgetCap) * 100, 100)}%` }} />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        {visiblePlayers.map((p) => {
          const isSelected = selected.includes(p.player_id);
          const isCaptain = captain === p.player_id;
          const price = Number(p.fantasy_price || 0);
          const tooExpensive = salaryCapEnabled && !isSelected && price > remaining;
          const teamFull = !isSelected && !!p.team_id && (teamCounts[p.team_id] || 0) >= MAX_PLAYERS_PER_TEAM;
          // HOTFIX-006A: when already submitted, cards are display-only (no click-to-select)
          const disabled = alreadySubmitted ? false : (tooExpensive || teamFull);
          return (
            <div
              key={p.player_id}
              className={`card relative p-4 transition-colors ${
                isSelected ? "border-2 border-court-orange" : ""
              } ${disabled ? "opacity-50" : ""} ${
                alreadySubmitted ? "cursor-default" : "cursor-pointer"
              }`}
              onClick={() => toggleSelect(p.player_id)}
            >
              {isSelected && (
                <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-court-orange flex items-center justify-center text-white text-xs font-bold shadow">✓</div>
              )}
              {isCaptain && (
                <div className="absolute -top-2 left-2 w-6 h-6 rounded-full bg-yellow-500 flex items-center justify-center text-white text-xs font-bold shadow">C</div>
              )}
              <div className="flex justify-between items-start gap-3">
                <div className="flex items-center gap-3">
                  {p.photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.photo_url} alt={p.full_name} className="w-12 h-12 rounded-full object-cover border border-[#2a3441]" onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-[#1f2733] flex items-center justify-center text-lg">🏀</div>
                  )}
                  <div>
                    <p className="font-bold">{p.full_name}</p>
                    <p className="text-xs text-gray-400">{p.position} · {teamName(p.team_id)}</p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {salaryCapEnabled && (
                    <PriceBadge
                      current_price={price}
                      previous_price={p.previous_price}
                      price_change={p.price_change}
                      price_trend={p.price_trend}
                      variant="inline"
                    />
                  )}
                  {/* HOTFIX-006A: captain button hidden in read-only mode */}
                  {isSelected && !alreadySubmitted && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setCaptain(p.player_id); }}
                      className={`text-xs px-2 py-1 rounded ${isCaptain ? "bg-court-orange" : "bg-[#1f2733]"}`}
                    >
                      {isCaptain ? "★ Captain" : "Make Captain"}
                    </button>
                  )}
                  {/* HOTFIX-006A: read-only captain indicator */}
                  {isSelected && alreadySubmitted && isCaptain && (
                    <span className="text-xs px-2 py-1 rounded bg-court-orange text-white font-semibold">★ Captain</span>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between mt-3">
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <FormBadge form={p.form ?? "cold"} variant="pill" />
                    <span className="text-xs text-gray-500">
                      {p.games_played ?? 0} GP
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-400 mt-1">
                    <span title="Season average fantasy points">
                      Avg {(p.season_average_fantasy_points ?? 0).toFixed(1)}
                    </span>
                    <span title="Fantasy points per credit spent">
                      Val {(p.value_per_credit ?? 0).toFixed(2)}/cr
                    </span>
                  </div>
                </div>
              </div>
              {p.last_5_fantasy_scores?.length > 0 && (
                <div className="mt-3 border-t border-[#1f2733] pt-3">
                  <Last5Sparkline scores={p.last_5_fantasy_scores} />
                </div>
              )}
              {/* Watchlist always functional — not affected by alreadySubmitted */}
              {user && (
                <button
                  onClick={(e) => { e.stopPropagation(); toggleWatch(p.player_id, p.full_name); }}
                  className={`mt-2 text-xs self-start px-2 py-1 rounded transition-colors ${
                    watchedIds.has(p.player_id)
                      ? "text-court-orange bg-court-orange/10"
                      : "text-gray-500 hover:text-court-orange"
                  }`}
                  aria-label={watchedIds.has(p.player_id) ? `Unwatch ${p.full_name}` : `Watch ${p.full_name}`}
                >
                  {watchedIds.has(p.player_id) ? "♥ Watching" : "♡ Watch"}
                </button>
              )}
            </div>
          );
        })}
        {visiblePlayers.length === 0 && (
          <p className="text-gray-500 text-sm">No players available yet. Check back soon.</p>
        )}
      </div>

      {/* HOTFIX-006A: submit button replaced with confirmation when already submitted */}
      <button
        onClick={alreadySubmitted ? undefined : submitLineup}
        disabled={submitting || alreadySubmitted}
        className={`w-fit font-semibold px-5 py-2 rounded transition-colors ${
          alreadySubmitted
            ? "bg-court-green/20 text-court-green border border-court-green/40 cursor-default"
            : "btn-primary"
        }`}
      >
        {submitting ? "Submitting..." : alreadySubmitted ? "✓ Lineup Submitted" : "Submit Lineup"}
      </button>
    </div>
  );
}
