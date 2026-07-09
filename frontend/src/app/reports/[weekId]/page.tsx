"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { PriceBadge, FormBadge } from "@/components/ui";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ReportData {
  report: {
    week_id: string;
    generated_at: string;
    player_of_week: { player_id: string; player_name: string; team_id: string; fantasy_points: number; current_price: number } | null;
    biggest_riser: { player_id: string; player_name: string; old_price: number; new_price: number; change: number } | null;
    biggest_faller: { player_id: string; player_name: string; old_price: number; new_price: number; change: number } | null;
    hidden_gem: { player_id: string; player_name: string; team_id: string; fantasy_average: number; price: number; value_per_credit: number } | null;
    hottest_form: { player_id: string; player_name: string; last_5_average: number; form: "hot" | "good" | "average" | "cold" } | null;
    best_value: { player_id: string; player_name: string; value_per_credit: number; price: number; average_points: number } | null;
    fantasy_team_of_week: { players: { player_id: string; player_name: string; team_id: string; fantasy_points: number }[]; total_fantasy_points: number };
    market_summary: { increased: number; decreased: number; unchanged: number; average_change: number };
  };
  week: { week_id: string; start_date: string; end_date: string };
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function ReportCard({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <div className="card p-5 flex flex-col gap-3">
      <div className="flex items-center gap-2 border-b border-[#1f2733] pb-3">
        <span className="text-xl" aria-hidden="true">{icon}</span>
        <h2 className="font-bold text-base">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function EmptyCard({ message }: { message: string }) {
  return <p className="text-sm text-gray-500 py-2">{message}</p>;
}

function StatRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-gray-400">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function WeeklyReportPage() {
  const params = useParams<{ weekId: string }>();
  const weekId = params?.weekId;
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [teams, setTeams] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!weekId) return;
    Promise.all([
      api.get(`/reports/weekly/${weekId}`),
      api.get("/teams"),
    ])
      .then(([reportRes, teamsRes]) => {
        setData(reportRes.data);
        const teamMap: Record<string, string> = {};
        for (const t of teamsRes.data.teams || []) teamMap[t.team_id] = t.team_name;
        setTeams(teamMap);
      })
      .catch((err) => {
        setError(err?.response?.data?.error || "Failed to load report.");
      })
      .finally(() => setLoading(false));
  }, [weekId]);

  const tn = (teamId: string) => teams[teamId] || "—";

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full border-4 border-[#1f2733] border-t-court-orange animate-spin" />
          <p className="text-sm text-gray-400">Generating report...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card p-6 text-center">
        <p className="text-red-400 text-sm mb-3">{error}</p>
        <Link href="/leaderboard" className="text-court-orange text-sm">← Back to Leaderboard</Link>
      </div>
    );
  }

  if (!data) return null;
  const { report, week } = data;

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">📋 Weekly Report</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {week.start_date} → {week.end_date}
          </p>
        </div>
        <Link href="/leaderboard" className="text-court-orange text-sm">
          ← Leaderboard
        </Link>
      </div>
      <p className="text-xs text-gray-500">
        Generated {new Date(report.generated_at).toLocaleString()}
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 1. Player of the Week */}
        <ReportCard icon="🏆" title="Player of the Week">
          {!report.player_of_week ? (
            <EmptyCard message="No completed games available for this week." />
          ) : (
            <>
              <div>
                <p className="font-bold text-lg">{report.player_of_week.player_name}</p>
                <p className="text-xs text-gray-400">{tn(report.player_of_week.team_id)}</p>
              </div>
              <StatRow label="Fantasy Points" value={report.player_of_week.fantasy_points} />
              <StatRow label="Price" value={`${report.player_of_week.current_price} cr`} />
            </>
          )}
        </ReportCard>

        {/* 2. Biggest Riser */}
        <ReportCard icon="📈" title="Biggest Price Riser">
          {!report.biggest_riser ? (
            <EmptyCard message="No price increases recorded this gameweek." />
          ) : (
            <>
              <div>
                <p className="font-bold text-lg">{report.biggest_riser.player_name}</p>
              </div>
              <StatRow label="Previous Price" value={`${report.biggest_riser.old_price} cr`} />
              <StatRow label="New Price" value={`${report.biggest_riser.new_price} cr`} />
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">Change</span>
                <span className="font-bold text-court-green">
                  ▲ +{report.biggest_riser.change} cr
                </span>
              </div>
            </>
          )}
        </ReportCard>

        {/* 3. Biggest Faller */}
        <ReportCard icon="📉" title="Biggest Price Faller">
          {!report.biggest_faller ? (
            <EmptyCard message="No price drops recorded this gameweek." />
          ) : (
            <>
              <div>
                <p className="font-bold text-lg">{report.biggest_faller.player_name}</p>
              </div>
              <StatRow label="Previous Price" value={`${report.biggest_faller.old_price} cr`} />
              <StatRow label="New Price" value={`${report.biggest_faller.new_price} cr`} />
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">Change</span>
                <span className="font-bold text-red-400">
                  ▼ {report.biggest_faller.change} cr
                </span>
              </div>
            </>
          )}
        </ReportCard>

        {/* 4. Hidden Gem */}
        <ReportCard icon="💎" title="Hidden Gem">
          {!report.hidden_gem ? (
            <EmptyCard message="No hidden gems found this week." />
          ) : (
            <>
              <div>
                <p className="font-bold text-lg">{report.hidden_gem.player_name}</p>
                <p className="text-xs text-gray-400">{tn(report.hidden_gem.team_id)}</p>
              </div>
              <StatRow label="Price" value={`${report.hidden_gem.price} cr`} />
              <StatRow label="Season Average" value={report.hidden_gem.fantasy_average.toFixed(1)} />
              <StatRow label="Value/Credit" value={report.hidden_gem.value_per_credit.toFixed(2)} />
            </>
          )}
        </ReportCard>

        {/* 5. Hottest Form */}
        <ReportCard icon="🔥" title="Hottest Form Player">
          {!report.hottest_form ? (
            <EmptyCard message="Not enough game history for form rankings." />
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold text-lg">{report.hottest_form.player_name}</p>
                </div>
                <FormBadge form={report.hottest_form.form} variant="pill" />
              </div>
              <StatRow label="Last 5 Average" value={report.hottest_form.last_5_average.toFixed(1)} />
            </>
          )}
        </ReportCard>

        {/* 6. Best Value */}
        <ReportCard icon="⭐" title="Best Value Player">
          {!report.best_value ? (
            <EmptyCard message="Not enough games played to rank value." />
          ) : (
            <>
              <div>
                <p className="font-bold text-lg">{report.best_value.player_name}</p>
              </div>
              <StatRow label="Price" value={`${report.best_value.price} cr`} />
              <StatRow label="Season Average" value={report.best_value.average_points.toFixed(1)} />
              <StatRow label="Value/Credit" value={report.best_value.value_per_credit.toFixed(2)} />
            </>
          )}
        </ReportCard>
      </div>

      {/* 7. Team of the Week - full width */}
      <ReportCard icon="🏀" title="Fantasy Team of the Week">
        {report.fantasy_team_of_week.players.length === 0 ? (
          <EmptyCard message="No completed games available for this week." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[#0b0f14] text-gray-400">
                  <tr>
                    <th className="text-left p-3">Player</th>
                    <th className="text-left p-3 hidden sm:table-cell">Team</th>
                    <th className="text-right p-3">Fantasy Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {report.fantasy_team_of_week.players.map((p, i) => (
                    <tr key={p.player_id} className="border-t border-[#1f2733]">
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500">#{i + 1}</span>
                          <span className="font-medium">{p.player_name}</span>
                        </div>
                      </td>
                      <td className="p-3 text-gray-400 hidden sm:table-cell">{tn(p.team_id)}</td>
                      <td className="p-3 text-right font-bold text-court-orange">
                        {p.fantasy_points}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between text-sm pt-2 border-t border-[#1f2733]">
              <span className="text-gray-400">Combined Fantasy Points</span>
              <span className="font-bold text-court-orange text-base">
                {report.fantasy_team_of_week.total_fantasy_points}
              </span>
            </div>
          </>
        )}
      </ReportCard>

      {/* 8. Market Summary - full width */}
      <ReportCard icon="📊" title="Market Summary">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="card p-3 text-center border-court-green/30">
            <p className="text-2xl font-bold text-court-green">{report.market_summary.increased}</p>
            <p className="text-xs text-gray-400 mt-1">Price Risers</p>
          </div>
          <div className="card p-3 text-center border-red-600/30">
            <p className="text-2xl font-bold text-red-400">{report.market_summary.decreased}</p>
            <p className="text-xs text-gray-400 mt-1">Price Fallers</p>
          </div>
          <div className="card p-3 text-center">
            <p className="text-2xl font-bold text-gray-300">{report.market_summary.unchanged}</p>
            <p className="text-xs text-gray-400 mt-1">Unchanged</p>
          </div>
          <div className="card p-3 text-center">
            <p className={`text-2xl font-bold ${report.market_summary.average_change > 0 ? "text-court-green" : report.market_summary.average_change < 0 ? "text-red-400" : "text-gray-300"}`}>
              {report.market_summary.average_change > 0 ? "+" : ""}{report.market_summary.average_change}
            </p>
            <p className="text-xs text-gray-400 mt-1">Avg Change</p>
          </div>
        </div>
      </ReportCard>
    </div>
  );
}
