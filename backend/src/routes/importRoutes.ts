import express from "express";
import multer from "multer";
import * as cheerio from "cheerio";
import { authenticate, requireAdmin } from "../middleware/auth";
import { getSheetData } from "../services/sheetsService";

const router = express.Router();

router.use(authenticate, requireAdmin);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB is plenty for a stats page HTML export
});

/**
 * Canonical fields we want to extract, mapped to the header keywords we'll
 * look for (case-insensitive substring match) to find the right column.
 * "team_name" is kept here only as a fallback in case a table happens to
 * have its own Team column - the primary source of team name is the
 * nearest preceding header text (see findPrecedingTeamName below), since
 * these exports typically label each team with a heading like
 * "MIGHTY BARROLLE Stats" right before that team's table.
 */
const FIELD_KEYWORDS: Record<string, string[]> = {
  player_name: ["player", "name"],
  team_name: ["team"],
  points: ["pts", "points"],
  rebounds: ["reb", "rebounds"],
  assists: ["ast", "assists"],
  steals: ["stl", "steals"],
  blocks: ["blk", "blocks"],
  turnovers: ["to", "tov", "turnovers"],
  minutes_played: ["min", "minutes"],
};

const NUMERIC_FIELDS = [
  "points",
  "rebounds",
  "assists",
  "steals",
  "blocks",
  "turnovers",
  "minutes_played",
];

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
  match_status: "Matched" | "No Match Found";
}

/**
 * Given a table's header cell texts, figure out which column index maps to
 * each canonical field. Returns null for fields it couldn't confidently find.
 */
function detectColumnMap(headerCells: string[]): Record<string, number | null> {
  const normalized = headerCells.map((h) => h.toLowerCase().trim());
  const map: Record<string, number | null> = {};

  for (const field of Object.keys(FIELD_KEYWORDS)) {
    const keywords = FIELD_KEYWORDS[field];
    let foundIndex: number | null = null;

    for (let i = 0; i < normalized.length; i++) {
      const cell = normalized[i];
      if (keywords.some((kw) => cell === kw || cell.includes(kw))) {
        foundIndex = i;
        break;
      }
    }
    map[field] = foundIndex;
  }

  return map;
}

/**
 * Walks the whole document in source order, keeping track of the most
 * recent "team header" text seen so far, and records that as the team for
 * every <table> encountered. A team header is any element that:
 *  - doesn't itself contain a nested <table> (so we don't pick up a big
 *    wrapping container as if it were a heading), and
 *  - has trimmed text ending in the word "Stats" (case-insensitive),
 *    matching the "MIGHTY BARROLLE Stats" / "KNIGHT REAPERS Stats" pattern.
 *
 * Returns a Map from table DOM node -> team name (with "Stats" stripped).
 */
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

    // Skip containers that themselves wrap a table - we only want to treat
    // small, specific heading-like elements as team headers, not a big div
    // that happens to contain both a heading and the table.
    if ($el.find("table").length > 0) continue;

    const text = $el.text().trim();
    if (text && text.length < 80 && /stats\s*$/i.test(text)) {
      currentTeam = text.replace(/stats\s*$/i, "").trim();
    }
  }

  return tableTeamMap;
}

/**
 * Builds a case-insensitive lookup from a player's full_name to their
 * player_id, so imported names like "ANTHONY S QUADRI" match an existing
 * "Anthony S Quadri" row regardless of casing differences.
 */
function buildPlayerNameLookup(players: any[]): Map<string, string> {
  const lookup = new Map<string, string>();
  for (const p of players) {
    if (p.full_name) {
      lookup.set(String(p.full_name).trim().toLowerCase(), p.player_id);
    }
  }
  return lookup;
}

router.post("/import-stats-preview", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No HTML file was uploaded" });
    }

    const html = req.file.buffer.toString("utf-8");
    const $ = cheerio.load(html);

    // Prefer tables explicitly marked as stats tables; fall back to every
    // <table> on the page if none have that class.
    const statsTables = $("table.stats-table").toArray();
    const tables = statsTables.length > 0 ? statsTables : $("table").toArray();

    if (tables.length === 0) {
      return res.status(400).json({ error: "No <table> found in the uploaded HTML file" });
    }

    const tableTeamMap = mapTablesToTeamNames($);

    // STEP 2: load all players from the Players sheet for matching.
    const allPlayers = await getSheetData("Players");
    const nameLookup = buildPlayerNameLookup(allPlayers);

    const parsedRows: ParsedRow[] = [];
    let tablesParsed = 0;
    const lastColumnMaps: Record<string, number | null>[] = [];

    // STEP 1 / STEP 3: loop through ALL tables, not just the first one.
    for (const table of tables) {
      const $table = $(table);
      const headerRow = $table.find("tr").first();
      const headerCells = headerRow
        .find("th, td")
        .toArray()
        .map((cell) => $(cell).text().trim());

      if (headerCells.length === 0) continue;

      const columnMap = detectColumnMap(headerCells);
      if (columnMap.player_name === null) continue; // skip tables we can't make sense of

      // STEP 2: assign the team name found nearest before this table.
      const teamNameFromHeader = tableTeamMap.get(table) || "";

      const allRows = $table.find("tr").toArray();
      const dataRows = allRows.slice(1); // skip header row

      for (const row of dataRows) {
        const cells = $(row)
          .find("td, th")
          .toArray()
          .map((cell) => $(cell).text().trim());

        if (cells.length === 0) continue;

        const getCell = (field: string): string => {
          const index = columnMap[field];
          if (index === null || index === undefined) return "";
          return cells[index] ?? "";
        };

        const player_name = getCell("player_name");

        // STEP 5: ignore empty rows.
        if (!player_name) continue;

        // STEP 4: ignore totals rows (e.g. "TOTALS", "Total", etc.) -
        // check the player name cell, and as a safety net also check if
        // any cell in the row is exactly "TOTALS" on its own.
        const normalizedName = player_name.trim().toUpperCase();
        const rowHasTotalsCell = cells.some((c) => c.trim().toUpperCase() === "TOTALS");
        if (normalizedName === "TOTALS" || rowHasTotalsCell) continue;

        // Prefer an explicit Team column if the table has one; otherwise
        // use the team name derived from the nearest preceding header.
        const teamFromColumn = getCell("team_name");
        const team_name = teamFromColumn || teamNameFromHeader;

        // STEP 3 / STEP 4: case-insensitive exact match against Players.full_name.
        const matchedPlayerId = nameLookup.get(player_name.trim().toLowerCase()) || null;

        const parsedRow: ParsedRow = {
          player_name,
          team_name,
          points: 0,
          rebounds: 0,
          assists: 0,
          steals: 0,
          blocks: 0,
          turnovers: 0,
          minutes_played: 0,
          matched_player_id: matchedPlayerId,
          match_status: matchedPlayerId ? "Matched" : "No Match Found",
        };

        for (const field of NUMERIC_FIELDS) {
          const raw = getCell(field);
          const num = parseFloat(raw.replace(/[^0-9.\-]/g, ""));
          (parsedRow as any)[field] = isNaN(num) ? 0 : num;
        }

        parsedRows.push(parsedRow);
      }

      tablesParsed++;
      lastColumnMaps.push(columnMap);
    }

    if (tablesParsed === 0) {
      return res.status(400).json({
        error:
          "Could not find any table with a recognizable 'Player' column. Make sure the HTML file has at least one table with a header row.",
      });
    }

    const matchedCount = parsedRows.filter((r) => r.matched_player_id !== null).length;

    res.json({
      total_rows: parsedRows.length,
      matched_count: matchedCount,
      tables_parsed: tablesParsed,
      columns_detected: lastColumnMaps,
      rows: parsedRows,
    });
  } catch (err) {
    console.error("Import stats preview error:", err);
    res.status(500).json({ error: "Failed to parse the uploaded HTML file" });
  }
});

export default router;
