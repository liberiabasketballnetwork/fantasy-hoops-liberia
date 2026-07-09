"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { FormBadge } from "@/components/ui";

type Strategy = "balanced" | "value" | "stars";

interface OptPlayer {
  player_id: string; player_name: string; team_id: string;
  current_price: number; form: "hot"|"good"|"average"|"cold";
  season_average_fantasy_points: number; value_per_credit: number;
}
interface TeamSnapshot {
  players: OptPlayer[]; team_health: { score: number; label: string };
  salary_used: number; remaining_budget: number; captain: OptPlayer;
}
interface TransferRec { out: OptPlayer; in: OptPlayer; reason: string; }
interface OptResult {
  strategy: Strategy; already_optimal: boolean;
  current_team: TeamSnapshot; optimized_team: TeamSnapshot;
  comparison: { health_change: number; budget_change: number; average_points_change: number; value_change: number; captain_changed: boolean; players_replaced: number };
  recommendations: TransferRec[];
}

function healthColor(s: number) { return s >= 75 ? "text-court-green" : s >= 60 ? "text-yellow-400" : "text-red-400"; }
function healthRing(s: number) { return s >= 75 ? "border-court-green" : s >= 60 ? "border-yellow-400" : "border-red-500"; }

function HealthRing({ score, label }: { score: number; label: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className={`w-14 h-14 rounded-full border-4 flex items-center justify-center ${healthRing(score)}`}>
        <span className={`text-lg font-bold ${healthColor(score)}`}>{score}</span>
      </div>
      <div>
        <p className="text-xs text-gray-400">Team Health</p>
        <p className={`font-bold ${healthColor(score)}`}>{label}</p>
      </div>
    </div>
  );
}

function Delta({ v, unit="" }: { v: number; unit?: string }) {
  if (v === 0) return <span className="text-xs text-gray-400">—</span>;
  return <span className={`text-xs font-bold ${v > 0 ? "text-court-green" : "text-red-400"}`}>{v > 0 ? "+" : ""}{v}{unit}</span>;
}

const STRATEGY_INFO: Record<Strategy, { label: string; icon: string; desc: string }> = {
  balanced: { label: "Balanced", icon: "⚖️", desc: "Maximise overall team health" },
  value:    { label: "Value",    icon: "💎", desc: "Best fantasy points per credit" },
  stars:    { label: "Stars",    icon: "⭐", desc: "Highest scoring players first" },
};

export default function OptimizerPage() {
  const { user, loading: authLoading } = useAuth();
  const [strategy, setStrategy] = useState<Strategy>("balanced");
  const [result, setResult] = useState<OptResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [teams, setTeams] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);

  if (!authLoading && !user) return (
    <div className="card p-8 text-center">
      <p className="text-gray-400 mb-4">Log in to use the Lineup Optimizer.</p>
      <Link href="/login" className="btn-primary">Log in</Link>
    </div>
  );

  async function run() {
    setLoading(true); setError(""); setResult(null);
    try {
      const [optRes, teamsRes] = await Promise.all([
        api.post("/team-optimizer", { strategy }),
        api.get("/teams"),
      ]);
      setResult(optRes.data);
      const tm: Record<string, string> = {};
      for (const t of teamsRes.data.teams || []) tm[t.team_id] = t.team_name;
      setTeams(tm);
    } catch (err: any) {
      setError(err?.response?.data?.error || "Optimization failed. Please try again.");
    } finally { setLoading(false); }
  }

  const tn = (id: string) => teams[id] || "—";

  function copyRecs() {
    if (!result) return;
    const text = result.recommendations.map(r =>
      `OUT: ${r.out.player_name} → IN: ${r.in.player_name}\nReason: ${r.reason}`
    ).join("\n\n");
    navigator.clipboard.writeText(text);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold">🤖 Lineup Optimizer</h1>
        <p className="text-sm text-gray-400 mt-0.5">Find the strongest possible lineup using your available budget.</p>
      </div>

      <div className="card p-3 border border-yellow-600/40 flex items-center gap-2 text-sm text-yellow-400">
        <span>⚠️</span>
        <span>This is a recommendation only. Your official lineup has NOT changed.</span>
      </div>

      {/* Strategy selector */}
      <div className="card p-5 flex flex-col gap-4">
        <h2 className="font-bold">Choose Strategy</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {(["balanced","value","stars"] as Strategy[]).map((s) => {
            const info = STRATEGY_INFO[s];
            return (
              <button
                key={s}
                onClick={() => setStrategy(s)}
                className={`card p-4 text-left transition-colors ${strategy === s ? "border-court-orange bg-court-orange/5" : "hover:border-gray-600"}`}
              >
                <span className="text-xl">{info.icon}</span>
                <p className="font-bold mt-1">{info.label}</p>
                <p className="text-xs text-gray-400 mt-0.5">{info.desc}</p>
              </button>
            );
          })}
        </div>
        <button onClick={run} disabled={loading} className="btn-primary w-full text-base py-3">
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              Optimizing...
            </span>
          ) : "⚡ Optimize My Team"}
        </button>
      </div>

      {error && <div className="card p-4 text-red-400 text-sm border border-red-600/40">{error}</div>}

      {result && (
        <>
          {/* Already optimal */}
          {result.already_optimal && (
            <div className="card p-5 text-center border border-court-green/40">
              <p className="text-court-green font-bold text-lg">✅ Your lineup is already optimal!</p>
              <p className="text-sm text-gray-400 mt-1">
                No improvements found under the <strong>{result.strategy}</strong> strategy.
              </p>
            </div>
          )}

          {/* Side-by-side */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Current */}
            <div className="card p-5 flex flex-col gap-4">
              <h3 className="font-bold text-gray-400 text-sm uppercase">Current Team</h3>
              <HealthRing score={result.current_team.team_health.score} label={result.current_team.team_health.label} />
              <div className="text-sm flex flex-col gap-1">
                <div className="flex justify-between"><span className="text-gray-400">Salary Used</span><span>{result.current_team.salary_used} cr</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Remaining</span><span className="text-court-green">{result.current_team.remaining_budget} cr</span></div>
                <div className="flex justify-between mt-1"><span className="text-gray-400">Captain</span><span className="font-semibold">{result.current_team.captain.player_name}</span></div>
              </div>
              <div className="flex flex-col gap-1.5">
                {result.current_team.players.map((p) => {
                  const removed = !result.optimized_team.players.find((op) => op.player_id === p.player_id);
                  return (
                    <div key={p.player_id} className={`px-3 py-2 rounded text-sm flex justify-between items-center ${removed ? "bg-red-500/10 border border-red-600/30 text-red-400" : "bg-[#0b0f14]"}`}>
                      <span>{p.player_name} {removed && "✕"}</span>
                      <span className="text-xs">{p.current_price} cr</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Optimized */}
            <div className="card p-5 flex flex-col gap-4 border-court-orange/30">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-court-orange text-sm uppercase">Optimized Team</h3>
                <span className="text-xs text-gray-400 capitalize">{STRATEGY_INFO[result.strategy].icon} {result.strategy}</span>
              </div>
              <div className="flex items-center gap-2">
                <HealthRing score={result.optimized_team.team_health.score} label={result.optimized_team.team_health.label} />
                <Delta v={result.comparison.health_change} />
              </div>
              <div className="text-sm flex flex-col gap-1">
                <div className="flex justify-between items-center"><span className="text-gray-400">Salary Used</span><div className="flex items-center gap-2"><span>{result.optimized_team.salary_used} cr</span><Delta v={-result.comparison.budget_change} unit=" cr" /></div></div>
                <div className="flex justify-between"><span className="text-gray-400">Remaining</span><span className="text-court-green">{result.optimized_team.remaining_budget} cr</span></div>
                <div className="flex justify-between mt-1"><span className="text-gray-400">Captain</span><span className={`font-semibold ${result.comparison.captain_changed ? "text-court-orange" : ""}`}>{result.optimized_team.captain.player_name}{result.comparison.captain_changed && " 🔄"}</span></div>
              </div>
              <div className="flex flex-col gap-1.5">
                {result.optimized_team.players.map((p) => {
                  const added = !result.current_team.players.find((cp) => cp.player_id === p.player_id);
                  return (
                    <div key={p.player_id} className={`px-3 py-2 rounded text-sm flex justify-between items-center ${added ? "bg-court-green/10 border border-court-green/30 text-court-green font-semibold" : "bg-[#0b0f14]"}`}>
                      <div className="flex items-center gap-2">
                        <span>{p.player_name}</span>
                        <FormBadge form={p.form} variant="icon" />
                      </div>
                      <span className="text-xs">{p.current_price} cr</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Summary stats */}
          <div className="card p-5 flex flex-col gap-3">
            <h3 className="font-bold">📊 Optimization Summary</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Health", v: result.comparison.health_change },
                { label: "Budget", v: result.comparison.budget_change, unit: " cr" },
                { label: "Avg FP", v: result.comparison.average_points_change, unit: " FP" },
                { label: "Value", v: result.comparison.value_change, unit: "/cr" },
              ].map(({ label, v, unit = "" }) => (
                <div key={label} className="bg-[#0b0f14] rounded-lg p-3 text-center">
                  <p className="text-xs text-gray-400 mb-1">{label}</p>
                  <Delta v={v} unit={unit} />
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-400">{result.comparison.players_replaced} player{result.comparison.players_replaced !== 1 ? "s" : ""} replaced.</p>
          </div>

          {/* Transfer recommendations */}
          {result.recommendations.length > 0 && (
            <div className="card p-5 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold">🔄 Recommended Transfers</h3>
                <button onClick={copyRecs} className="px-3 py-1 rounded bg-[#1f2733] text-xs font-semibold">
                  {copied ? "Copied! ✓" : "Copy"}
                </button>
              </div>
              {result.recommendations.map((r, i) => (
                <div key={i} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <div className="flex-1 bg-red-500/10 border border-red-600/30 rounded-lg p-3">
                    <p className="text-xs text-red-400 font-semibold uppercase mb-1">OUT</p>
                    <p className="font-bold text-sm">{r.out.player_name}</p>
                    <p className="text-xs text-gray-400">{r.out.current_price} cr · {r.out.value_per_credit.toFixed(2)}/cr</p>
                  </div>
                  <div className="flex items-center justify-center text-gray-500 text-xl flex-shrink-0">↓</div>
                  <div className="flex-1 bg-court-green/10 border border-court-green/30 rounded-lg p-3">
                    <p className="text-xs text-court-green font-semibold uppercase mb-1">IN</p>
                    <p className="font-bold text-sm">{r.in.player_name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <FormBadge form={r.in.form} variant="pill" />
                      <span className="text-xs text-gray-400">{r.in.current_price} cr</span>
                    </div>
                  </div>
                  <div className="sm:w-48 text-xs text-gray-500 leading-relaxed sm:pl-1">{r.reason}</div>
                </div>
              ))}
            </div>
          )}

          {/* CTA */}
          <div className="flex flex-wrap gap-3">
            <Link href="/players" className="btn-primary">Apply These Changes →</Link>
            <button onClick={() => setResult(null)} className="px-4 py-2 rounded-lg bg-[#1f2733] text-sm font-semibold">Reset</button>
          </div>
          <p className="text-xs text-gray-500">↑ Apply These Changes takes you to player selection. Your lineup will not change until you resubmit.</p>
        </>
      )}
    </div>
  );
}
