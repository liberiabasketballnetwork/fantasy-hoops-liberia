"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { AppModal, LoadingOverlay } from "@/components/ui";

interface League {
  league_id: string;
  league_name: string;
  description: string;
  invite_code: string;
  owner_user_id: string;
  max_members: number;
  member_count: number;
}

type ModalState =
  | { open: false }
  | { open: true; type: "success" | "error" | "info"; title: string; message: string };

export default function LeaguesPage() {
  const { user, loading: authLoading } = useAuth();
  const [leagues, setLeagues] = useState<League[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [overlay, setOverlay] = useState(false);
  const [modal, setModal] = useState<ModalState>({ open: false });

  // Create form
  const [createName, setCreateName] = useState("");
  const [createDesc, setCreateDesc] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  // Join form
  const [joinCode, setJoinCode] = useState("");
  const [showJoin, setShowJoin] = useState(false);

  // Copied invite code
  const [copiedId, setCopiedId] = useState<string | null>(null);

  function closeModal() { setModal({ open: false }); }

  async function load() {
    try {
      const res = await api.get("/leagues");
      setLeagues(res.data.leagues || []);
    } catch {
      // silently ignore — user may not have leagues yet
    }
  }

  useEffect(() => {
    if (!authLoading && user) load().finally(() => setPageLoading(false));
  }, [user, authLoading]);

  async function handleCreate() {
    if (!createName.trim()) return;
    setOverlay(true);
    try {
      const res = await api.post("/leagues", { league_name: createName, description: createDesc });
      await load();
      setShowCreate(false);
      setCreateName(""); setCreateDesc("");
      setModal({ open: true, type: "success", title: "League Created!", message: `${res.data.message}` });
    } catch (err: any) {
      setModal({ open: true, type: "error", title: "Failed to Create", message: err?.response?.data?.error || "Failed to create league." });
    } finally { setOverlay(false); }
  }

  async function handleJoin() {
    if (!joinCode.trim()) return;
    setOverlay(true);
    try {
      const res = await api.post("/leagues/join", { invite_code: joinCode });
      await load();
      setShowJoin(false);
      setJoinCode("");
      setModal({ open: true, type: "success", title: "Joined!", message: res.data.message });
    } catch (err: any) {
      setModal({ open: true, type: "error", title: "Could Not Join", message: err?.response?.data?.error || "Failed to join league." });
    } finally { setOverlay(false); }
  }

  function copyCode(league: League) {
    navigator.clipboard.writeText(league.invite_code);
    setCopiedId(league.league_id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  if (!authLoading && !user) return (
    <div className="card p-8 text-center">
      <p className="text-gray-400 mb-4">Log in to access leagues.</p>
      <Link href="/login" className="btn-primary">Log in</Link>
    </div>
  );

  if (pageLoading || authLoading) return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <div className="w-10 h-10 rounded-full border-4 border-[#1f2733] border-t-court-orange animate-spin" />
    </div>
  );

  return (
    <div className="flex flex-col gap-5">
      <LoadingOverlay visible={overlay} title="Processing..." message="Please wait." />
      <AppModal open={modal.open} type={modal.open ? modal.type : "info"} title={modal.open ? modal.title : ""} message={modal.open ? modal.message : ""} confirmText="OK" onConfirm={closeModal} />

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">🏆 My Leagues</h1>
          <p className="text-sm text-gray-400">Compete privately with friends.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setShowJoin(true); setShowCreate(false); }} className="px-4 py-2 rounded-lg bg-[#1f2733] text-sm font-semibold hover:bg-[#2a3441]">
            + Join League
          </button>
          <button onClick={() => { setShowCreate(true); setShowJoin(false); }} className="btn-primary text-sm">
            + Create League
          </button>
        </div>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="card p-5 border border-court-orange/40 animate-[fadeIn_0.15s_ease]">
          <h2 className="font-bold mb-3">Create a New League</h2>
          <div className="flex flex-col gap-3">
            <input className="input-field" placeholder="League name (required)" value={createName} onChange={(e) => setCreateName(e.target.value)} maxLength={50} />
            <textarea className="input-field resize-none" placeholder="Description (optional)" rows={2} value={createDesc} onChange={(e) => setCreateDesc(e.target.value)} />
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={() => setShowCreate(false)} className="px-4 py-2 rounded-lg bg-[#1f2733] text-sm">Cancel</button>
            <button onClick={handleCreate} disabled={!createName.trim()} className="btn-primary text-sm">Create League</button>
          </div>
        </div>
      )}

      {/* Join form */}
      {showJoin && (
        <div className="card p-5 border border-blue-500/40 animate-[fadeIn_0.15s_ease]">
          <h2 className="font-bold mb-3">Join a League</h2>
          <div className="flex gap-3">
            <input
              className="input-field flex-1 uppercase tracking-widest font-mono"
              placeholder="LBN-XXXXXX"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              maxLength={10}
            />
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={() => setShowJoin(false)} className="px-4 py-2 rounded-lg bg-[#1f2733] text-sm">Cancel</button>
            <button onClick={handleJoin} disabled={!joinCode.trim()} className="btn-primary text-sm">Join League</button>
          </div>
        </div>
      )}

      {/* My leagues */}
      {leagues.length === 0 ? (
        <div className="card p-10 text-center flex flex-col items-center gap-4">
          <span className="text-4xl">🏆</span>
          <p className="font-bold">No Leagues Yet</p>
          <p className="text-sm text-gray-400 max-w-sm">
            Create your first league or join one using an invite code.
          </p>
          <div className="flex gap-3">
            <button onClick={() => setShowJoin(true)} className="px-4 py-2 rounded-lg bg-[#1f2733] text-sm font-semibold">Join with Code</button>
            <button onClick={() => setShowCreate(true)} className="btn-primary text-sm">Create League</button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {leagues.map((league) => (
            <div key={league.league_id} className="card p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <p className="font-bold text-base">{league.league_name}</p>
                  {league.owner_user_id === user?.user_id && (
                    <span className="text-xs bg-court-orange/15 text-court-orange px-2 py-0.5 rounded-full">Owner</span>
                  )}
                </div>
                {league.description && <p className="text-xs text-gray-400">{league.description}</p>}
                <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                  <span>👥 {league.member_count} / {league.max_members} members</span>
                  <div className="flex items-center gap-1">
                    <span className="font-mono text-gray-300">{league.invite_code}</span>
                    <button
                      onClick={() => copyCode(league)}
                      className="text-court-orange hover:opacity-80 ml-1"
                      title="Copy invite code"
                    >
                      {copiedId === league.league_id ? "✓" : "📋"}
                    </button>
                  </div>
                </div>
              </div>
              <Link href={`/leagues/${league.league_id}`} className="btn-primary text-sm flex-shrink-0">
                Open League →
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
