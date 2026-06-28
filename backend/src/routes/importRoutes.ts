import express from "express";
import multer from "multer";
import * as cheerio from "cheerio";
import { authenticate, requireAdmin } from "../middleware/auth";

const router = express.Router();

router.use(authenticate, requireAdmin);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB is plenty for a stats page HTML export
});

/**
 * Canonical fields we want to extract, mapped to the header keywords we'll
 * look for (case-insensitive substring match) to find the right column.
 * Order matters only for keyword priority within a single field, not output.
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
 * Scores how "usable" a detected column map is - more matched fields and a
 * found player_name column ranks higher, used to pick the best table on the
 * page when there are several (e.g. a stats page with multiple tables).
 */
function scoreColumnMap(map: Record<string, number | null>): number {
  if (map.player_name === null) return -1; // unusable without a player name column
  return Object.values(map).filter((v) => v !== null).length;
}

router.post("/import-stats-preview", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No HTML file was uploaded" });
    }

    const html = req.file.buffer.toString("utf-8");
    const $ = cheerio.load(html);

    const tables = $("table").toArray();
    if (tables.length === 0) {
      return res.status(400).json({ error: "No <table> found in the uploaded HTML file" });
    }

    let bestColumnMap: Record<string, number | null> | null = null;
    let bestScore = -1;
    let bestTable: any = null;

    for (const table of tables) {
      const $table = $(table);
      const headerRow = $table.find("tr").first();
      const headerCells = headerRow
        .find("th, td")
        .toArray()
        .map((cell) => $(cell).text().trim());

      if (headerCells.length === 0) continue;

      const map = detectColumnMap(headerCells);
      const score = scoreColumnMap(map);

      if (score > bestScore) {
        bestScore = score;
        bestColumnMap = map;
        bestTable = table;
      }
    }

    if (!bestTable || !bestColumnMap || bestColumnMap.player_name === null) {
      return res.status(400).json({
        error:
          "Could not find a table with a recognizable 'Player' column. Make sure the HTML file has a table with a header row.",
      });
    }

    const $table = $(bestTable);
    const allRows = $table.find("tr").toArray();
    const dataRows = allRows.slice(1); // skip header row

    const parsedRows: ParsedRow[] = [];

    for (const row of dataRows) {
      const cells = $(row)
        .find("td, th")
        .toArray()
        .map((cell) => $(cell).text().trim());

      if (cells.length === 0) continue;

      const getCell = (field: string): string => {
        const index = bestColumnMap![field];
        if (index === null || index === undefined) return "";
        return cells[index] ?? "";
      };

      const player_name = getCell("player_name");
      if (!player_name) continue; // skip blank/separator rows

      const parsedRow: ParsedRow = {
        player_name,
        team_name: getCell("team_name"),
        points: 0,
        rebounds: 0,
        assists: 0,
        steals: 0,
        blocks: 0,
        turnovers: 0,
        minutes_played: 0,
      };

      for (const field of NUMERIC_FIELDS) {
        const raw = getCell(field);
        const num = parseFloat(raw.replace(/[^0-9.\-]/g, ""));
        (parsedRow as any)[field] = isNaN(num) ? 0 : num;
      }

      parsedRows.push(parsedRow);
    }

    res.json({
      total_rows: parsedRows.length,
      columns_detected: bestColumnMap,
      rows: parsedRows,
    });
  } catch (err) {
    console.error("Import stats preview error:", err);
    res.status(500).json({ error: "Failed to parse the uploaded HTML file" });
  }
});

export default router;
