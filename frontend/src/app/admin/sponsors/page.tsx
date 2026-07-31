"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import Link from "next/link";

// ─── Types ─────────────────────────────────────────────────────────────────

type Sponsor = {
  sponsor_id: string; company_name: string; logo_url: string; website: string;
  tier: string; contract_start: string; contract_end: string; status: string; created_at: string;
};

type AnalyticsData = {
  sponsor: Sponsor; campaigns: number; gameweeks: number;
  managersReached: number; notificationDeliveries: number; whatsappDeliveries: number;
  generatedAt: string;
};

const TIERS = ["platinum", "gold", "silver", "partner"];

const TIER_CLS: Record<string, string> = {
  platinum: "text-yellow-300 bg-yellow-900/20",
  gold:     "text-yellow-400 bg-yellow-900/15",
  silver:   "text-gray-300 bg-gray-700/30",
  partner:  "text-blue-400 bg-blue-900/20",
};

const STATUS_CLS: Record<string, string> = {
  active:   "text-court-green",
  inactive: "text-gray-500",
  expired:  "text-red-400",
  pending:  "text-yellow-400",
};

function contractExpiringSoon(end: string): boolean {
  if (!end) return false;
  const diff = new Date(end).getTime() - Date.now();
  return diff > 0 && diff < 30 * 24 * 60 * 60 * 1000;
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function SponsorsPage() {
  const [sponsors,   setSponsors]   = useState<Sponsor[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [selected,   setSelected]   = useState<Sponsor | null>(null);
  const [analytics,  setAnalytics]  = useState<AnalyticsData | null>(null);
  const [anaLoading, setAnaLoading] = useState(false);
  const [view,       setView]       = useState<"list" | "create" | "edit" | "analytics">("list");
  const [msg,        setMsg]        = useState("");
  const [search,     setSearch]     = useState("");

  const [form, setForm] = useState({
    company_name: "", logo_url: "", website: "", tier: "silver",
    contract_start: "", contract_end: "",
  });

  function f(k: string, v: string) { setForm((p) => ({ ...p, [k]: v })); }

  async function load() {
    setLoading(true);
    try {
      const res = await api.get("/admin/sponsors");
      setSponsors(res.data.sponsors || []);
    } catch { /* non-fatal */ }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function save() {
    setMsg("");
    try {
      if (view === "create") {
        await api.post("/admin/sponsors", form);
        setMsg("✅ Sponsor created.");
      } else if (view === "edit" && selected) {
        await api.patch(`/admin/sponsors/${selected.sponsor_id}`, form);
        setMsg("✅ Sponsor updated.");
      }
      await load();
      setView("list");
    } catch (err: any) {
      setMsg(`❌ ${err?.response?.data?.error || "Failed."}`);
    }
  }

  async function deactivate(id: string) {
    if (!confirm("Deactivate this sponsor?")) return;
    await api.post(`/admin/sponsors/${id}/deactivate`).catch(() => {});
    await load();
  }

  async function viewAnalytics(s: Sponsor) {
    setSelected(s); setView("analytics"); setAnaLoading(true); setAnalytics(null);
    try {
      const res = await api.get(`/admin/sponsors/${s.sponsor_id}/analytics`);
      setAnalytics(res.data);
    } catch { /* non-fatal */ }
    finally { setAnaLoading(false); }
  }

  function startEdit(s: Sponsor) {
    setSelected(s);
    setForm({
      company_name: s.company_name, logo_url: s.logo_url, website: s.website,
      tier: s.tier, contract_start: s.contract_start, contract_end: s.contract_end,
    });
    setView("edit"); setMsg("");
  }

  const filtered = sponsors.filter((s) =>
    !search || s.company_name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="max-w-5xl mx-auto flex flex-col gap-5 p-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">🤝 Sponsors</h1>
          <p className="text-sm text-gray-400 mt-0.5">Manage commercial partners and sponsorships.</p>
        </div>
        <div className="flex gap-2">
          {view !== "list" && (
            <button onClick={() => { setView("list"); setMsg(""); }} className="px-3 py-1.5 rounded bg-[#1f2733] text-xs font-semibold text-gray-400">
              ← Back
            </button>
          )}
          {view === "list" && (
            <button onClick={() => { setView("create"); setForm({ company_name: "", logo_url: "", website: "", tier: "silver", contract_start: "", contract_end: "" }); setMsg(""); }}
              className="btn-primary text-xs py-1.5 px-3">
              + Add Sponsor
            </button>
          )}
        </div>
      </div>

      {/* ── List ── */}
      {view === "list" && (
        <>
          <input className="input-field max-w-sm" placeholder="Search sponsors..." value={search} onChange={e => setSearch(e.target.value)} />
          {loading ? <div className="h-20 animate-pulse bg-[#1f2733] rounded" /> :
           filtered.length === 0 ? (
            <div className="card p-10 text-center text-gray-400">
              {search ? "No sponsors match your search." : "No sponsors yet. Add your first commercial partner."}
            </div>
           ) : (
            <div className="card overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 border-b border-[#1f2733]">
                    <th className="text-left p-3">Company</th>
                    <th className="text-left p-3">Tier</th>
                    <th className="text-left p-3">Status</th>
                    <th className="text-left p-3">Contract</th>
                    <th className="text-right p-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s) => (
                    <tr key={s.sponsor_id} className="border-b border-[#1f2733] hover:bg-[#0b0f14]">
                      <td className="p-3">
                        <p className="font-medium">{s.company_name}</p>
                        {s.website && <p className="text-xs text-gray-500">{s.website}</p>}
                      </td>
                      <td className="p-3">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${TIER_CLS[s.tier] || "text-gray-400"}`}>
                          {s.tier}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className={`text-xs font-semibold capitalize ${STATUS_CLS[s.status] || "text-gray-400"}`}>
                          {s.status}
                        </span>
                      </td>
                      <td className="p-3 text-xs text-gray-400">
                        {s.contract_end
                          ? <>Until {new Date(s.contract_end).toLocaleDateString()}
                              {contractExpiringSoon(s.contract_end) && (
                                <span className="ml-1 text-yellow-400">⚠️ Expiring soon</span>
                              )}
                            </>
                          : "—"}
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex gap-1.5 justify-end">
                          <button onClick={() => viewAnalytics(s)} className="px-2 py-1 rounded bg-[#1f2733] text-xs hover:bg-[#2a3441]">Analytics</button>
                          <button onClick={() => startEdit(s)}      className="px-2 py-1 rounded bg-[#1f2733] text-xs hover:bg-[#2a3441]">Edit</button>
                          {s.status === "active" && (
                            <button onClick={() => deactivate(s.sponsor_id)} className="px-2 py-1 rounded bg-red-900/30 text-red-400 text-xs hover:bg-red-900/50">Deactivate</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
           )}
        </>
      )}

      {/* ── Create / Edit ── */}
      {(view === "create" || view === "edit") && (
        <div className="card p-6 flex flex-col gap-4 max-w-lg">
          <h2 className="font-bold">{view === "create" ? "Add Sponsor" : `Edit — ${selected?.company_name}`}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1 sm:col-span-2">
              <label className="text-xs text-gray-500">Company Name *</label>
              <input className="input-field" value={form.company_name} onChange={e => f("company_name", e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500">Tier</label>
              <select className="input-field" value={form.tier} onChange={e => f("tier", e.target.value)}>
                {TIERS.map(t => <option key={t} value={t} className="capitalize">{t}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500">Website</label>
              <input className="input-field" placeholder="https://..." value={form.website} onChange={e => f("website", e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500">Contract Start</label>
              <input type="date" className="input-field" value={form.contract_start} onChange={e => f("contract_start", e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500">Contract End</label>
              <input type="date" className="input-field" value={form.contract_end} onChange={e => f("contract_end", e.target.value)} />
            </div>
            <div className="flex flex-col gap-1 sm:col-span-2">
              <label className="text-xs text-gray-500">Logo URL</label>
              <input className="input-field" placeholder="https://..." value={form.logo_url} onChange={e => f("logo_url", e.target.value)} />
            </div>
          </div>
          {msg && <p className="text-xs">{msg}</p>}
          <div className="flex gap-2">
            <button onClick={save} className="btn-primary text-sm">
              {view === "create" ? "Create Sponsor" : "Save Changes"}
            </button>
            <button onClick={() => { setView("list"); setMsg(""); }} className="px-3 py-1.5 rounded bg-[#1f2733] text-xs font-semibold text-gray-400">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Analytics ── */}
      {view === "analytics" && selected && (
        <div className="card p-6 flex flex-col gap-4">
          <div>
            <h2 className="font-bold">{selected.company_name} — Analytics</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {anaLoading ? "Loading..." : analytics ? `Generated ${new Date(analytics.generatedAt).toLocaleString()}` : ""}
            </p>
          </div>
          {anaLoading ? (
            <div className="h-24 animate-pulse bg-[#1f2733] rounded" />
          ) : analytics ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                { label: "Campaigns",            value: analytics.campaigns },
                { label: "Gameweeks",             value: analytics.gameweeks },
                { label: "Managers Reached",      value: analytics.managersReached },
                { label: "Notif. Deliveries",     value: analytics.notificationDeliveries },
                { label: "WhatsApp Deliveries",   value: analytics.whatsappDeliveries },
              ].map((m) => (
                <div key={m.label} className="bg-[#0b0f14] rounded-lg p-3 text-center">
                  <p className="text-xl font-bold text-court-orange">{m.value}</p>
                  <p className="text-xs text-gray-500">{m.label}</p>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
