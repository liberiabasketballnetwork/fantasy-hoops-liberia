"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useRequireAdmin } from "@/hooks/useRequireAdmin";
import { AppModal, ConfirmDialog, LoadingOverlay } from "@/components/ui";

// ─── Password Reset Requests Card (FEATURE-004) ───────────────────────────

type ResetRequestRow = {
  request_id: string; request_reference: string; display_name: string | null;
  phone_masked: string; phone_full: string; status: string;
  time_ago: string; last_login: string | null; admin_notes: string;
};

function PasswordResetRequestsCard() {
  const [requests, setRequests] = React.useState<ResetRequestRow[]>([]);
  const [filter,   setFilter]   = React.useState("pending");
  const [loading,  setLoading]  = React.useState(false);
  const [acting,   setActing]   = React.useState<string | null>(null);
  const [notes,    setNotes]    = React.useState<Record<string,string>>({});
  const [tempPws,  setTempPws]  = React.useState<Record<string,string>>({});
  const [msg,      setMsg]      = React.useState("");

  const load = React.useCallback(() => {
    setLoading(true);
    api.get(`/admin/reset-requests?status=${filter}`)
      .then((r: any) => setRequests(r.data.requests || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [filter]);

  React.useEffect(() => { load(); }, [load]);

  async function complete(req: ResetRequestRow) {
    setActing(req.request_id); setMsg("");
    try {
      const res = await api.post(`/admin/reset-requests/${req.request_id}/complete`, {});
      setTempPws((t) => ({ ...t, [req.request_id]: res.data.temp_password }));
      setMsg(`✅ ${req.request_reference} — temp password issued. Send via WhatsApp.`);
      load();
    } catch (err: any) {
      setMsg(`❌ ${err?.response?.data?.error || "Reset failed."}`);
    } finally { setActing(null); }
  }

  async function reject(req: ResetRequestRow) {
    if (!notes[req.request_id]?.trim()) { setMsg("❌ Notes required for rejection."); return; }
    setActing(req.request_id); setMsg("");
    try {
      await api.post(`/admin/reset-requests/${req.request_id}/reject`, { admin_notes: notes[req.request_id] });
      setMsg(`✅ ${req.request_reference} rejected.`);
      load();
    } catch (err: any) {
      setMsg(`❌ ${err?.response?.data?.error || "Rejection failed."}`);
    } finally { setActing(null); }
  }

  const STATUS_CLS: Record<string, string> = {
    pending: "text-yellow-400", completed: "text-court-green",
    rejected: "text-red-400",  expired: "text-gray-500",
  };

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-1 flex-wrap">
        <h2 className="font-bold">🔐 Password Reset Requests</h2>
      </div>
      <p className="text-xs text-gray-500 mb-3">Review requests, generate temporary passwords, and deliver via WhatsApp.</p>
      <div className="flex flex-wrap gap-2 mb-4">
        {["pending","completed","rejected","all"].map((s) => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-3 py-1 rounded text-xs font-semibold capitalize ${filter === s ? "btn-primary" : "bg-[#1f2733] text-gray-400"}`}>
            {s}
          </button>
        ))}
      </div>
      {loading ? <div className="h-16 animate-pulse bg-[#1f2733] rounded" /> :
       requests.length === 0 ? <p className="text-sm text-gray-400">No {filter === "all" ? "" : filter} requests.</p> : (
        <div className="flex flex-col gap-4">
          {requests.map((r) => (
            <div key={r.request_id} className="bg-[#0b0f14] rounded-lg p-4 flex flex-col gap-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-bold text-court-orange">{r.request_reference}</p>
                    <span className={`text-xs font-semibold capitalize ${STATUS_CLS[r.status] || "text-gray-400"}`}>{r.status}</span>
                  </div>
                  <p className="text-sm font-medium mt-0.5">{r.display_name || "Unknown Manager"}</p>
                  <p className="text-xs text-gray-500 font-mono">{r.phone_masked} · {r.time_ago}</p>
                  {r.last_login && <p className="text-xs text-gray-600">Last login: {new Date(r.last_login).toLocaleDateString()}</p>}
                </div>
              </div>
              {tempPws[r.request_id] && (
                <div className="rounded bg-court-green/10 border border-court-green/30 p-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">Temporary Password — shown once</p>
                    <p className="text-xl font-bold text-court-green tracking-widest">{tempPws[r.request_id]}</p>
                  </div>
                  <button onClick={() => navigator.clipboard?.writeText(tempPws[r.request_id])}
                    className="px-2.5 py-1 rounded bg-[#1f2733] text-xs font-semibold flex-shrink-0">Copy</button>
                </div>
              )}
              {r.status === "pending" && !tempPws[r.request_id] && (
                <div className="flex flex-col gap-2">
                  <input className="input-field text-xs" placeholder="Admin notes (required for rejection)"
                    value={notes[r.request_id] || ""} onChange={e => setNotes(n => ({ ...n, [r.request_id]: e.target.value }))} />
                  <div className="flex gap-2 flex-wrap">
                    <button onClick={() => complete(r)} disabled={acting === r.request_id}
                      className="btn-primary text-xs py-1.5 px-3 disabled:opacity-50">🔑 Reset Password</button>
                    <button onClick={() => reject(r)} disabled={acting === r.request_id || !notes[r.request_id]?.trim()}
                      className="px-3 py-1.5 rounded bg-red-900/40 text-red-400 text-xs font-semibold disabled:opacity-50">❌ Reject</button>
                  </div>
                </div>
              )}
              {r.admin_notes && <p className="text-xs text-gray-600 italic">Note: {r.admin_notes}</p>}
            </div>
          ))}
        </div>
      )}
      {msg && <p className="text-xs mt-3">{msg}</p>}
    </div>
  );
}

// ─── Referral Reward Console (FEATURE-003) ───────────────────────────────

type RewardRow = {
  reward_id: string; referrer_name: string; referred_name: string;
  reward_value: number; reward_type: string; status: string;
  created_at: string; payment_reference: string; admin_notes: string;
};

function ReferralRewardConsole() {
  const [rewards,    setRewards]    = React.useState<RewardRow[]>([]);
  const [filter,     setFilter]     = React.useState("pending");
  const [loading,    setLoading]    = React.useState(false);
  const [acting,     setActing]     = React.useState<string | null>(null);
  const [noteInput,  setNoteInput]  = React.useState<Record<string,string>>({});
  const [payRef,     setPayRef]     = React.useState<Record<string,string>>({});
  const [msg,        setMsg]        = React.useState("");

  const load = React.useCallback(() => {
    setLoading(true);
    api.get(`/admin/referral-rewards?status=${filter}`)
      .then((r: any) => setRewards(r.data.rewards || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [filter]);

  React.useEffect(() => { load(); }, [load]);

  async function act(reward_id: string, action: "approve" | "reject" | "mark-paid") {
    setActing(reward_id); setMsg("");
    try {
      const body: any = { admin_notes: noteInput[reward_id] || "" };
      if (action === "mark-paid") body.payment_reference = payRef[reward_id] || "";
      await api.post(`/admin/referral-rewards/${reward_id}/${action}`, body);
      setMsg(`✅ ${action === "approve" ? "Approved" : action === "reject" ? "Rejected" : "Marked Paid"}`);
      load();
    } catch (err: any) {
      setMsg(`❌ ${err?.response?.data?.error || "Action failed."}`);
    } finally { setActing(null); }
  }

  const STATUS_CLS: Record<string, string> = {
    pending:  "text-yellow-400", approved: "text-court-green",
    paid:     "text-court-green", rejected: "text-red-400",
    suspended:"text-orange-400", reversed: "text-red-400",
  };

  return (
    <div className="card p-5">
      <h2 className="font-bold mb-1">🎁 Referral Reward Console</h2>
      <p className="text-xs text-gray-500 mb-3">Review and action referral rewards. Payment is made out-of-band.</p>

      <div className="flex flex-wrap gap-2 mb-4">
        {["pending","approved","paid","rejected"].map((s) => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-3 py-1 rounded text-xs font-semibold capitalize ${filter === s ? "btn-primary" : "bg-[#1f2733] text-gray-400"}`}>
            {s}
          </button>
        ))}
      </div>

      {loading ? <div className="h-16 animate-pulse bg-[#1f2733] rounded" /> :
       rewards.length === 0 ? <p className="text-sm text-gray-400">No {filter} rewards.</p> : (
        <div className="flex flex-col gap-4">
          {rewards.map((r) => (
            <div key={r.reward_id} className="bg-[#0b0f14] rounded-lg p-4 flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">{r.referrer_name} → {r.referred_name}</p>
                  <p className="text-xs text-gray-500">{new Date(r.created_at).toLocaleDateString()} · LRD {r.reward_value} · {r.reward_type}</p>
                  {r.payment_reference && <p className="text-xs text-gray-500">Ref: {r.payment_reference}</p>}
                </div>
                <span className={`text-xs font-bold capitalize ${STATUS_CLS[r.status] || "text-gray-400"}`}>{r.status}</span>
              </div>

              {r.status === "pending" && (
                <div className="flex flex-col gap-2">
                  <input className="input-field text-xs" placeholder="Admin notes (required for rejection)"
                    value={noteInput[r.reward_id] || ""} onChange={e => setNoteInput(n => ({ ...n, [r.reward_id]: e.target.value }))} />
                  <div className="flex gap-2 flex-wrap">
                    <button onClick={() => act(r.reward_id, "approve")} disabled={acting === r.reward_id}
                      className="btn-primary text-xs py-1.5 px-3 disabled:opacity-50">✅ Approve</button>
                    <button onClick={() => act(r.reward_id, "reject")} disabled={acting === r.reward_id || !noteInput[r.reward_id]}
                      className="px-3 py-1.5 rounded bg-red-900/40 text-red-400 text-xs font-semibold disabled:opacity-50">❌ Reject</button>
                  </div>
                </div>
              )}

              {r.status === "approved" && (
                <div className="flex flex-col gap-2">
                  <input className="input-field text-xs" placeholder="Payment reference (required)"
                    value={payRef[r.reward_id] || ""} onChange={e => setPayRef(p => ({ ...p, [r.reward_id]: e.target.value }))} />
                  <input className="input-field text-xs" placeholder="Admin notes (optional)"
                    value={noteInput[r.reward_id] || ""} onChange={e => setNoteInput(n => ({ ...n, [r.reward_id]: e.target.value }))} />
                  <button onClick={() => act(r.reward_id, "mark-paid")} disabled={acting === r.reward_id || !payRef[r.reward_id]}
                    className="btn-primary text-xs py-1.5 px-3 disabled:opacity-50 w-fit">💰 Mark Paid</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {msg && <p className="text-xs mt-3">{msg}</p>}
    </div>
  );
}

// ─── Team Status Management Card (FEATURE-002) ───────────────────────────

type TeamRow = { team_id: string; team_name: string; status: string; division?: string };

function TeamManagementCard() {
  const [teams,   setTeams]   = React.useState<TeamRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving,  setSaving]  = React.useState<string | null>(null); // team_id being saved
  const [msg,     setMsg]     = React.useState("");

  React.useEffect(() => {
    api.get("/admin/teams")
      .then((r: any) => setTeams(r.data.teams || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function updateStatus(team: TeamRow, newStatus: string) {
    if (newStatus === team.status) return;
    setSaving(team.team_id); setMsg("");
    try {
      await api.patch(`/admin/teams/${team.team_id}/status`, { status: newStatus });
      setTeams((prev) =>
        prev.map((t) => t.team_id === team.team_id ? { ...t, status: newStatus } : t)
      );
      setMsg(`✅ "${team.team_name}" → ${newStatus}`);
    } catch (err: any) {
      setMsg(`❌ Failed: ${err?.response?.data?.error || "Unknown error"}`);
    } finally {
      setSaving(null);
    }
  }

  const STATUS_STYLES: Record<string, string> = {
    Active:     "bg-court-green/15 text-court-green",
    Eliminated: "bg-red-500/15 text-red-400",
    Suspended:  "bg-yellow-500/15 text-yellow-400",
  };

  return (
    <div className="card p-5">
      <h2 className="font-bold mb-1">🏀 Team Status Management</h2>
      <p className="text-xs text-gray-500 mb-4">
        Eliminating a team instantly removes all its players from the draft pool.
        No player records are modified.
      </p>

      {loading ? (
        <div className="h-20 animate-pulse bg-[#1f2733] rounded" />
      ) : teams.length === 0 ? (
        <p className="text-sm text-gray-400">No teams found.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {teams.map((team) => (
            <div key={team.team_id} className="flex items-center justify-between gap-3 py-2 border-b border-[#1f2733] last:border-0 flex-wrap">
              <div className="flex items-center gap-2 min-w-0">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${STATUS_STYLES[team.status] || "bg-[#1f2733] text-gray-400"}`}>
                  {team.status || "Unknown"}
                </span>
                <p className="text-sm font-medium truncate">{team.team_name}</p>
                {team.division && <p className="text-xs text-gray-500 flex-shrink-0">{team.division}</p>}
              </div>
              <div className="flex gap-1.5 flex-shrink-0">
                {["Active", "Eliminated", "Suspended"].map((s) => (
                  <button
                    key={s}
                    onClick={() => updateStatus(team, s)}
                    disabled={saving === team.team_id || team.status === s}
                    className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors disabled:opacity-40 ${
                      team.status === s
                        ? `${STATUS_STYLES[s]} cursor-default`
                        : "bg-[#1f2733] hover:bg-[#2a3441] text-gray-300"
                    }`}
                  >
                    {saving === team.team_id && team.status !== s ? "…" : s}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {msg && <p className="text-xs mt-3">{msg}</p>}
    </div>
  );
}

// ─── Growth Analytics Card (GROWTH-001) ──────────────────────────────────

function GrowthAnalyticsCard() {
  const [analytics, setAnalytics] = React.useState<any>(null);
  const [loading,   setLoading]   = React.useState(false);
  const [error,     setError]     = React.useState("");
  const [sections,  setSections]  = React.useState<Record<string,boolean>>({
    growth: true, funnel: true, engagement: true,
    referrals: true, achievements: true, notifications: true, sponsor: true,
  });

  function toggle(key: string) {
    setSections((s) => ({ ...s, [key]: !s[key] }));
  }

  async function loadAnalytics() {
    setLoading(true); setError("");
    try {
      const res = await api.get("/admin/platform-analytics");
      setAnalytics(res.data);
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to load analytics.");
    } finally { setLoading(false); }
  }

  const a = analytics;

  // ── Subcomponents ─────────────────────────────────────────────────────

  function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
    return (
      <div className="border border-[#1f2733] rounded-lg overflow-hidden">
        <button onClick={() => toggle(id)} className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[#0b0f14] transition-colors">
          <span className="text-sm font-semibold">{title}</span>
          <span className="text-gray-500 text-xs">{sections[id] ? "▼" : "▶"}</span>
        </button>
        {sections[id] && <div className="px-4 pb-4 pt-2">{children}</div>}
      </div>
    );
  }

  function MetricGrid({ items }: { items: { label: string; value: string | number; sub?: string; color?: string }[] }) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {items.map((m) => (
          <div key={m.label} className="bg-[#0b0f14] rounded-lg p-3 text-center">
            <p className={`text-xl font-bold ${m.color || "text-court-orange"}`}>{m.value}</p>
            {m.sub && <p className="text-[10px] text-gray-600 -mt-0.5">{m.sub}</p>}
            <p className="text-xs text-gray-500 mt-0.5 leading-tight">{m.label}</p>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="card p-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div>
          <h2 className="font-bold">📊 Growth Analytics</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {a ? `Generated at ${new Date(a.generatedAt).toLocaleString()}` : "Load analytics on demand to avoid unnecessary API calls."}
          </p>
        </div>
        <button
          onClick={loadAnalytics}
          disabled={loading}
          className="px-3 py-1.5 rounded bg-court-orange text-white text-xs font-semibold hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "Loading…" : a ? "Refresh" : "Load Analytics"}
        </button>
      </div>

      {error && <p className="text-xs text-red-400 mb-4">{error}</p>}

      {!a && !loading && (
        <div className="text-center py-10 text-gray-500 text-sm border border-dashed border-[#1f2733] rounded-lg">
          Click "Load Analytics" to view growth metrics
        </div>
      )}

      {loading && (
        <div className="flex flex-col gap-3">
          {[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-[#1f2733] rounded-lg animate-pulse" />)}
        </div>
      )}

      {a && (
        <div className="flex flex-col gap-3">

          {/* 1. Community Growth */}
          <Section id="growth" title="📈 Community Growth">
            <MetricGrid items={[
              { label: "Total Managers",    value: a.growth.totalManagers },
              { label: "New This Week",     value: `+${a.growth.newThisWeek}`,    color: "text-court-green" },
              { label: "New This Month",    value: `+${a.growth.newThisMonth}`,   color: "text-court-green" },
              { label: "Active Last 7 Days",value: a.growth.activeLastSevenDays },
            ]} />
          </Section>

          {/* 2. Activation Funnel */}
          <Section id="funnel" title="🔄 Activation Funnel">
            <div className="flex flex-col gap-1 mb-3">
              {[
                { label: "Registered",           value: a.funnel.registered,          pct: 100 },
                { label: "Ever Submitted Lineup", value: a.funnel.everSubmittedLineup, pct: a.funnel.activationRate },
                { label: "Active This Week",      value: a.funnel.activeThisWeek,      pct: a.funnel.registered > 0 ? Math.round(a.funnel.activeThisWeek / a.funnel.registered * 100) : 0 },
              ].map((step) => (
                <div key={step.label} className="flex items-center gap-3">
                  <div className="flex-1">
                    <div className="flex items-center justify-between text-xs mb-0.5">
                      <span className="text-gray-300">{step.label}</span>
                      <span className="text-gray-400 font-mono">{step.value} ({step.pct}%)</span>
                    </div>
                    <div className="h-2 rounded-full bg-[#1f2733]">
                      <div className="h-2 rounded-full bg-court-orange transition-all" style={{ width: `${step.pct}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-red-400">{a.funnel.neverDrafted} registered managers have never submitted a lineup.</p>
          </Section>

          {/* 3. Weekly Engagement */}
          <Section id="engagement" title="🗓 Weekly Engagement">
            <MetricGrid items={[
              { label: "This Week Active",   value: a.engagement.weeklyParticipation.at(-1)?.managers ?? 0 },
              { label: "Retention Rate",     value: `${a.engagement.retentionRate}%`,   color: a.engagement.retentionRate >= 70 ? "text-court-green" : "text-yellow-400" },
              { label: "Highest Week",       value: a.engagement.highestWeek },
              { label: "Weekly Average",     value: a.engagement.averageWeekly },
            ]} />
            {a.engagement.weeklyParticipation.length > 0 && (
              <div className="mt-3">
                <p className="text-xs text-gray-500 mb-2">Participation Trend</p>
                <div className="flex items-end gap-1 h-20">
                  {a.engagement.weeklyParticipation.map((w: any) => {
                    const pct = a.engagement.highestWeek > 0 ? Math.round((w.managers / a.engagement.highestWeek) * 100) : 0;
                    return (
                      <div key={w.week_id} className="flex-1 flex flex-col items-center gap-1 group" title={`${w.label}: ${w.managers}`}>
                        <span className="text-[9px] text-gray-600 group-hover:text-gray-400 hidden sm:block">{w.managers}</span>
                        <div className="w-full rounded-t bg-court-orange/70 hover:bg-court-orange transition-all" style={{ height: `${Math.max(pct, 4)}%` }} />
                        <span className="text-[9px] text-gray-600 truncate w-full text-center hidden sm:block">{w.label.split("–")[0]}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-2 text-xs text-gray-500 text-center">
                  {a.engagement.previousWeekManagers > 0 && (
                    <span>{a.engagement.returnedThisWeek}/{a.engagement.previousWeekManagers} managers returned from last week ({a.engagement.retentionRate}% retention)</span>
                  )}
                </div>
              </div>
            )}
          </Section>

          {/* 4. Referral Performance */}
          <Section id="referrals" title="🤝 Referral Performance">
            <MetricGrid items={[
              { label: "Referral Codes",  value: a.referrals.totalCodes },
              { label: "Total Referrals", value: a.referrals.totalReferrals },
              { label: "Qualified",       value: a.referrals.qualified },
              { label: "Conversion",      value: `${a.referrals.conversionRate}%`, color: a.referrals.conversionRate >= 50 ? "text-court-green" : "text-yellow-400" },
            ]} />
            <div className="grid grid-cols-3 gap-2 mt-2">
              {[
                { label: "Rewards Pending",  value: a.referrals.rewardsPending,  color: "text-yellow-400" },
                { label: "Approved",         value: a.referrals.rewardsApproved, color: "text-court-green" },
                { label: "LRD Disbursed",    value: `L${Number(a.referrals.totalLrdDisbursed).toLocaleString()}`, color: "text-court-green" },
              ].map((m) => (
                <div key={m.label} className="bg-[#0b0f14] rounded-lg p-2 text-center">
                  <p className={`text-base font-bold ${m.color}`}>{m.value}</p>
                  <p className="text-[10px] text-gray-500">{m.label}</p>
                </div>
              ))}
            </div>
          </Section>

          {/* 5. Achievement Engagement */}
          <Section id="achievements" title="🏅 Achievement Engagement">
            <MetricGrid items={[
              { label: "Badges Earned",   value: a.achievements.totalEarned },
              { label: "Earners",         value: a.achievements.uniqueEarners },
              { label: "Adoption Rate",   value: `${a.achievements.adoptionRate}%`, color: a.achievements.adoptionRate >= 50 ? "text-court-green" : "text-yellow-400" },
              { label: "No Badges Yet",   value: a.achievements.usersNoBadges, color: "text-gray-400" },
            ]} />
            {a.achievements.topBadges.length > 0 && (
              <div className="mt-3">
                <p className="text-xs text-gray-500 mb-2">Top Badges</p>
                <div className="flex flex-col gap-1">
                  {a.achievements.topBadges.map((b: any, i: number) => (
                    <div key={b.key} className="flex items-center justify-between text-xs">
                      <span className="text-gray-300">{i + 1}. {b.name}</span>
                      <span className="font-bold text-court-orange">{b.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Section>

          {/* 6. Notification Engagement */}
          <Section id="notifications" title="🔔 Notification Engagement">
            <div className="flex items-center gap-4 mb-3">
              <div className="bg-[#0b0f14] rounded-lg px-4 py-2 text-center">
                <p className="text-xl font-bold text-court-orange">{a.notifications.overallReadRate}%</p>
                <p className="text-xs text-gray-500">Overall Read Rate</p>
              </div>
              <div className="text-xs text-gray-500">{a.notifications.overallRead}/{a.notifications.overallSent} notifications read</div>
            </div>
            {a.notifications.byType.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-500 border-b border-[#1f2733]">
                      <th className="text-left py-1.5">Type</th>
                      <th className="text-right py-1.5">Sent</th>
                      <th className="text-right py-1.5">Read</th>
                      <th className="text-right py-1.5">Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {a.notifications.byType.map((n: any) => (
                      <tr key={n.type} className="border-b border-[#1f2733]/50">
                        <td className="py-1.5 text-gray-300 capitalize">{n.type.toLowerCase()}</td>
                        <td className="text-right py-1.5 text-gray-400">{n.sent}</td>
                        <td className="text-right py-1.5 text-gray-400">{n.read}</td>
                        <td className={`text-right py-1.5 font-bold ${n.readRate >= 80 ? "text-court-green" : n.readRate >= 50 ? "text-yellow-400" : "text-red-400"}`}>
                          {n.readRate}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          {/* 7. Sponsor Summary */}
          <Section id="sponsor" title="🤝 Sponsor Summary">
            <div className="bg-[#0b0f14] rounded-lg p-4 border border-[#2a3441]">
              <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-3">Fantasy Hoops Liberia — Community Metrics</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                {[
                  { label: "Registered Managers",       value: a.sponsor.registeredManagers },
                  { label: "Weekly Active Managers",    value: a.sponsor.activeThisWeek },
                  { label: "Completed Gameweeks",       value: a.sponsor.completedGameweeks },
                  { label: "Total Fantasy Teams Created",value: a.sponsor.totalFantasyTeamsCreated },
                  { label: "Prize Money Awarded (LRD)", value: `L${Number(a.sponsor.prizeMoneyAwarded).toLocaleString()}` },
                ].map((m) => (
                  <div key={m.label} className="flex justify-between border-b border-[#1f2733] pb-2">
                    <span className="text-gray-400">{m.label}</span>
                    <span className="font-bold text-court-orange">{m.value}</span>
                  </div>
                ))}
              </div>
              <button
                onClick={() => {
                  const lines = [
                    "Fantasy Hoops Liberia — Community Metrics",
                    `Registered Managers: ${a.sponsor.registeredManagers}`,
                    `Weekly Active Managers: ${a.sponsor.activeThisWeek}`,
                    `Completed Gameweeks: ${a.sponsor.completedGameweeks}`,
                    `Total Fantasy Teams: ${a.sponsor.totalFantasyTeamsCreated}`,
                    `Prize Money Awarded: LRD ${Number(a.sponsor.prizeMoneyAwarded).toLocaleString()}`,
                    `Generated: ${new Date(a.generatedAt).toLocaleDateString()}`,
                  ].join("\n");
                  navigator.clipboard?.writeText(lines);
                }}
                className="mt-3 text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1"
              >
                Copy for sponsor presentation
              </button>
            </div>
          </Section>

        </div>
      )}
    </div>
  );
}

// ─── Platform Settings Card (ADMIN-014) ──────────────────────────────────

function PlatformSettingsCard() {
  const DEFAULTS = {
    prizeMoneyAwarded: "",  currentWeeklyPrize: "",  currentSeason: "",
    inviteHeadline: "",     communityHeadline: "",   announcement: "",
    announcementEnabled: false, sponsorName: "",
  };
  const [form,    setForm]    = React.useState<any>(DEFAULTS);
  const [orig,    setOrig]    = React.useState<any>(DEFAULTS);
  const [loading, setLoading] = React.useState(true);
  const [saving,  setSaving]  = React.useState(false);
  const [msg,     setMsg]     = React.useState("");
  const [errors,  setErrors]  = React.useState<Record<string,string>>({});

  React.useEffect(() => {
    api.get("/platform-settings").then((r: any) => {
      const s = r.data;
      const mapped = {
        prizeMoneyAwarded:  String(s.prizeMoneyAwarded  ?? ""),
        currentWeeklyPrize: String(s.currentWeeklyPrize ?? ""),
        currentSeason:      String(s.currentSeason      ?? ""),
        inviteHeadline:     s.inviteHeadline    ?? "",
        communityHeadline:  s.communityHeadline ?? "",
        announcement:       s.announcement      ?? "",
        announcementEnabled: !!s.announcementEnabled,
        sponsorName:        s.sponsorName       ?? "",
      };
      setForm(mapped); setOrig(mapped);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  function field(key: string, val: string) { setForm((f: any) => ({ ...f, [key]: val })); setErrors((e: any) => ({ ...e, [key]: "" })); }

  async function handleSave() {
    setSaving(true); setMsg(""); setErrors({});
    try {
      const payload = {
        ...form,
        prizeMoneyAwarded:  Number(form.prizeMoneyAwarded),
        currentWeeklyPrize: Number(form.currentWeeklyPrize),
      };
      const res = await api.put("/admin/platform-settings", payload);
      if (res.data.errors) {
        const errs: Record<string,string> = {};
        res.data.errors.forEach((e: any) => { errs[e.field] = e.message; });
        setErrors(errs); setMsg(""); setSaving(false); return;
      }
      const updated = res.data.settings;
      const mapped = {
        prizeMoneyAwarded:  String(updated.prizeMoneyAwarded  ?? ""),
        currentWeeklyPrize: String(updated.currentWeeklyPrize ?? ""),
        currentSeason:      String(updated.currentSeason      ?? ""),
        inviteHeadline:     updated.inviteHeadline    ?? "",
        communityHeadline:  updated.communityHeadline ?? "",
        announcement:       updated.announcement      ?? "",
        announcementEnabled: !!updated.announcementEnabled,
        sponsorName:        updated.sponsorName       ?? "",
      };
      setForm(mapped); setOrig(mapped);
      setMsg("✅ Settings saved.");
    } catch { setMsg("❌ Failed to save."); }
    finally { setSaving(false); }
  }

  function handleCancel() { setForm(orig); setErrors({}); setMsg(""); }

  if (loading) return <div className="card p-5 animate-pulse h-32" />;

  const inputCls = (k: string) =>
    `input-field ${errors[k] ? "border-red-500" : ""}`;

  return (
    <div className="card p-5">
      <h2 className="font-bold mb-1">⚙️ Platform Settings</h2>
      <p className="text-xs text-gray-500 mb-4">Configurable business values. Changes take effect immediately across the platform.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

        {/* Prize Money */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Prize Money Awarded (LRD)</label>
          <input type="number" min={0} className={inputCls("prizeMoneyAwarded")} value={form.prizeMoneyAwarded} onChange={e => field("prizeMoneyAwarded", e.target.value)} />
          {errors.prizeMoneyAwarded && <p className="text-xs text-red-400">{errors.prizeMoneyAwarded}</p>}
        </div>

        {/* Weekly Prize */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Current Weekly Prize (LRD)</label>
          <input type="number" min={0} className={inputCls("currentWeeklyPrize")} value={form.currentWeeklyPrize} onChange={e => field("currentWeeklyPrize", e.target.value)} />
          {errors.currentWeeklyPrize && <p className="text-xs text-red-400">{errors.currentWeeklyPrize}</p>}
        </div>

        {/* Season */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Current Season</label>
          <input className={inputCls("currentSeason")} value={form.currentSeason} onChange={e => field("currentSeason", e.target.value)} />
          {errors.currentSeason && <p className="text-xs text-red-400">{errors.currentSeason}</p>}
        </div>

        {/* Sponsor */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Sponsor Name</label>
          <input className={inputCls("sponsorName")} value={form.sponsorName} onChange={e => field("sponsorName", e.target.value)} />
          {errors.sponsorName && <p className="text-xs text-red-400">{errors.sponsorName}</p>}
        </div>

        {/* Invite headline */}
        <div className="flex flex-col gap-1 sm:col-span-2">
          <label className="text-xs text-gray-500">Invite Page Headline</label>
          <input className={inputCls("inviteHeadline")} value={form.inviteHeadline} onChange={e => field("inviteHeadline", e.target.value)} />
          {errors.inviteHeadline && <p className="text-xs text-red-400">{errors.inviteHeadline}</p>}
        </div>

        {/* Community headline */}
        <div className="flex flex-col gap-1 sm:col-span-2">
          <label className="text-xs text-gray-500">Community Section Title</label>
          <input className={inputCls("communityHeadline")} value={form.communityHeadline} onChange={e => field("communityHeadline", e.target.value)} />
          {errors.communityHeadline && <p className="text-xs text-red-400">{errors.communityHeadline}</p>}
        </div>

        {/* Announcement */}
        <div className="flex flex-col gap-1 sm:col-span-2">
          <label className="text-xs text-gray-500">Announcement Banner</label>
          <div className="flex items-center gap-3 mb-1">
            <div onClick={() => setForm((f: any) => ({ ...f, announcementEnabled: !f.announcementEnabled }))}
              className={`w-9 h-5 rounded-full relative cursor-pointer transition-colors ${form.announcementEnabled ? "bg-court-green" : "bg-[#1f2733]"}`}>
              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${form.announcementEnabled ? "translate-x-4" : "translate-x-0.5"}`} />
            </div>
            <span className="text-xs text-gray-400">{form.announcementEnabled ? "Enabled" : "Disabled"}</span>
          </div>
          <input className="input-field" placeholder="e.g. Draft closes Friday at 5 PM" value={form.announcement} onChange={e => field("announcement", e.target.value)} />
        </div>
      </div>

      <div className="flex items-center gap-3 mt-4">
        <button onClick={handleSave} disabled={saving} className="btn-primary text-sm disabled:opacity-50">{saving ? "Saving…" : "Save Settings"}</button>
        <button onClick={handleCancel} disabled={saving} className="px-3 py-1.5 rounded bg-[#1f2733] text-xs font-semibold disabled:opacity-50">Cancel</button>
        {msg && <span className="text-xs">{msg}</span>}
      </div>
    </div>
  );
}

// ─── Phone Audit Card (AUTH-011) ─────────────────────────────────────────

function PhoneAuditCard() {
  const [result,  setResult]  = React.useState<any>(null);
  const [loading, setLoading] = React.useState(false);
  const [showDetails, setShowDetails] = React.useState(false);

  async function runAudit() {
    setLoading(true);
    try {
      const res = await api.get("/admin/phone-audit");
      setResult(res.data);
    } catch { /* non-fatal */ }
    finally { setLoading(false); }
  }

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div>
          <h2 className="font-bold">📞 Phone Number Audit</h2>
          <p className="text-xs text-gray-500 mt-0.5">Read-only scan. No user data is modified.</p>
        </div>
        <button onClick={runAudit} disabled={loading} className="px-3 py-1.5 rounded bg-[#1f2733] hover:bg-[#2a3441] text-xs font-semibold disabled:opacity-50">
          {loading ? "Scanning…" : "🔍 Run Audit"}
        </button>
      </div>

      {result && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {[
              { label: "Total Users",          value: result.summary.total_users,          cls: "" },
              { label: "Properly Formatted",   value: result.summary.properly_formatted,   cls: "text-court-green" },
              { label: "Missing Leading Zero", value: result.summary.missing_leading_zero, cls: result.summary.missing_leading_zero > 0 ? "text-yellow-400" : "" },
              { label: "Apostrophe Protected", value: result.summary.apostrophe_protected, cls: "" },
              { label: "Invalid Numbers",      value: result.summary.invalid_numbers,      cls: result.summary.invalid_numbers > 0 ? "text-red-400" : "" },
              { label: "Duplicate Phones",     value: result.summary.duplicate_normalized, cls: result.summary.duplicate_normalized > 0 ? "text-red-400" : "" },
            ].map(({ label, value, cls }) => (
              <div key={label} className="bg-[#0b0f14] rounded-lg p-3">
                <p className="text-xs text-gray-500">{label}</p>
                <p className={`text-lg font-bold ${cls || "text-gray-200"}`}>{value}</p>
              </div>
            ))}
          </div>

          {result.duplicates.length > 0 && (
            <div className="rounded-lg border border-red-700/40 bg-red-900/10 p-3 text-xs">
              <p className="text-red-400 font-semibold mb-2">⚠️ Duplicate Phone Numbers</p>
              {result.duplicates.map((d: any, i: number) => (
                <p key={i} className="text-red-300 font-mono">{d.normalized_phone} — {d.count} accounts</p>
              ))}
            </div>
          )}

          <details open={showDetails} onToggle={(e: any) => setShowDetails(e.target.open)} className="group">
            <summary className="cursor-pointer text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1 w-fit">
              <span className="group-open:rotate-90 transition-transform inline-block">▶</span>
              View all {result.details.length} users
            </summary>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-500 border-b border-[#1f2733]">
                    <th className="text-left py-2 pr-3">Manager</th>
                    <th className="text-left py-2 px-2">Raw Phone</th>
                    <th className="text-left py-2 px-2">Normalized</th>
                    <th className="text-center py-2 px-2">Apos</th>
                    <th className="text-center py-2 pl-2">Valid</th>
                  </tr>
                </thead>
                <tbody>
                  {result.details.map((d: any, i: number) => (
                    <tr key={i} className="border-b border-[#1f2733]">
                      <td className="py-1.5 pr-3">{d.display_name}</td>
                      <td className="py-1.5 px-2 font-mono text-gray-400">{d.raw_phone}</td>
                      <td className="py-1.5 px-2 font-mono">{d.normalized}</td>
                      <td className="py-1.5 px-2 text-center">{d.has_apostrophe ? "✓" : "—"}</td>
                      <td className={`py-1.5 pl-2 text-center font-bold ${d.valid ? "text-court-green" : "text-red-400"}`}>{d.valid ? "✅" : "❌"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </div>
      )}
    </div>
  );
}

// ─── Community Settings Card ──────────────────────────────────────────────

function CommunitySettingsCard() {
  const [settings, setSettings] = React.useState({ enabled: false, whatsapp_url: "", reminder_days: "7", card_text: "" });
  const [analytics, setAnalytics] = React.useState<any>(null);
  const [saving, setSaving] = React.useState(false);
  const [msg, setMsg] = React.useState("");

  React.useEffect(() => {
    api.get("/community/admin/settings").then((r: any) => setSettings(r.data)).catch(() => {});
    api.get("/community/admin/analytics").then((r: any) => setAnalytics(r.data)).catch(() => {});
  }, []);

  async function save() {
    setSaving(true); setMsg("");
    try {
      await api.post("/community/admin/settings", settings);
      setMsg("✅ Saved.");
    } catch { setMsg("❌ Save failed."); }
    finally { setSaving(false); }
  }

  return (
    <div className="card p-5">
      <h2 className="font-bold mb-4">💬 Community Settings</h2>
      <div className="flex flex-col gap-4">
        {/* Enable toggle */}
        <label className="flex items-center gap-3 cursor-pointer">
          <div
            onClick={() => setSettings(s => ({ ...s, enabled: !s.enabled }))}
            className={`w-10 h-6 rounded-full transition-colors relative cursor-pointer ${settings.enabled ? "bg-court-green" : "bg-[#1f2733]"}`}
          >
            <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${settings.enabled ? "translate-x-5" : "translate-x-1"}`} />
          </div>
          <span className="text-sm">{settings.enabled ? "Community card enabled" : "Community card disabled"}</span>
        </label>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">WhatsApp Invite Link</label>
          <input className="input-field" placeholder="https://chat.whatsapp.com/..." value={settings.whatsapp_url} onChange={e => setSettings(s => ({ ...s, whatsapp_url: e.target.value }))} />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Reminder Interval (days)</label>
          <input type="number" className="input-field w-24" min={1} max={30} value={settings.reminder_days} onChange={e => setSettings(s => ({ ...s, reminder_days: e.target.value }))} />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Card Benefits Text (one per line, leave blank for defaults)</label>
          <textarea className="input-field" rows={5} placeholder={"🏀 Weekly reminders\n📢 Player news\n🏆 Winner announcements"} value={settings.card_text} onChange={e => setSettings(s => ({ ...s, card_text: e.target.value }))} />
        </div>

        <div className="flex items-center gap-3">
          <button onClick={save} disabled={saving} className="btn-primary text-sm disabled:opacity-50">{saving ? "Saving…" : "Save Settings"}</button>
          {msg && <span className="text-xs">{msg}</span>}
        </div>

        {/* Analytics */}
        {analytics && (
          <div className="border-t border-[#1f2733] pt-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-3">Community Analytics</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Card Shown",    value: analytics.shown },
                { label: "Join Clicked",  value: analytics.join_clicked },
                { label: "Dismissed",     value: analytics.dismissed },
                { label: "Conversion",    value: analytics.conversion_rate },
              ].map(({ label, value }) => (
                <div key={label} className="bg-[#0b0f14] rounded-lg p-3">
                  <p className="text-xs text-gray-500">{label}</p>
                  <p className="text-lg font-bold text-court-orange">{value}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

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
                    <button
                      onClick={async () => { try { const res = await api.post(`/admin/achievements/evaluate/${w.week_id}`); setMessage(`✅ ${res.data.message}`); } catch (err: any) { setMessage(err?.response?.data?.error || "Failed to evaluate achievements."); }}}
                      disabled={!pricesUpd}
                      title={!pricesUpd ? "Run Update Prices first - badge evaluation depends on price history" : ""}
                      className="px-3 py-1.5 rounded bg-[#1f2733] hover:bg-[#2a3441] text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      🏅 Evaluate Badges
                    </button>
                    <a href={`/reports/${w.week_id}`} className="px-3 py-1.5 rounded bg-[#1f2733] hover:bg-[#2a3441] text-xs font-semibold inline-block">View Report</a>
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
                    <button
                      onClick={async () => { try { const res = await api.post(`/admin/achievements/evaluate/${w.week_id}`); setMessage(`✅ ${res.data.message}`); } catch (err: any) { setMessage(err?.response?.data?.error || "Failed to evaluate achievements."); }}}
                      disabled={!pricesUpd}
                      title={!pricesUpd ? "Run Update Prices first - badge evaluation depends on price history" : ""}
                      className="px-3 py-1.5 rounded bg-[#1f2733] hover:bg-[#2a3441] text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      🏅 Evaluate Badges
                    </button>
                    <a href={`/reports/${w.week_id}`} className="px-3 py-1.5 rounded bg-[#1f2733] hover:bg-[#2a3441] text-xs font-semibold inline-block">View Report</a>
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

      {/* FEATURE-004: Password Reset Requests */}
      <PasswordResetRequestsCard />

      {/* FEATURE-003: Referral Reward Console */}
      <ReferralRewardConsole />

      {/* FEATURE-002: Team Status Management */}
      <TeamManagementCard />

      {/* GROWTH-001: Manager Engagement Analytics */}
      <GrowthAnalyticsCard />

      {/* ADMIN-014: Platform Settings */}
      <PlatformSettingsCard />

      {/* AUTH-011: Phone Audit */}
      <PhoneAuditCard />

      {/* Community Settings — FEATURE-001 */}
      <CommunitySettingsCard />

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
