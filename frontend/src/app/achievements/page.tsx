"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

interface AchievementWithBadge {
  achievement_id: string;
  badge_key: string;
  badge_name: string;
  description: string;
  icon: string;
  earned_at: string;
  week_id: string;
  repeatable: boolean;
  metadata: string;
}

interface BadgeDef {
  key: string;
  name: string;
  description: string;
  icon: string;
  requirement: string;
  repeatable: boolean;
}

interface AchievementsData {
  earned: AchievementWithBadge[];
  locked: BadgeDef[];
  total_earned: number;
}

export default function AchievementsPage() {
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = useState<AchievementsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading || !user) return;
    api.get("/achievements")
      .then((res) => setData(res.data))
      .finally(() => setLoading(false));
  }, [user, authLoading]);

  if (!authLoading && !user) return (
    <div className="card p-8 text-center">
      <p className="text-gray-400 mb-4">Log in to view your achievements.</p>
      <Link href="/login" className="btn-primary">Log in</Link>
    </div>
  );

  if (loading || authLoading) return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <div className="w-10 h-10 rounded-full border-4 border-[#1f2733] border-t-court-orange animate-spin" />
    </div>
  );

  if (!data) return null;
  const completionPct = Math.round((data.total_earned / (data.earned.length + data.locked.length)) * 100) || 0;

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">🏅 Achievements</h1>
        <p className="text-sm text-gray-400 mt-0.5">Badges earned through fantasy performance.</p>
      </div>

      {/* Progress bar */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold">{data.total_earned} badges earned</span>
          <span className="text-sm text-gray-400">{completionPct}% complete</span>
        </div>
        <div className="w-full h-2 bg-[#1f2733] rounded overflow-hidden">
          <div className="h-full bg-court-orange rounded transition-all" style={{ width: `${completionPct}%` }} />
        </div>
        <p className="text-xs text-gray-500 mt-2">{data.locked.length} badge{data.locked.length !== 1 ? "s" : ""} still to unlock.</p>
      </div>

      {/* Earned badges */}
      {data.earned.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="font-bold text-sm uppercase text-gray-400">Earned</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {data.earned.map((a) => (
              <div key={a.achievement_id} className="card p-4 flex items-start gap-4 border-court-orange/30">
                <span className="text-3xl flex-shrink-0">{a.icon}</span>
                <div>
                  <p className="font-bold">{a.badge_name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{a.description}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    Earned {new Date(a.earned_at).toLocaleDateString()}
                    {a.repeatable && <span className="ml-2 text-court-orange">↻ repeatable</span>}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Locked badges */}
      {data.locked.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="font-bold text-sm uppercase text-gray-400">Locked</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {data.locked.map((b) => (
              <div key={b.key} className="card p-4 flex items-start gap-4 opacity-50">
                <span className="text-3xl flex-shrink-0 grayscale">{b.icon}</span>
                <div>
                  <p className="font-bold text-gray-400">{b.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{b.requirement}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {data.earned.length === 0 && (
        <div className="card p-10 text-center flex flex-col items-center gap-3">
          <span className="text-4xl">🏅</span>
          <p className="font-bold">No Badges Yet</p>
          <p className="text-sm text-gray-400 max-w-sm">Submit your lineup and compete to start earning badges.</p>
          <Link href="/players" className="btn-primary text-sm">Pick Your Team →</Link>
        </div>
      )}
    </div>
  );
}
