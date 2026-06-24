"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

export default function PlayersPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [players, setPlayers] = useState<any[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [captain, setCaptain] = useState<string>("");
  const [weekId, setWeekId] = useState<string>("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const playersRes = await api.get("/players");
        setPlayers(playersRes.data.players || []);

        const lbRes = await api.get("/leaderboard");
        if (lbRes.data.week) setWeekId(lbRes.data.week.week_id);
      } catch (e) {
        console.error(e);
      }
    }
    load();
  }, []);

  function toggleSelect(playerId: string) {
    setMessage("");
    if (selected.includes(playerId)) {
      setSelected(selected.filter((id) => id !== playerId));
      if (captain === playerId) setCaptain("");
    } else {
      if (selected.length >= 5) {
        setMessage("You can only select 5 players. Remove one first.");
        return;
      }
      setSelected([...selected, playerId]);
    }
  }

  async function submitLineup() {
    if (!user) {
      router.push("/login");
      return;
    }
    if (selected.length !== 5) {
      setMessage("Select exactly 5 players before submitting.");
      return;
    }
    if (!captain) {
      setMessage("Choose a captain from your selected players.");
      return;
    }
    if (!weekId) {
      setMessage("There's no active gameweek right now.");
      return;
    }

    setSubmitting(true);
    setMessage("");
    try {
      await api.post("/submit-lineup", {
        week_id: weekId,
        player_ids: selected,
        captain_player_id: captain,
      });
      setMessage("✅ Lineup submitted successfully!");
    } catch (err: any) {
      setMessage(err?.response?.data?.error || "Failed to submit lineup.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold">Pick Your 5</h1>
        <p className="text-sm text-gray-400">
          Selected: {selected.length}/5 {captain && `· Captain selected`}
        </p>
      </div>

      {message && <div className="card p-3 text-sm">{message}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        {players.map((p) => {
          const isSelected = selected.includes(p.player_id);
          const isCaptain = captain === p.player_id;
          return (
            <div
              key={p.player_id}
              className={`card p-4 cursor-pointer ${isSelected ? "border-court-orange" : ""}`}
              onClick={() => toggleSelect(p.player_id)}
            >
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-bold">{p.full_name}</p>
                  <p className="text-xs text-gray-400">{p.position}</p>
                </div>
                {isSelected && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setCaptain(p.player_id);
                    }}
                    className={`text-xs px-2 py-1 rounded ${
                      isCaptain ? "bg-court-orange" : "bg-[#1f2733]"
                    }`}
                  >
                    {isCaptain ? "★ Captain" : "Make Captain"}
                  </button>
                )}
              </div>
              <div className="flex gap-3 mt-3 text-xs text-gray-400">
                <span>PPG {p.average_points || 0}</span>
                <span>RPG {p.average_rebounds || 0}</span>
                <span>APG {p.average_assists || 0}</span>
              </div>
            </div>
          );
        })}
        {players.length === 0 && (
          <p className="text-gray-500 text-sm">No players available yet. Check back soon.</p>
        )}
      </div>

      <button onClick={submitLineup} disabled={submitting} className="btn-primary w-fit">
        {submitting ? "Submitting..." : "Submit Lineup"}
      </button>
    </div>
  );
}
