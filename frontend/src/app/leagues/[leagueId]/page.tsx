"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { ConfirmDialog, AppModal } from "@/components/ui";

interface StandingEntry {
  league_rank: number;
  rank: number;
  user_id: string;
  display_name: string;
  score: number;
}

interface LeagueDetail {
  league: {
    league_id: string;
    league_name: string;
    description: string;
    invite_code: string;
    owner_user_id: string;
    max_members: number;
    member_count: number;
    members: { user_id: string; joined_at: string }[];
  };
  standings: StandingEntry[];
}

export default function LeagueDetailPage() {
  const { user, loading: authLoading } = useAuth();
  const params = useParams<{ leagueId: string }>();
  const router = useRouter();

  const [data, setData] = useState<LeagueDetail | null>(null);
  const [users, setUsers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showLeave, setShowLeave] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [modal, setModal] = useState<{ open: boolean; type: "success"|"error"; title: string; message: string }>({ open: false, type: "success", title: "", message: "" });

  useEffect(() => {
    if (authLoading || !user || !params?.leagueId) return;
    Promise.all([
      api.get(`/leagues/${params.leagueId}`),
      api.get("/admin/users").catch(() => ({ data: { users: [] } })),
    ])
      .then(([leagueRes, usersRes]) => {
        setData(leagueRes.data);
        const um: Record<string, string> = {};
        for (const u of usersRes.data.users || []) um[u.user_id] = u.display_name || u.full_name;
        setUsers(um);
      })
      .catch((err) => setError(err?.response?.data?.error || "Failed to load league."))
      .finally(() => setLoading(false));
  }, [user, authLoading, params?.leagueId]);

  async function handleLeave() {
    if (!params?.leagueId) return;
    setLeaving(true);
    try {
      await api.post(`/leagues/${params.leagueId}/leave`);
      router.push("/leagues");
    } catch (err: any) {
      setShowLeave(false);
      setModal({ open: true, type: "error", title: "Cannot Leave", message: err?.response?.data?.error || "Failed to leave league." });
    } finally { setLeaving(false); }
  }

  function copyCode() {
    if (!data) return;
    navigator.clipboard.writeText(data.league.invite_code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  }

  if (!authLoading && !user) return (
    <div className="card p-8 text-center">
      <p className="text-gray-400 mb-4">Log in to view this league.</p>
      <Link href="/login" className="btn-primary">Log in</Link>
    </div>
  );

  if (loading) return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <div className="w-10 h-10 rounded-full border-4 border-[#1f2733] border-t-court-orange animate-spin" />
    </div>
  );

  if (error) return (
    <div className="card p-6 text-center">
      <p className="text-red-400 mb-3">{error}</p>
      <Link href="/leagues" className="text-court-orange text-sm">← Back to Leagues</Link>
    </div>
  );

  if (!data) return null;
  const { league, standings } = data;
  const isOwner = league.owner_user_id === user?.user_id;

  return (
    <div className="flex flex-col gap-5">
      <AppModal open={modal.open} type={modal.type} title={modal.title} message={modal.message} confirmText="OK" onConfirm={() => setModal({ ...modal, open: false })} />

      <ConfirmDialog
        open={showLeave}
        title="Leave League"
        message={`Are you sure you want to leave "${league.league_name}"? You can rejoin later with the invite code.`}
        confirmText="Leave League"
        loading={leaving}
        loadingText="Leaving..."
        onConfirm={handleLeave}
        onCancel={() => setShowLeave(false)}
      />

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <Link href="/leagues" className="text-xs text-gray-400 hover:text-court-orange">← My Leagues</Link>
          <h1 className="text-2xl font-bold mt-1">{league.league_name}</h1>
          {league.description && <p className="text-sm text-gray-400 mt-0.5">{league.description}</p>}
        </div>
        {!isOwner && (
          <button onClick={() => setShowLeave(true)} className="px-3 py-1.5 rounded bg-red-900/30 text-red-400 text-xs font-semibold hover:bg-red-900/50">
            Leave League
          </button>
        )}
      </div>

      {/* League info */}
      <div className="card p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex flex-col gap-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-gray-400">Members:</span>
            <span className="font-semibold">{league.member_count} / {league.max_members}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-400">Invite Code:</span>
            <span className="font-mono font-bold text-court-orange tracking-widest">{league.invite_code}</span>
            <button onClick={copyCode} className="text-xs text-gray-400 hover:text-white" title="Copy">
              {copiedCode ? "✓ Copied" : "📋 Copy"}
            </button>
          </div>
          {isOwner && (
            <span className="text-xs bg-court-orange/15 text-court-orange px-2 py-0.5 rounded-full w-fit">
              You are the owner
            </span>
          )}
        </div>
      </div>

      {/* Standings */}
      <div className="card overflow-hidden">
        <div className="p-4 border-b border-[#1f2733] flex items-center gap-2">
          <h2 className="font-bold">🏅 League Standings</h2>
          <span className="text-xs text-gray-500">(Latest scored gameweek)</span>
        </div>
        {standings.length === 0 ? (
          <div className="p-8 text-center flex flex-col items-center gap-3">
            <span className="text-3xl">📊</span>
            <p className="font-bold">No Standings Yet</p>
            <p className="text-sm text-gray-400">Standings will appear once the first gameweek is scored and members have submitted lineups.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-[#0b0f14] text-gray-400">
              <tr>
                <th className="text-left p-3">Rank</th>
                <th className="text-left p-3">Player</th>
                <th className="text-right p-3">Fantasy Points</th>
                <th className="text-right p-3 hidden sm:table-cell">Global Rank</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((entry) => (
                <tr
                  key={entry.user_id}
                  className={`border-t border-[#1f2733] ${entry.user_id === user?.user_id ? "bg-court-orange/5" : ""}`}
                >
                  <td className="p-3">
                    <span className={`font-bold ${entry.league_rank === 1 ? "text-yellow-400" : entry.league_rank === 2 ? "text-gray-300" : entry.league_rank === 3 ? "text-amber-600" : ""}`}>
                      #{entry.league_rank}
                    </span>
                  </td>
                  <td className="p-3">
                    <span className="font-medium">{entry.display_name}</span>
                    {entry.user_id === user?.user_id && (
                      <span className="ml-2 text-xs text-court-orange">(You)</span>
                    )}
                  </td>
                  <td className="p-3 text-right font-bold text-court-orange">{entry.score}</td>
                  <td className="p-3 text-right text-gray-400 hidden sm:table-cell">#{entry.rank}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Members list */}
      <div className="card p-5">
        <h2 className="font-bold mb-3">👥 Members ({league.member_count})</h2>
        <div className="flex flex-col gap-1.5">
          {league.members.map((m) => (
            <div key={m.user_id} className="flex items-center justify-between text-sm py-1.5 border-b border-[#1f2733] last:border-0">
              <div className="flex items-center gap-2">
                <span>{users[m.user_id] || m.user_id.slice(0, 8) + "..."}</span>
                {m.user_id === league.owner_user_id && (
                  <span className="text-xs bg-court-orange/15 text-court-orange px-1.5 py-0.5 rounded-full">Owner</span>
                )}
              </div>
              <span className="text-xs text-gray-500">
                Joined {new Date(m.joined_at).toLocaleDateString()}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
