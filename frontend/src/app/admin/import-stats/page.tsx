"use client";

import { Fragment, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useRequireAdmin } from "@/hooks/useRequireAdmin";

interface ParsedRow {
  player_name: string;
  team_name: string;
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  minutes_played: number;
  matched_player_id: string | null;
  match_status: "Matched" | "Manual Match Required";
}

interface NewPlayerForm {
  full_name: string;
  team_id: string;
  position: string;
  fantasy_price: number;
  status: string;
}

const POSITIONS = ["PG", "SG", "SF", "PF", "C"];

export default function ImportStatsPage() {
  const { user, loading } = useRequireAdmin();
  const [file, setFile] = useState<File | null>(null);
  const [uploadedFilename, setUploadedFilename] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{ success: boolean; text: string } | null>(null);
  const [message, setMessage] = useState("");
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [matchedCount, setMatchedCount] = useState(0);
  const [allPlayers, setAllPlayers] = useState<any[]>([]);
  const [allTeams, setAllTeams] = useState<any[]>([]);
  const [manualSelections, setManualSelections] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState<string | null>(null);
  const [confirmedNames, setConfirmedNames] = useState<Set<string>>(new Set());

  // Tracks which row's "Add New Player" quick form is currently open, and
  // its in-progress field values, keyed by the imported player name.
  const [openNewPlayerFor, setOpenNewPlayerFor] = useState<string | null>(null);
  const [newPlayerForms, setNewPlayerForms] = useState<Record<string, NewPlayerForm>>({});
  const [creatingPlayer, setCreatingPlayer] = useState<string | null>(null);

  useEffect(() => {
    api.get("/players").then((res) => setAllPlayers(res.data.players || []));
    api.get("/teams").then((res) => setAllTeams(res.data.teams || []));
  }, []);

  async function handleUpload() {
    if (!file) {
      setMessage("Choose an .html file first.");
      return;
    }

    setUploading(true);
    setMessage("");
    setSaveResult(null);
    setRows([]);
    setTotalRows(0);
    setMatchedCount(0);
    setManualSelections({});
    setConfirmedNames(new Set());
    setOpenNewPlayerFor(null);
    setNewPlayerForms({});

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await api.post("/admin/import-stats-preview", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      setRows(res.data.rows || []);
      setTotalRows(res.data.total_rows || 0);
      setMatchedCount(res.data.matched_count || 0);
      setUploadedFilename(file.name);
      const tablesParsed = res.data.tables_parsed || 1;
      setMessage(
        `✅ Parsed ${res.data.total_rows} player row${res.data.total_rows === 1 ? "" : "s"} from ${tablesParsed} team table${tablesParsed === 1 ? "" : "s"}.`
      );
    } catch (err: any) {
      setMessage(err?.response?.data?.error || "Failed to parse the uploaded file.");
    } finally {
      setUploading(false);
    }
  }

  async function confirmManualMatch(playerName: string) {
    const selectedPlayerId = manualSelections[playerName];
    if (!selectedPlayerId) return;

    setConfirming(playerName);
    try {
      await api.post("/admin/confirm-match", {
        player_name: playerName,
        player_id: selectedPlayerId,
      });

      // Reflect the confirmed match immediately in the preview table and
      // success counter, without requiring a re-upload.
      setRows((prev) =>
        prev.map((r) =>
          r.player_name === playerName
            ? { ...r, matched_player_id: selectedPlayerId, match_status: "Matched" }
            : r
        )
      );
      setMatchedCount((prev) => prev + 1);
      setConfirmedNames((prev) => new Set(prev).add(playerName));
    } catch (err: any) {
      setMessage(err?.response?.data?.error || "Failed to save manual match.");
    } finally {
      setConfirming(null);
    }
  }

  function openAddNewPlayerForm(row: ParsedRow) {
    setOpenNewPlayerFor(row.player_name);
    if (!newPlayerForms[row.player_name]) {
      // Pre-fill with the imported name and team, as required.
      const matchingTeam = allTeams.find(
        (t) => t.team_name.trim().toLowerCase() === row.team_name.trim().toLowerCase()
      );
      setNewPlayerForms((prev) => ({
        ...prev,
        [row.player_name]: {
          full_name: row.player_name,
          team_id: matchingTeam?.team_id || "",
          position: "PG",
          fantasy_price: 6,
          status: "active",
        },
      }));
    }
  }

  function updateNewPlayerForm(playerName: string, updates: Partial<NewPlayerForm>) {
    setNewPlayerForms((prev) => ({
      ...prev,
      [playerName]: { ...prev[playerName], ...updates },
    }));
  }

  async function createNewPlayer(playerName: string) {
    const form = newPlayerForms[playerName];
    if (!form || !form.full_name || !form.team_id || !form.position) {
      setMessage("Please fill in name, team, and position before creating the player.");
      return;
    }

    setCreatingPlayer(playerName);
    try {
      const res = await api.post("/admin/quick-add-player", {
        full_name: form.full_name,
        team_id: form.team_id,
        position: form.position,
        fantasy_price: Number(form.fantasy_price),
        status: form.status,
        import_alias: playerName,
      });

      const newPlayer = res.data.player;

      // STEP 6/7: mark this row as matched immediately and bump the counter,
      // same as a manual confirm.
      setRows((prev) =>
        prev.map((r) =>
          r.player_name === playerName
            ? { ...r, matched_player_id: newPlayer.player_id, match_status: "Matched" }
            : r
        )
      );
      setMatchedCount((prev) => prev + 1);
      setConfirmedNames((prev) => new Set(prev).add(playerName));
      setAllPlayers((prev) => [...prev, newPlayer]);
      setOpenNewPlayerFor(null);
    } catch (err: any) {
      setMessage(err?.response?.data?.error || "Failed to create new player.");
    } finally {
      setCreatingPlayer(null);
    }
  }

  const needsManualReview = rows.filter(
    (r) => r.match_status === "Manual Match Required" && !confirmedNames.has(r.player_name)
  );

  const fullyMatched = rows.length > 0 && matchedCount === totalRows && needsManualReview.length === 0;

  async function saveStats() {
    if (!fullyMatched) return;

    setSaving(true);
    setSaveResult(null);
    try {
      const res = await api.post("/admin/import-stats-save", {
        filename: uploadedFilename,
        rows: rows.map((r) => ({
          player_id: r.matched_player_id,
          points: r.points,
          rebounds: r.rebounds,
          assists: r.assists,
          steals: r.steals,
          blocks: r.blocks,
          turnovers: r.turnovers,
          minutes_played: r.minutes_played,
        })),
      });
      setSaveResult({ success: true, text: `✅ ${res.data.message}` });
    } catch (err: any) {
      setSaveResult({
        success: false,
        text: err?.response?.data?.error || "Failed to save player stats.",
      });
    } finally {
      setSaving(false);
    }
  }

  if (loading || !user) return <p className="text-center text-gray-400">Loading...</p>;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">📄 Import Stats</h1>
      <p className="text-sm text-gray-400 max-w-2xl">
        Upload an HTML stats page (e.g. saved from a league stats website) and this will parse
        out a table of player stats and match each name against your existing Players sheet.
        This is a preview only — nothing is saved to the database yet.
      </p>

      <div className="card p-5">
        <h2 className="font-bold mb-3">Upload HTML File</h2>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="file"
            accept=".html,.htm,text/html"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="input-field w-auto"
          />
          <button onClick={handleUpload} disabled={uploading} className="btn-primary">
            {uploading ? "Parsing..." : "Upload & Parse"}
          </button>
        </div>
        {message && <p className="text-sm mt-3">{message}</p>}
      </div>

      {needsManualReview.length > 0 && (
        <div className="card p-5 border-2 border-court-orange">
          <h2 className="font-bold mb-1">🔍 Manual Review Required</h2>
          <p className="text-xs text-gray-400 mb-4">
            These imported names couldn&apos;t be matched automatically. Either pick the correct
            existing player, or — if the player genuinely isn&apos;t in your Players sheet yet —
            add them as a new player.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#0b0f14] text-gray-400">
                <tr>
                  <th className="text-left p-3">Imported Name</th>
                  <th className="text-left p-3">Select Player</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {needsManualReview.map((row) => (
                  <Fragment key={row.player_name}>
                    <tr key={row.player_name} className="border-t border-[#1f2733]">
                      <td className="p-3">{row.player_name}</td>
                      <td className="p-3">
                        <select
                          className="input-field"
                          value={manualSelections[row.player_name] || ""}
                          onChange={(e) =>
                            setManualSelections({ ...manualSelections, [row.player_name]: e.target.value })
                          }
                        >
                          <option value="">Select a player...</option>
                          {allPlayers.map((p) => (
                            <option key={p.player_id} value={p.player_id}>
                              {p.full_name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => confirmManualMatch(row.player_name)}
                            disabled={!manualSelections[row.player_name] || confirming === row.player_name}
                            className="btn-primary text-xs"
                          >
                            {confirming === row.player_name ? "Saving..." : "Confirm"}
                          </button>
                          <button
                            onClick={() =>
                              openNewPlayerFor === row.player_name
                                ? setOpenNewPlayerFor(null)
                                : openAddNewPlayerForm(row)
                            }
                            className="px-3 py-1 rounded bg-[#1f2733] text-xs font-semibold"
                          >
                            {openNewPlayerFor === row.player_name ? "Cancel" : "Add New Player"}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {openNewPlayerFor === row.player_name && newPlayerForms[row.player_name] && (
                      <tr className="border-t border-[#1f2733] bg-[#0b0f14]">
                        <td colSpan={3} className="p-4">
                          <p className="text-xs text-gray-400 mb-3">
                            Quick-add &quot;{row.player_name}&quot; as a brand new player. The imported
                            name will automatically be saved as their alias.
                          </p>
                          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                            <input
                              className="input-field"
                              placeholder="Full name"
                              value={newPlayerForms[row.player_name].full_name}
                              onChange={(e) =>
                                updateNewPlayerForm(row.player_name, { full_name: e.target.value })
                              }
                            />
                            <select
                              className="input-field"
                              value={newPlayerForms[row.player_name].team_id}
                              onChange={(e) =>
                                updateNewPlayerForm(row.player_name, { team_id: e.target.value })
                              }
                            >
                              <option value="">Select team</option>
                              {allTeams.map((t) => (
                                <option key={t.team_id} value={t.team_id}>
                                  {t.team_name}
                                </option>
                              ))}
                            </select>
                            <select
                              className="input-field"
                              value={newPlayerForms[row.player_name].position}
                              onChange={(e) =>
                                updateNewPlayerForm(row.player_name, { position: e.target.value })
                              }
                            >
                              {POSITIONS.map((p) => (
                                <option key={p} value={p}>
                                  {p}
                                </option>
                              ))}
                            </select>
                            <input
                              type="number"
                              className="input-field"
                              placeholder="Fantasy price"
                              value={newPlayerForms[row.player_name].fantasy_price}
                              onChange={(e) =>
                                updateNewPlayerForm(row.player_name, {
                                  fantasy_price: Number(e.target.value),
                                })
                              }
                            />
                          </div>
                          <div className="flex items-center justify-between mt-3">
                            <span className="text-xs text-gray-400">Status: active</span>
                            <button
                              onClick={() => createNewPlayer(row.player_name)}
                              disabled={creatingPlayer === row.player_name}
                              className="btn-primary text-xs"
                            >
                              {creatingPlayer === row.player_name ? "Creating..." : "Create Player & Match"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {rows.length > 0 && (
        <div className="card overflow-hidden">
          <div className="p-4 border-b border-[#1f2733] flex items-center justify-between flex-wrap gap-2">
            <div>
              <h2 className="font-bold">Preview — {totalRows} rows extracted</h2>
              <p className="text-xs text-gray-400">
                {fullyMatched
                  ? "All players matched. Ready to save."
                  : "Nothing has been saved yet. This is a preview only."}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span
                className={`px-3 py-1 rounded-lg text-sm font-semibold ${
                  matchedCount === totalRows ? "bg-court-green" : "bg-court-orange"
                }`}
              >
                {matchedCount} of {totalRows} players matched successfully
              </span>
              <button
                onClick={saveStats}
                disabled={!fullyMatched || saving}
                className="btn-primary text-sm"
              >
                {saving ? "Saving..." : "Save Stats"}
              </button>
            </div>
          </div>
          {saveResult && (
            <div className={`p-3 text-sm ${saveResult.success ? "text-court-green" : "text-red-400"}`}>
              {saveResult.text}
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#0b0f14] text-gray-400">
                <tr>
                  <th className="text-left p-3">Player Name</th>
                  <th className="text-left p-3">Matched Player ID</th>
                  <th className="text-left p-3">Team</th>
                  <th className="text-right p-3">PTS</th>
                  <th className="text-right p-3">REB</th>
                  <th className="text-right p-3">AST</th>
                  <th className="text-right p-3">STL</th>
                  <th className="text-right p-3">BLK</th>
                  <th className="text-right p-3">TO</th>
                  <th className="text-right p-3">MIN</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i} className="border-t border-[#1f2733]">
                    <td className="p-3">{row.player_name}</td>
                    <td className="p-3">
                      {row.matched_player_id ? (
                        <span className="text-xs text-gray-400">{row.matched_player_id}</span>
                      ) : (
                        <span className="text-xs font-semibold text-court-orange">
                          Manual Match Required
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-gray-400">{row.team_name || "—"}</td>
                    <td className="p-3 text-right">{row.points}</td>
                    <td className="p-3 text-right">{row.rebounds}</td>
                    <td className="p-3 text-right">{row.assists}</td>
                    <td className="p-3 text-right">{row.steals}</td>
                    <td className="p-3 text-right">{row.blocks}</td>
                    <td className="p-3 text-right">{row.turnovers}</td>
                    <td className="p-3 text-right">{row.minutes_played}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
