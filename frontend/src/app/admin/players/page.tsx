"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useRequireAdmin } from "@/hooks/useRequireAdmin";
import { AppModal, ConfirmDialog, LoadingOverlay, PriceBadge, FormBadge } from "@/components/ui";

const POSITIONS = ["PG", "SG", "SF", "PF", "C"] as const;
type SortKey = "full_name" | "fantasy_price" | "season_average_fantasy_points" | "team_name";

interface Player {
  player_id: string;
  full_name: string;
  team_id: string;
  position: string;
  fantasy_price: number;
  status: string;
  current_price?: number;
  previous_price?: number;
  price_change?: number;
  price_trend?: "up" | "down" | "same";
  season_average_fantasy_points?: number;
  value_per_credit?: number;
  form?: "hot" | "good" | "average" | "cold";
}

interface Team { team_id: string; team_name: string; }

type ModalState =
  | { open: false }
  | { open: true; type: "success" | "error"; title: string; message: string };

export default function AdminPlayersPage() {
  const { user, loading: authLoading } = useRequireAdmin();

  // Data
  const [players, setPlayers] = useState<Player[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  // Add form
  const [addForm, setAddForm] = useState({ full_name: "", team_id: "", position: "PG", fantasy_price: 6, status: "active" });

  // Edit modal
  const [editPlayer, setEditPlayer] = useState<Player | null>(null);
  const [editForm, setEditForm] = useState({ full_name: "", team_id: "", position: "PG", fantasy_price: 6, status: "active" });
  const [saving, setSaving] = useState(false);

  // Delete confirm
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Feedback modals
  const [modal, setModal] = useState<ModalState>({ open: false });
  const [overlayVisible, setOverlayVisible] = useState(false);

  // Search + filters + sort
  const [search, setSearch] = useState("");
  const [filterTeam, setFilterTeam] = useState("");
  const [filterPosition, setFilterPosition] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("full_name");
  const [sortAsc, setSortAsc] = useState(true);

  function closeModal() { setModal({ open: false }); }

  async function load() {
    const [pRes, tRes] = await Promise.all([
      api.get("/players?status=all"),
      api.get("/teams"),
    ]);
    setPlayers(pRes.data.players || []);
    setTeams(tRes.data.teams || []);
  }

  useEffect(() => {
    if (user?.isAdmin) load().finally(() => setDataLoading(false));
  }, [user]);

  // Team name lookup
  const teamMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const t of teams) m[t.team_id] = t.team_name;
    return m;
  }, [teams]);

  // Client-side filter + sort — no extra API calls
  const filtered = useMemo(() => {
    return players
      .filter((p) => {
        if (search && !p.full_name.toLowerCase().includes(search.toLowerCase())) return false;
        if (filterTeam && p.team_id !== filterTeam) return false;
        if (filterPosition && p.position !== filterPosition) return false;
        if (filterStatus && p.status.toLowerCase() !== filterStatus.toLowerCase()) return false;
        return true;
      })
      .sort((a, b) => {
        let va: any, vb: any;
        if (sortKey === "team_name") { va = teamMap[a.team_id] || ""; vb = teamMap[b.team_id] || ""; }
        else if (sortKey === "fantasy_price") { va = Number(a.current_price ?? a.fantasy_price ?? 0); vb = Number(b.current_price ?? b.fantasy_price ?? 0); }
        else if (sortKey === "season_average_fantasy_points") { va = Number(a.season_average_fantasy_points ?? 0); vb = Number(b.season_average_fantasy_points ?? 0); }
        else { va = a.full_name; vb = b.full_name; }
        if (va < vb) return sortAsc ? -1 : 1;
        if (va > vb) return sortAsc ? 1 : -1;
        return 0;
      });
  }, [players, search, filterTeam, filterPosition, filterStatus, sortKey, sortAsc, teamMap]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc((a) => !a);
    else { setSortKey(key); setSortAsc(true); }
  }
  function sortIcon(key: SortKey) {
    if (sortKey !== key) return <span className="text-gray-600 ml-0.5">↕</span>;
    return <span className="text-court-orange ml-0.5">{sortAsc ? "↑" : "↓"}</span>;
  }

  // ── Add player ──────────────────────────────────────────────────────────────
  async function addPlayer() {
    try {
      await api.post("/admin/add-player", addForm);
      setAddForm({ full_name: "", team_id: "", position: "PG", fantasy_price: 6, status: "active" });
      await load();
      setModal({ open: true, type: "success", title: "Player Added", message: `${addForm.full_name} has been added to the roster.` });
    } catch (err: any) {
      setModal({ open: true, type: "error", title: "Failed to Add", message: err?.response?.data?.error || "Failed to add player." });
    }
  }

  // ── Edit player ─────────────────────────────────────────────────────────────
  function openEdit(p: Player) {
    setEditPlayer(p);
    setEditForm({ full_name: p.full_name, team_id: p.team_id, position: p.position, fantasy_price: Number(p.current_price ?? p.fantasy_price ?? 0), status: p.status || "active" });
  }

  async function saveEdit() {
    if (!editPlayer) return;
    setSaving(true);
    setOverlayVisible(true);
    try {
      await api.patch(`/admin/players/${editPlayer.player_id}`, editForm);
      await load();
      setEditPlayer(null);
      setModal({ open: true, type: "success", title: "Player Updated", message: `${editForm.full_name} has been updated.` });
    } catch (err: any) {
      setModal({ open: true, type: "error", title: "Update Failed", message: err?.response?.data?.error || "Failed to update player." });
    } finally {
      setSaving(false);
      setOverlayVisible(false);
    }
  }

  // ── Delete player ───────────────────────────────────────────────────────────
  async function confirmDelete() {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await api.delete(`/admin/delete-player/${deleteId}`);
      setDeleteId(null);
      await load();
    } catch (err: any) {
      setModal({ open: true, type: "error", title: "Delete Failed", message: err?.response?.data?.error || "Failed to delete player." });
    } finally { setDeleting(false); }
  }

  if (authLoading || dataLoading || !user) return <p className="text-center text-gray-400">Loading...</p>;

  return (
    <div className="flex flex-col gap-5">
      <LoadingOverlay visible={overlayVisible} title="Saving changes..." message="Updating player in the database." />

      <AppModal
        open={modal.open}
        type={modal.open ? modal.type : "info"}
        title={modal.open ? modal.title : ""}
        message={modal.open ? modal.message : ""}
        confirmText="OK"
        onConfirm={closeModal}
      />

      <ConfirmDialog
        open={!!deleteId}
        title="Delete Player"
        message={`Are you sure you want to delete this player? This action cannot be undone. Their historical stats will remain intact.`}
        confirmText="Delete"
        loading={deleting}
        loadingText="Deleting..."
        onConfirm={confirmDelete}
        onCancel={() => setDeleteId(null)}
      />

      {/* Edit modal */}
      {editPlayer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={() => !saving && setEditPlayer(null)} />
          <div className="relative card w-full max-w-md p-6 shadow-2xl animate-[modalIn_0.2s_cubic-bezier(0.34,1.56,0.64,1)]">
            <h2 className="font-bold text-lg mb-4">✏️ Edit Player</h2>
            <div className="flex flex-col gap-3">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Full Name</label>
                <input className="input-field" value={editForm.full_name} onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Team</label>
                <select className="input-field" value={editForm.team_id} onChange={(e) => setEditForm({ ...editForm, team_id: e.target.value })}>
                  <option value="">Select team</option>
                  {teams.map((t) => <option key={t.team_id} value={t.team_id}>{t.team_name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Position</label>
                  <select className="input-field" value={editForm.position} onChange={(e) => setEditForm({ ...editForm, position: e.target.value })}>
                    {POSITIONS.map((pos) => <option key={pos} value={pos}>{pos}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Fantasy Price (5–30)</label>
                  <input type="number" min="5" max="30" className="input-field" value={editForm.fantasy_price} onChange={(e) => setEditForm({ ...editForm, fantasy_price: Number(e.target.value) })} />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Status</label>
                <select className="input-field" value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-5">
              <button onClick={() => setEditPlayer(null)} disabled={saving} className="px-4 py-2 rounded-lg bg-[#1f2733] text-sm font-semibold">Cancel</button>
              <button onClick={saveEdit} disabled={saving} className="btn-primary text-sm">{saving ? "Saving..." : "Save Changes"}</button>
            </div>
          </div>
        </div>
      )}

      <h1 className="text-2xl font-bold">👥 Manage Players</h1>

      {/* Add player form */}
      <div className="card p-5">
        <h2 className="font-bold mb-3">Add Player</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input className="input-field" placeholder="Full name" value={addForm.full_name} onChange={(e) => setAddForm({ ...addForm, full_name: e.target.value })} />
          <select className="input-field" value={addForm.team_id} onChange={(e) => setAddForm({ ...addForm, team_id: e.target.value })}>
            <option value="">Select team</option>
            {teams.map((t) => <option key={t.team_id} value={t.team_id}>{t.team_name}</option>)}
          </select>
          <select className="input-field" value={addForm.position} onChange={(e) => setAddForm({ ...addForm, position: e.target.value })}>
            {POSITIONS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <input type="number" className="input-field" placeholder="Fantasy price" value={addForm.fantasy_price} onChange={(e) => setAddForm({ ...addForm, fantasy_price: Number(e.target.value) })} />
          <select className="input-field" value={addForm.status} onChange={(e) => setAddForm({ ...addForm, status: e.target.value })}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
        <button onClick={addPlayer} className="btn-primary mt-3">Add Player</button>
      </div>

      {/* Search + filters */}
      <div className="card p-4 flex flex-wrap gap-3">
        <input
          className="input-field flex-1 min-w-48"
          placeholder="🔍 Search by name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="input-field w-auto" value={filterTeam} onChange={(e) => setFilterTeam(e.target.value)}>
          <option value="">All teams</option>
          {teams.map((t) => <option key={t.team_id} value={t.team_id}>{t.team_name}</option>)}
        </select>
        <select className="input-field w-auto" value={filterPosition} onChange={(e) => setFilterPosition(e.target.value)}>
          <option value="">All positions</option>
          {POSITIONS.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select className="input-field w-auto" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        {(search || filterTeam || filterPosition || filterStatus) && (
          <button onClick={() => { setSearch(""); setFilterTeam(""); setFilterPosition(""); setFilterStatus(""); }} className="px-3 py-1 rounded bg-[#1f2733] text-xs">Clear</button>
        )}
      </div>

      {/* Player table */}
      <div className="card overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-10 text-center flex flex-col items-center gap-3">
            <span className="text-3xl">🔍</span>
            <p className="font-bold">No players found</p>
            <p className="text-sm text-gray-400">Try adjusting your search or filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#0b0f14] text-gray-400">
                <tr>
                  <th className="text-left p-3 cursor-pointer hover:text-white select-none" onClick={() => toggleSort("full_name")}>
                    Name {sortIcon("full_name")}
                  </th>
                  <th className="text-left p-3 cursor-pointer hover:text-white select-none hidden sm:table-cell" onClick={() => toggleSort("team_name")}>
                    Team {sortIcon("team_name")}
                  </th>
                  <th className="text-left p-3">Pos</th>
                  <th className="text-right p-3 cursor-pointer hover:text-white select-none" onClick={() => toggleSort("fantasy_price")}>
                    Price {sortIcon("fantasy_price")}
                  </th>
                  <th className="text-right p-3 cursor-pointer hover:text-white select-none hidden md:table-cell" onClick={() => toggleSort("season_average_fantasy_points")}>
                    Avg {sortIcon("season_average_fantasy_points")}
                  </th>
                  <th className="text-right p-3 hidden md:table-cell">Val/cr</th>
                  <th className="text-center p-3 hidden sm:table-cell">Form</th>
                  <th className="text-center p-3">Status</th>
                  <th className="p-3 w-20"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.player_id} className="border-t border-[#1f2733] hover:bg-[#1a2230] transition-colors">
                    <td className="p-3 font-medium">{p.full_name}</td>
                    <td className="p-3 text-gray-400 hidden sm:table-cell">{teamMap[p.team_id] || "—"}</td>
                    <td className="p-3 text-gray-400">{p.position}</td>
                    <td className="p-3 text-right">
                      <PriceBadge
                        current_price={Number(p.current_price ?? p.fantasy_price ?? 0)}
                        previous_price={p.previous_price}
                        price_change={p.price_change ?? 0}
                        price_trend={p.price_trend ?? "same"}
                        variant="inline"
                      />
                    </td>
                    <td className="p-3 text-right text-gray-300 hidden md:table-cell">
                      {Number(p.season_average_fantasy_points ?? 0).toFixed(1)}
                    </td>
                    <td className="p-3 text-right text-court-orange hidden md:table-cell">
                      {Number(p.value_per_credit ?? 0).toFixed(2)}
                    </td>
                    <td className="p-3 text-center hidden sm:table-cell">
                      {p.form ? <FormBadge form={p.form} variant="icon" /> : <span className="text-gray-600">—</span>}
                    </td>
                    <td className="p-3 text-center">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${p.status === "active" ? "bg-court-green/15 text-court-green" : "bg-gray-700 text-gray-400"}`}>
                        {p.status || "active"}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => openEdit(p)} className="text-court-orange text-xs hover:opacity-80" title="Edit">✏️</button>
                        <button onClick={() => setDeleteId(p.player_id)} className="text-red-400 text-xs hover:opacity-80" title="Delete">🗑</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="px-4 py-2 border-t border-[#1f2733] text-xs text-gray-500">
          {filtered.length} of {players.length} players
        </div>
      </div>
    </div>
  );
}
