import express from "express";
import multer from "multer";
import * as cheerio from "cheerio";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { authenticate, requireAdmin, AuthRequest } from "../middleware/auth";
import { getSheetData, updateRow, appendRow } from "../services/sheetsService";
import { logAdminAction } from "../services/adminActionLogger";

const router = express.Router();
router.use(authenticate, requireAdmin);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const FIELD_KEYWORDS: Record<string, string[]> = {
  player_name: ["player", "name"],
  team_name: ["team"],
  points: ["pts", "points"],
  rebounds: ["reb", "rebounds"],
  assists: ["a", "ast", "assists"],
  steals: ["s", "stl", "steals"],
  blocks: ["b", "blk", "blocks"],
  turnovers: ["to", "tov", "turnovers"],
  minutes_played: ["min", "minutes"],
};
const NUMERIC_FIELDS = ["points","rebounds","assists","steals","blocks","turnovers","minutes_played"];

interface ParsedRow {
  player_name: string; team_name: string;
  points: number; rebounds: number; assists: number; steals: number; blocks: number; turnovers: number; minutes_played: number;
  matched_player_id: string | null;
  match_status: "Matched" | "Manual Match Required";
}

function detectColumnMap(headerCells: string[]): Record<string, number | null> {
  const normalized = headerCells.map((h) => h.toLowerCase().trim());
  const map: Record<string, number | null> = {};
  for (const field of Object.keys(FIELD_KEYWORDS)) {
    const keywords = FIELD_KEYWORDS[field];
    let foundIndex: number | null = null;
    for (let i = 0; i < normalized.length; i++) {
      const cell = normalized[i];
      const isMatch = keywords.some((kw) => kw.length <= 3 ? cell === kw : cell === kw || cell.includes(kw));
      if (isMatch) { foundIndex = i; break; }
    }
    map[field] = foundIndex;
  }
  return map;
}

function mapTablesToTeamNames($: cheerio.CheerioAPI): Map<any, string> {
  const tableTeamMap = new Map<any, string>();
  const allElements = $("*").toArray();
  let currentTeam = "";
  for (const el of allElements) {
    const $el = $(el);
    if ((el as any).tagName && (el as any).tagName.toLowerCase() === "table") {
      tableTeamMap.set(el, currentTeam);
      continue;
    }
    if ($el.find("table").length > 0) continue;
    const text = $el.text().trim();
    if (text && text.length < 80 && /stats\s*$/i.test(text)) currentTeam = text.replace(/stats\s*$/i, "").trim();
  }
  return tableTeamMap;
}

function buildPlayerNameLookup(players: any[]): Map<string, string> {
  const lookup = new Map<string, string>();
  for (const p of players) { if (p.full_name) lookup.set(String(p.full_name).trim().toLowerCase(), p.player_id); }
  return lookup;
}

function buildAliasLookup(players: any[]): Map<string, string> {
  const lookup = new Map<string, string>();
  for (const p of players) {
    if (p.import_alias) {
      for (const alias of String(p.import_alias).split("|")) { const t = alias.trim().toLowerCase(); if (t) lookup.set(t, p.player_id); }
    }
  }
  return lookup;
}

function normalizeTeamName(name: string): string { return name.trim().replace(/\s+/g, " ").toLowerCase(); }

function resolveTeamNameFromRaw(raw: string, knownTeamNames: string[]): string {
  const normalizedRaw = raw.replace(/\s+/g, " ").trim().toLowerCase();
  let bestMatch: string | null = null;
  for (const teamName of knownTeamNames) {
    const normalizedTeam = teamName.replace(/\s+/g, " ").trim().toLowerCase();
    if (!normalizedTeam) continue;
    if (normalizedRaw === normalizedTeam) { bestMatch = normalizedTeam; break; }
    if (normalizedRaw.endsWith(normalizedTeam)) { if (!bestMatch || normalizedTeam.length > bestMatch.length) bestMatch = normalizedTeam; }
  }
  if (bestMatch) { const original = knownTeamNames.find((t) => t.replace(/\s+/g, " ").trim().toLowerCase() === bestMatch); return original || raw.trim(); }
  return raw.replace(/\s+/g, " ").trim();
}

function parseGameInfoFromFilename(filename: string, knownTeamNames: string[]) {
  const base = filename.replace(/\.[a-z0-9]+$/i, "");
  const dateMatch = base.match(/(\d{4})(\d{2})(\d{2})/);
  const game_date = dateMatch ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}` : null;
  const withoutDate = dateMatch ? base.replace(dateMatch[0], "") : base;
  const vsMatch = withoutDate.split(/_vs_/i);
  if (vsMatch.length !== 2) return { home_team: null, away_team: null, game_date };
  const homeRaw = vsMatch[0].replace(/_/g, " ");
  const awayRaw = vsMatch[1].replace(/_/g, " ");
  return { home_team: resolveTeamNameFromRaw(homeRaw, knownTeamNames) || null, away_team: resolveTeamNameFromRaw(awayRaw, knownTeamNames) || null, game_date };
}

function calculateImportFantasyScore(stat: { points: number; rebounds: number; assists: number; steals: number; blocks: number; turnovers: number }): number {
  const base = stat.points * 1 + stat.rebounds * 1.2 + stat.assists * 1.5 + stat.steals * 3 + stat.blocks * 3 - stat.turnovers * 1;
  const categoriesInDoubleDigits = [stat.points, stat.rebounds, stat.assists, stat.steals, stat.blocks].filter((v) => v >= 10).length;
  let bonus = 0;
  if (categoriesInDoubleDigits >= 3) bonus = 5;
  else if (categoriesInDoubleDigits >= 2) bonus = 3;
  return base + bonus;
}

router.post("/import-stats-preview", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No HTML file was uploaded" });
    const html = req.file.buffer.toString("utf-8");
    const $ = cheerio.load(html);
    const statsTables = $("table.stats-table").toArray();
    const tables = statsTables.length > 0 ? statsTables : $("table").toArray();
    if (tables.length === 0) return res.status(400).json({ error: "No <table> found in the uploaded HTML file" });
    const tableTeamMap = mapTablesToTeamNames($);
    const allPlayers = await getSheetData("Players");
    const nameLookup = buildPlayerNameLookup(allPlayers);
    const aliasLookup = buildAliasLookup(allPlayers);
    const parsedRows: ParsedRow[] = [];
    let tablesParsed = 0;
    const lastColumnMaps: Record<string, number | null>[] = [];
    for (const table of tables) {
      const $table = $(table);
      const headerRow = $table.find("tr").first();
      const headerCells = headerRow.find("th, td").toArray().map((cell) => $(cell).text().trim());
      if (headerCells.length === 0) continue;
      const columnMap = detectColumnMap(headerCells);
      if (columnMap.player_name === null) continue;
      const teamNameFromHeader = tableTeamMap.get(table) || "";
      const dataRows = $table.find("tr").toArray().slice(1);
      for (const row of dataRows) {
        const cells = $(row).find("td, th").toArray().map((cell) => $(cell).text().trim());
        if (cells.length === 0) continue;
        const getCell = (field: string): string => { const index = columnMap[field]; if (index === null || index === undefined) return ""; return cells[index] ?? ""; };
        const player_name = getCell("player_name");
        if (!player_name) continue;
        const normalizedName = player_name.trim().toUpperCase();
        const rowHasTotalsCell = cells.some((c) => c.trim().toUpperCase() === "TOTALS");
        if (normalizedName === "TOTALS" || rowHasTotalsCell) continue;
        const teamFromColumn = getCell("team_name");
        const team_name = teamFromColumn || teamNameFromHeader;
        const normalizedImportedName = player_name.trim().toLowerCase();
        let matchedPlayerId = nameLookup.get(normalizedImportedName) || null;
        if (!matchedPlayerId) matchedPlayerId = aliasLookup.get(normalizedImportedName) || null;
        const parsedRow: ParsedRow = { player_name, team_name, points: 0, rebounds: 0, assists: 0, steals: 0, blocks: 0, turnovers: 0, minutes_played: 0, matched_player_id: matchedPlayerId, match_status: matchedPlayerId ? "Matched" : "Manual Match Required" };
        for (const field of NUMERIC_FIELDS) { const raw = getCell(field); const num = parseFloat(raw.replace(/[^0-9.\-]/g, "")); (parsedRow as any)[field] = isNaN(num) ? 0 : num; }
        parsedRows.push(parsedRow);
      }
      tablesParsed++;
      lastColumnMaps.push(columnMap);
    }
    if (tablesParsed === 0) return res.status(400).json({ error: "Could not find any table with a recognizable Player column." });
    const matchedCount = parsedRows.filter((r) => r.matched_player_id !== null).length;
    res.json({ total_rows: parsedRows.length, matched_count: matchedCount, tables_parsed: tablesParsed, columns_detected: lastColumnMaps, rows: parsedRows });
  } catch (err) {
    console.error("Import stats preview error:", err);
    res.status(500).json({ error: "Failed to parse the uploaded HTML file" });
  }
});

const confirmMatchSchema = z.object({ player_name: z.string().min(1), player_id: z.string().min(1) });

router.post("/confirm-match", async (req, res) => {
  try {
    const { player_name, player_id } = confirmMatchSchema.parse(req.body);
    const players = await getSheetData("Players");
    const player = players.find((p) => p.player_id === player_id);
    if (!player) return res.status(404).json({ error: "Selected player not found" });
    const existingAliases = player.import_alias ? String(player.import_alias).split("|").map((a) => a.trim()).filter(Boolean) : [];
    const alreadySaved = existingAliases.some((a) => a.toLowerCase() === player_name.trim().toLowerCase());
    const updatedAliases = alreadySaved ? existingAliases : [...existingAliases, player_name.trim()];
    const updated = await updateRow("Players", "player_id", player_id, { import_alias: updatedAliases.join("|") });
    res.json({ message: "Alias saved", player: updated });
  } catch (err: any) {
    if (err.name === "ZodError") return res.status(400).json({ error: "Invalid input", details: err.errors });
    res.status(500).json({ error: "Failed to save manual match" });
  }
});

const saveStatsSchema = z.object({
  filename: z.string().min(1),
  rows: z.array(z.object({ player_id: z.string().min(1), points: z.number().default(0), rebounds: z.number().default(0), assists: z.number().default(0), steals: z.number().default(0), blocks: z.number().default(0), turnovers: z.number().default(0), minutes_played: z.number().default(0) })).min(1),
});

router.post("/import-stats-save", async (req: AuthRequest, res) => {
  try {
    const { filename, rows } = saveStatsSchema.parse(req.body);
    if (rows.some((r) => !r.player_id)) return res.status(400).json({ error: "Not all players are matched. 100% matching is required before saving." });

    const [teams, gamesForNames] = await Promise.all([getSheetData("Teams"), getSheetData("Games")]);
    const teamNamesFromTeamsSheet = teams.map((t) => String(t.team_name)).filter(Boolean);
    const teamNamesFromGamesSheet = [...gamesForNames.map((g) => String(g.home_team)), ...gamesForNames.map((g) => String(g.away_team))].filter(Boolean);
    const seenNormalized = new Set(teamNamesFromTeamsSheet.map((n) => n.trim().toLowerCase()));
    const extraFromGames = teamNamesFromGamesSheet.filter((n) => !seenNormalized.has(n.trim().toLowerCase()));
    const knownTeamNames = [...teamNamesFromTeamsSheet, ...extraFromGames];
    const { home_team, away_team, game_date } = parseGameInfoFromFilename(filename, knownTeamNames);

    if (!home_team || !away_team || !game_date) return res.status(400).json({ error: "Could not determine the game from the filename. Expected format: HOME_TEAM_vs_AWAY_TEAM_YYYYMMDD.html" });

    const matchingGame = gamesForNames.find((g) => {
      const gameDate = String(g.game_date).slice(0, 10);
      return normalizeTeamName(String(g.home_team)) === normalizeTeamName(home_team) && normalizeTeamName(String(g.away_team)) === normalizeTeamName(away_team) && gameDate === game_date;
    });
    if (!matchingGame) return res.status(404).json({ error: `No matching game found for ${home_team} vs ${away_team} on ${game_date}. Add this game first in the admin panel.` });

    const game_id = matchingGame.game_id;
    const importLog = await getSheetData("Import_Log");
    const alreadyImported = importLog.some((entry) => String(entry.status).toLowerCase() === "success" && (String(entry.game_id) === String(game_id) || normalizeTeamName(String(entry.file_name)) === normalizeTeamName(filename)));
    if (alreadyImported) return res.status(409).json({ error: "This game has already been imported." });

    for (const row of rows) {
      const fantasy_points = calculateImportFantasyScore(row);
      await appendRow("Player_Stats", { stat_id: uuidv4(), game_id, player_id: row.player_id, points: row.points, rebounds: row.rebounds, assists: row.assists, steals: row.steals, blocks: row.blocks, turnovers: row.turnovers, minutes_played: row.minutes_played, fantasy_points: fantasy_points.toFixed(2) });
    }

    const allPlayers = await getSheetData("Players");
    for (const row of rows) {
      const player = allPlayers.find((p) => p.player_id === row.player_id);
      if (!player) continue;
      const previousGamesPlayed = Number(player.games_played || 0);
      const newGamesPlayed = previousGamesPlayed + 1;
      const runningAverage = (previousAverage: any, newValue: number) => ((Number(previousAverage || 0) * previousGamesPlayed + newValue) / newGamesPlayed).toFixed(2);
      await updateRow("Players", "player_id", row.player_id, { games_played: newGamesPlayed, average_points: runningAverage(player.average_points, row.points), average_rebounds: runningAverage(player.average_rebounds, row.rebounds), average_assists: runningAverage(player.average_assists, row.assists) });
    }

    await updateRow("Games", "game_id", game_id, { status: "completed" });
    await appendRow("Import_Log", { import_id: uuidv4(), file_name: filename, game_id, imported_at: new Date().toISOString(), status: "success" });

    await logAdminAction({ admin_id: req.user?.user_id || "admin", action_type: "IMPORT_STATS", entity_type: "GAME", entity_id: game_id, details: `Imported stats successfully for ${filename} (${rows.length} players)`, status: "success" });

    res.json({ message: `Successfully saved ${rows.length} player stats.`, game_id, saved_count: rows.length });
  } catch (err: any) {
    if (err.name === "ZodError") return res.status(400).json({ error: "Invalid input", details: err.errors });
    console.error("Import stats save error:", err);
    res.status(500).json({ error: "Failed to save player stats" });
  }
});

const quickAddPlayerSchema = z.object({ full_name: z.string().min(1), team_id: z.string().min(1), position: z.enum(["PG","SG","SF","PF","C"]), fantasy_price: z.number().optional().default(6), status: z.string().optional().default("active"), import_alias: z.string().min(1) });

router.post("/quick-add-player", async (req, res) => {
  try {
    const data = quickAddPlayerSchema.parse(req.body);
    const player_id = uuidv4();
    const player = { player_id, full_name: data.full_name, team_id: data.team_id, position: data.position, fantasy_price: data.fantasy_price, status: data.status, games_played: 0, average_points: 0, average_rebounds: 0, average_assists: 0, photo_url: "", import_alias: data.import_alias.trim(), source: "import", created_at: new Date().toISOString() };
    await appendRow("Players", player);
    res.status(201).json({ message: "Player created", player });
  } catch (err: any) {
    if (err.name === "ZodError") return res.status(400).json({ error: "Invalid input", details: err.errors });
    res.status(500).json({ error: "Failed to create player" });
  }
});

export default router;
