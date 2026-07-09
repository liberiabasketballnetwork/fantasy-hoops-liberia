"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { FormBadge } from "@/components/ui";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PlannerPlayer {
  player_id: string;
  player_name: string;
  team_id: string;
  current_price: number;
  form: "hot" | "good" | "average" | "cold";
  season_average_fantasy_points: number;
  value_per_credit: number;
}

interface TeamSnapshot {
  players: PlannerPlayer[];
  projected_team_health: { score: number; label: string };
  total_salary: number;
  remaining_budget: number;
  suggested_captain: PlannerPlayer;
}

interface PlannerResult {
  current_team: TeamSnapshot;
  simulated_team: TeamSnapshot;
  comparison: {
    health_change: number;
    budget_change: number;
    average_points_change: number;
    value_change: number;
    captain_changed: boolean;
    transfer_summary: string;
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function healthColor(score: number) {
  if (score >= 75) return "text-court-green";
  if (score >= 60) return "text-yellow-400";
  return "text-red-400";
}

function healthRingColor(score: number) {
  if (score >= 75) return "border-court-green";
  if (score >= 60) return "border-yellow-400";
  return "border-red-500";
}

function ChangeTag({ value, unit = "" }: { value: number; unit?: string }) {
  if (value === 0) return <span className="text-xs text-gray-400">— no change</span>;
  const positive = value > 0;
  return (
    <span className={`text-xs font-bold ${positive ? "text-court-green" : "text-red-400"}`}>
      {positive ? "+" : ""}{value}{unit}
    </span>
  );
}

function HealthRing({ score, label }: { score: number; label: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className={`w-14 h-14 rounded-full border-4 flex items-center justify-center ${healthRingColor(score)}`}>
        <span className={`text-lg font-bold ${healthColor(score)}`}>{score}</span>
      </div>
      <div>
        <p className="text-xs text-gray-400">Team Health</p>
        <p className={`font-bold ${healthColor(score)}`}>{label}</p>
      </div>
    </div>
  );
}

// ─── Player card (compact, used in lineup list) ───────────────────────────────

function LineupCard({
  player,
  teams,
  selected,
  isCaptain,
  onClick,
  disabled,
}: {
  player: PlannerPlayer;
  teams: Record<string, string>;
  selected: boolean;
  isCaptain: boolean;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <div
      onClick={!disabled ? onClick : undefined}
      className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors
        ${selected ? "bg-court-orange/20 border border-court-orange" : "bg-[#0b0f14] border border-[#1f2733]"}
        ${onClick && !disabled ? "cursor-pointer hover:border-court-orange/50" : ""}
        ${disabled ? "opacity-50" : ""}`}
    >
      <div>
        <div className="flex items-center gap-1.5">
          <span className="font-semibold">{player.player_name}</span>
          {isCaptain && <span className="text-xs bg-court-orange text-white px-1 rounded">C</span>}
        </div>
        <span className="text-xs text-gray-400">{teams[player.team_id] || "—"}</span>
      </div>
      <div className="flex items-center gap-2">
        <FormBadge form={player.form} variant="pill" />
        <span className="text-xs text-court-orange font-semibold">{player.current_price} cr</span>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PlannerPage() {
  const { user, loading: authLoading } = useAuth();
  const [allPlayers, setAllPlayers] = useState<any[]>([]);
  const [teams, setTeams] = useState<Record<string, string>>({});
  const [currentLineup, setCurrentLineup] = useState<PlannerPlayer[]>([]);
  const [currentCaptain, setCurrentCaptain] = useState<string>("");
  const [currentHealth, setCurrentHealth] = useState<{ score: number; label: string } | null>(null);
  const [currentSalary, setCurrentSalary] = useState(0);
  const [budgetCap, setBudgetCap] = useState(100);

  const [removeId, setRemoveId] = useState("");
  const [addId, setAddId] = useState("");

  const [result, setResult] = useState<PlannerResult | null>(null);
  const [simulating, setSimulating] = useState(false);
  const [simError, setSimError] = useState("");
  const [noLineup, setNoLineup] = useState(false);
  const [loading, setLoading] = useState(true);

  // Load initial data
  useEffect(() => {
    if (authLoading || !user) return;
    Promise.all([
      api.get("/team-advisor"),
      api.get("/players?status=all"),
      api.get("/teams"),
      api.get("/settings").catch(() => ({ data: { budget_cap: 100 } })),
    ])
      .then(([advRes, playersRes, teamsRes, settingsRes]) => {
        if (!advRes.data.has_lineup) { setNoLineup(true); return; }
        setCurrentLineup(advRes.data.budget_analysis ? [] : []);
        // Use the advisor's enriched lineup data by re-fetching from players
        const lineupPlayerIds: string[] = advRes.data.strongest_player
          ? [
              advRes.data.strongest_player.player_id,
              advRes.data.weakest_player?.player_id,
              advRes.data.suggested_captain?.player_id,
            ].filter(Boolean)
          : [];
        // We'll load actual lineup via simulate with the empty result on mount
        setCurrentCaptain(advRes.data.suggested_captain?.player_id || "");
        setCurrentHealth(advRes.data.team_health);
        setBudgetCap(settingsRes.data.budget_cap || 100);

        const tm: Record<string, string> = {};
        for (const t of teamsRes.data.teams || []) tm[t.team_id] = t.team_name;
        setTeams(tm);
        setAllPlayers(playersRes.data.players || []);
      })
      .catch(() => setNoLineup(true))
      .finally(() => setLoading(false));
  }, [user, authLoading]);

  // Auto-simulate when both players selected
  const simulate = useCallback(async () => {
    if (!removeId || !addId || removeId === addId) return;
    setSimulating(true);
    setSimError("");
    setResult(null);
    try {
      const res = await api.post("/team-planner/simulate", {
        remove_player_id: removeId,
        add_player_id: addId,
      });
      setResult(res.data);
      // Update current lineup display from the result
      setCurrentLineup(res.data.current_team.players);
      setCurrentCaptain(res.data.current_team.suggested_captain.player_id);
      setCurrentHealth(res.data.current_team.projected_team_health);
      setCurrentSalary(res.data.current_team.total_salary);
    } catch (err: any) {
      setSimError(err?.response?.data?.error || "Simulation failed.");
    } finally {
      setSimulating(false);
    }
  }, [removeId, addId]);

  useEffect(() => { simulate(); }, [simulate]);

  // ── Not logged in ──
  if (!authLoading && !user) {
    return (
      <div className="card p-8 text-center">
        <p className="text-gray-400 mb-4">Log in to use the Team Planner.</p>
        <Link href="/login" className="btn-primary">Log in</Link>
      </div>
    );
  }

  if (loading || authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full border-4 border-[#1f2733] border-t-court-orange animate-spin" />
          <p className="text-sm text-gray-400">Loading planner...</p>
        </div>
      </div>
    );
  }

  // ── No lineup ──
  if (noLineup) {
    return (
      <div className="flex flex-col gap-5">
        <h1 className="text-2xl font-bold">🗓️ Team Planner</h1>
        <div className="card p-10 text-center flex flex-col items-center gap-4">
          <span className="text-4xl">📋</span>
          <p className="font-bold">No Lineup Found</p>
          <p className="text-sm text-gray-400 max-w-sm">
            Submit your lineup to start simulating transfers.
          </p>
          <Link href="/players" className="btn-primary">Pick Your Team →</Link>
        </div>
      </div>
    );
  }

  // Players not in lineup (available to add)
  const lineupIds = new Set(currentLineup.map((p) => p.player_id));
  const availableToAdd = allPlayers.filter((p) => !lineupIds.has(p.player_id));

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">🗓️ Team Planner</h1>
        <p className="text-sm text-gray-400 mt-0.5">
          Simulate transfers before committing. Your lineup will not change.
        </p>
      </div>

      {/* Simulation notice */}
      <div className="card p-3 border border-yellow-600/40 flex items-center gap-2 text-sm text-yellow-400">
        <span>⚠️</span>
        <span>This is only a simulation. Your official lineup has NOT changed.</span>
      </div>

      {/* Step 1 + 2: Current lineup — tap to select who to remove */}
      <div className="card p-5">
        <h2 className="font-bold mb-3">Step 1 — Select a player to remove</h2>
        {currentLineup.length === 0 ? (
          <p className="text-sm text-gray-400">Select your first simulation below to load your lineup.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {currentLineup.map((p) => (
              <LineupCard
                key={p.player_id}
                player={p}
                teams={teams}
                selected={removeId === p.player_id}
                isCaptain={currentCaptain === p.player_id}
                onClick={() => { setRemoveId(p.player_id); setAddId(""); setResult(null); }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Step 3: Choose replacement */}
      {removeId && (
        <div className="card p-5">
          <h2 className="font-bold mb-3">
            Step 2 — Choose a replacement for{" "}
            <span className="text-court-orange">
              {currentLineup.find((p) => p.player_id === removeId)?.player_name}
            </span>
          </h2>
          <select
            className="input-field"
            value={addId}
            onChange={(e) => setAddId(e.target.value)}
          >
            <option value="">Select replacement...</option>
            {availableToAdd.map((p) => (
              <option key={p.player_id} value={p.player_id}>
                {p.full_name} ({teams[p.team_id] || "—"}) — {p.current_price} cr
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Simulating spinner */}
      {simulating && (
        <div className="flex items-center gap-3 card p-4">
          <div className="w-5 h-5 rounded-full border-2 border-[#1f2733] border-t-court-orange animate-spin flex-shrink-0" />
          <span className="text-sm text-gray-400">Running simulation...</span>
        </div>
      )}

      {/* Validation error */}
      {simError && (
        <div className="card p-4 text-red-400 text-sm border border-red-600/40">{simError}</div>
      )}

      {/* Results */}
      {result && !simulating && (
        <>
          {/* Side-by-side comparison */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Current team */}
            <div className="card p-5 flex flex-col gap-4">
              <h3 className="font-bold text-gray-400 text-sm uppercase">Current Team</h3>
              <HealthRing
                score={result.current_team.projected_team_health.score}
                label={result.current_team.projected_team_health.label}
              />
              <div className="flex flex-col gap-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Total Salary</span>
                  <span>{result.current_team.total_salary} cr</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Remaining Budget</span>
                  <span className={result.current_team.remaining_budget > 0 ? "text-court-green" : "text-gray-300"}>
                    {result.current_team.remaining_budget} cr
                  </span>
                </div>
                <div className="flex justify-between items-center mt-1">
                  <span className="text-gray-400">Suggested Captain</span>
                  <span className="font-semibold">{result.current_team.suggested_captain.player_name}</span>
                </div>
              </div>
              <div className="flex flex-col gap-1.5 mt-1">
                {result.current_team.players.map((p) => (
                  <div key={p.player_id} className={`px-3 py-1.5 rounded text-sm flex justify-between items-center ${p.player_id === removeId ? "bg-red-500/10 border border-red-600/30 text-red-400 line-through" : "bg-[#0b0f14]"}`}>
                    <span>{p.player_name}</span>
                    <span className="text-xs text-gray-400">{p.current_price} cr</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Simulated team */}
            <div className="card p-5 flex flex-col gap-4 border-court-orange/30">
              <h3 className="font-bold text-court-orange text-sm uppercase">Simulated Team</h3>
              <div className="flex items-center gap-2">
                <HealthRing
                  score={result.simulated_team.projected_team_health.score}
                  label={result.simulated_team.projected_team_health.label}
                />
                <ChangeTag value={result.comparison.health_change} />
              </div>
              <div className="flex flex-col gap-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Total Salary</span>
                  <div className="flex items-center gap-2">
                    <span>{result.simulated_team.total_salary} cr</span>
                    <ChangeTag value={-result.comparison.budget_change} unit=" cr" />
                  </div>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Remaining Budget</span>
                  <div className="flex items-center gap-2">
                    <span className={result.simulated_team.remaining_budget > 0 ? "text-court-green" : "text-gray-300"}>
                      {result.simulated_team.remaining_budget} cr
                    </span>
                    <ChangeTag value={result.comparison.budget_change} unit=" cr" />
                  </div>
                </div>
                <div className="flex justify-between items-center mt-1">
                  <span className="text-gray-400">Suggested Captain</span>
                  <span className={`font-semibold ${result.comparison.captain_changed ? "text-court-orange" : ""}`}>
                    {result.simulated_team.suggested_captain.player_name}
                    {result.comparison.captain_changed && " 🔄"}
                  </span>
                </div>
              </div>
              <div className="flex flex-col gap-1.5 mt-1">
                {result.simulated_team.players.map((p) => (
                  <div key={p.player_id} className={`px-3 py-1.5 rounded text-sm flex justify-between items-center ${p.player_id === addId ? "bg-court-green/10 border border-court-green/30 text-court-green font-semibold" : "bg-[#0b0f14]"}`}>
                    <span>{p.player_name}</span>
                    <span className="text-xs">{p.current_price} cr</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Transfer summary card */}
          <div className="card p-5 flex flex-col gap-3">
            <h3 className="font-bold">📊 Simulation Summary</h3>
            <p className="text-sm text-gray-300 leading-relaxed">
              {result.comparison.transfer_summary}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-[#0b0f14] rounded-lg p-3 text-center">
                <p className="text-xs text-gray-400 mb-1">Health</p>
                <ChangeTag value={result.comparison.health_change} />
              </div>
              <div className="bg-[#0b0f14] rounded-lg p-3 text-center">
                <p className="text-xs text-gray-400 mb-1">Budget</p>
                <ChangeTag value={result.comparison.budget_change} unit=" cr" />
              </div>
              <div className="bg-[#0b0f14] rounded-lg p-3 text-center">
                <p className="text-xs text-gray-400 mb-1">Avg FP</p>
                <ChangeTag value={result.comparison.average_points_change} unit=" FP" />
              </div>
              <div className="bg-[#0b0f14] rounded-lg p-3 text-center">
                <p className="text-xs text-gray-400 mb-1">Avg Value</p>
                <ChangeTag value={result.comparison.value_change} unit="/cr" />
              </div>
            </div>
          </div>

          {/* CTA */}
          <div className="flex flex-wrap gap-3">
            <Link href="/players" className="btn-primary">
              Make This Transfer →
            </Link>
            <button
              onClick={() => { setRemoveId(""); setAddId(""); setResult(null); setSimError(""); }}
              className="px-4 py-2 rounded-lg bg-[#1f2733] text-sm font-semibold"
            >
              Reset Simulation
            </button>
          </div>
          <p className="text-xs text-gray-500">
            ↑ The "Make This Transfer" button takes you to player selection. Your lineup will not change until you resubmit.
          </p>
        </>
      )}
    </div>
  );
}
