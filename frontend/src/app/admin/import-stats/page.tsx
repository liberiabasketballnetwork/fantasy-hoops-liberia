"use client";

import { useState } from "react";
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
}

export default function ImportStatsPage() {
  const { user, loading } = useRequireAdmin();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [totalRows, setTotalRows] = useState(0);

  async function handleUpload() {
    if (!file) {
      setMessage("Choose an .html file first.");
      return;
    }

    setUploading(true);
    setMessage("");
    setRows([]);
    setTotalRows(0);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await api.post("/admin/import-stats-preview", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      setRows(res.data.rows || []);
      setTotalRows(res.data.total_rows || 0);
      setMessage(`✅ Parsed ${res.data.total_rows} player row${res.data.total_rows === 1 ? "" : "s"} from the file.`);
    } catch (err: any) {
      setMessage(err?.response?.data?.error || "Failed to parse the uploaded file.");
    } finally {
      setUploading(false);
    }
  }

  if (loading || !user) return <p className="text-center text-gray-400">Loading...</p>;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">📄 Import Stats</h1>
      <p className="text-sm text-gray-400 max-w-2xl">
        Upload an HTML stats page (e.g. saved from a league stats website) and this will parse
        out a table of player stats for you to review below. This is a preview only — nothing
        is saved to the database yet.
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

      {rows.length > 0 && (
        <div className="card overflow-hidden">
          <div className="p-4 border-b border-[#1f2733]">
            <h2 className="font-bold">Preview — {totalRows} rows extracted</h2>
            <p className="text-xs text-gray-400">
              Nothing has been saved yet. This is a preview only.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#0b0f14] text-gray-400">
                <tr>
                  <th className="text-left p-3">Player Name</th>
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
