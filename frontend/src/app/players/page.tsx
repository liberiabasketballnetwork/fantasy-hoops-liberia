"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const BUDGET_CAP = 100;

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

  const spent = selected.reduce((sum, id) => {
    const p = players.find((pl) => pl.player_id === id);
    return sum + Number(p?.fantasy_price || 0);
  }, 0);
  const remaining = BUDGET_CAP - spent;

  function toggleSelect(playerId: string) {
    setMessage("");
    const player = players.find((p) => p.player_id === playerId);
    const price = Number(player?.fantasy_price || 0);

    if (selected.includes(playerId)) {
      setSelected(selected.filter((id) => id !== playerId));
      if (captain === playerId) setCaptain("");
    } else {
      if (selected.length >= 5) {
        setMessage("You can only select 5 players. Remove one first.");
        return;
      }
      if (spent + price > BUDGET_CAP) {
        setMessage(
          `Not enough budget left. You have ${remaining} credits remaining and this player costs ${price}.`
        );
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
    if (spent > BUDGET_CAP) {
      setMessage("Your lineup goes over the budget cap. Remove a player first.");
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

      <div className="card p-4 flex items-center justify-between sticky top-16 z-10">
        <div>
          <p className="text-xs text-gray-400">Budget remaining</p>
          <p className={`text-xl font-bold ${remaining < 0 ? "text-red-400" : "text-court-orange"}`}>
            {remaining} / {BUDGET_CAP} credits
          </p>
        </div>
        <div className="w-1/2 h-2 bg-[#1f2733] rounded overflow-hidden">
          <div
            className={`h-full ${spent > BUDGET_CAP ? "bg-red-500" : "bg-court-orange"}`}
            style={{ width: `${Math.min((spent / BUDGET_CAP) * 100, 100)}%` }}
          />
        </div>
      </div>

      {message && <div className="card p-3 text-sm">{message}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        {players.map((p) => {
          const isSelected = selected.includes(p.player_id);
          const isCaptain = captain === p.player_id;
          const price = Number(p.fantasy_price || 0);
          const tooExpensive = !isSelected && price > remaining;
          return (
            <div
              key={p.player_id}
              className={`card p-4 cursor-pointer ${isSelected ? "border-court-orange" : ""} ${
                tooExpensive ? "opacity-50" : ""
              }`}
              onClick={() => toggleSelect(p.player_id)}
            >
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-bold">{p.full_name}</p>
                  <p className="text-xs text-gray-400">{p.position}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="text-xs font-bold text-court-orange">{price} cr</span>
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

