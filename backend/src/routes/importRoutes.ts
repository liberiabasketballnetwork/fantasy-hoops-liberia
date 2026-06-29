import express from "express";
import multer from "multer";
import * as cheerio from "cheerio";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { authenticate, requireAdmin } from "../middleware/auth";
import { getSheetData, updateRow, appendRow } from "../services/sheetsService";

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
  match_status: "Matched" | "Manual Match Required";
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

/**
 * Builds a case-insensitive lookup from each saved import alias to its
 * player_id. A player's import_alias cell can hold multiple aliases
 * separated by "|" (accumulated over time as different admins confirm
 * different spellings/formats for the same player), e.g.:
 *   "ISAAC CHUKUEBUKA ANOSIKE|I. ANOSIKE"
 */
function buildAliasLookup(players: any[]): Map<string, string> {
  const lookup = new Map<string, string>();
  for (const p of players) {
    if (p.import_alias) {
      const aliases = String(p.import_alias).split("|");
      for (const alias of aliases) {
        const trimmed = alias.trim().toLowerCase();
        if (trimmed) lookup.set(trimmed, p.player_id);
      }
    }
  }
  return lookup;
}

/**
 * Given the raw text extracted from the filename (e.g. "FIRST DIVISION
 * MIGHTY BARROLLE", with underscores already turned into spaces), finds the
 * known team (from the Teams sheet) whose name matches the END of that raw
 * text, case-insensitively. This correctly strips off unrelated prefixes
 * like a division/league label ("FIRST DIVISION ...") because we're
 * matching against real team names instead of guessing by word count.
 * Falls back to the raw text itself if no known team matches.
 */
function resolveTeamNameFromRaw(raw: string, knownTeamNames: string[]): string {
  const normalizedRaw = raw.replace(/\s+/g, " ").trim().toLowerCase();
  let bestMatch: string | null = null;

  for (const teamName of knownTeamNames) {
    const normalizedTeam = teamName.replace(/\s+/g, " ").trim().toLowerCase();
    if (normalizedRaw.endsWith(normalizedTeam)) {
      if (!bestMatch || normalizedTeam.length > bestMatch.length) {
        bestMatch = normalizedTeam;
      }
    }
  }

  if (bestMatch) {
    // Return the team name in its original casing from the Teams sheet.
    const original = knownTeamNames.find(
      (t) => t.replace(/\s+/g, " ").trim().toLowerCase() === bestMatch
    );
    return original || raw.trim();
  }

  return raw.replace(/\s+/g, " ").trim();
}

/**
 * STEP 2: parses a stats filename like
 *   "FIRST_DIVISION_MIGHTY_BARROLLE_vs_KNIGHT_REAPERS_20260627.html"
 * into { home_team, away_team, game_date }. Returns nulls for anything it
 * couldn't confidently extract.
 */
function parseGameInfoFromFilename(
  filename: string,
  knownTeamNames: string[]
): { home_team: string | null; away_team: string | null; game_date: string | null } {
  const base = filename.replace(/\.[a-z0-9]+$/i, ""); // strip extension

  const dateMatch = base.match(/(\d{4})(\d{2})(\d{2})/);
  const game_date = dateMatch ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}` : null;
  const withoutDate = dateMatch ? base.replace(dateMatch[0], "") : base;

  const vsMatch = withoutDate.split(/_vs_/i);
  if (vsMatch.length !== 2) {
    return { home_team: null, away_team: null, game_date };
  }

  const homeRaw = vsMatch[0].replace(/_/g, " ");
  const awayRaw = vsMatch[1].replace(/_/g, " ");

  const home_team = resolveTeamNameFromRaw(homeRaw, knownTeamNames) || null;
  const away_team = resolveTeamNameFromRaw(awayRaw, knownTeamNames) || null;

  return { home_team, away_team, game_date };
}

/**
 * Normalizes a team name for comparison purposes: trims surrounding
 * whitespace, collapses multiple internal spaces into one, and lowercases
 * everything. This makes "MIGHTY   BARROLLE " match "Mighty Barrolle"
 * during game lookup, regardless of casing or stray whitespace differences
 * between the imported filename and what's stored in the Games sheet.
 */
function normalizeTeamName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
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
    const aliasLookup = buildAliasLookup(allPlayers);

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

        // STEP 2/3: case-insensitive exact match against Players.full_name first.
        const normalizedImportedName = player_name.trim().toLowerCase();
        let matchedPlayerId = nameLookup.get(normalizedImportedName) || null;

        // STEP 3: if full_name match fails, fall back to checking saved aliases.
        if (!matchedPlayerId) {
          matchedPlayerId = aliasLookup.get(normalizedImportedName) || null;
        }

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
          // STEP 4: show "Manual Match Required" instead of "No Match Found".
          match_status: matchedPlayerId ? "Matched" : "Manual Match Required",
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

const confirmMatchSchema = z.object({
  player_name: z.string().min(1), // the imported name from the HTML file
  player_id: z.string().min(1), // the player the admin manually matched it to
});

/**
 * STEP 6/7: Admin manually selects the correct player for an imported name
 * that couldn't be auto-matched, and this saves that imported name as a new
 * alias on the chosen player so future imports match it automatically
 * (STEP 8). Does not touch Player_Stats - matching only.
 */
router.post("/confirm-match", async (req, res) => {
  try {
    const { player_name, player_id } = confirmMatchSchema.parse(req.body);

    const players = await getSheetData("Players");
    const player = players.find((p) => p.player_id === player_id);
    if (!player) {
      return res.status(404).json({ error: "Selected player not found" });
    }

    const existingAliases = player.import_alias
      ? String(player.import_alias)
          .split("|")
          .map((a) => a.trim())
          .filter(Boolean)
      : [];

    const alreadySaved = existingAliases.some(
      (a) => a.toLowerCase() === player_name.trim().toLowerCase()
    );

    const updatedAliases = alreadySaved
      ? existingAliases
      : [...existingAliases, player_name.trim()];

    const updated = await updateRow("Players", "player_id", player_id, {
      import_alias: updatedAliases.join("|"),
    });

    res.json({ message: "Alias saved", player: updated });
  } catch (err: any) {
    if (err.name === "ZodError") {
      return res.status(400).json({ error: "Invalid input", details: err.errors });
    }
    console.error("Confirm match error:", err);
    res.status(500).json({ error: "Failed to save manual match" });
  }
});

/**
 * STEP 5/6: per-game fantasy score for a single player's stat line, used
 * specifically for the imported Player_Stats.fantasy_points value. This is
 * a different formula than the weekly captain-based lineup scoring engine
 * (scoringEngine.ts) - that one is untouched by this feature.
 *
 * Formula: points*1 + rebounds*1.2 + assists*1.5 + steals*3 + blocks*3 - turnovers*1
 * Bonus: +5 if 10+ in three or more of [points, rebounds, assists, steals,
 * blocks] (triple-double), else +3 if 10+ in exactly two of them
 * (double-double). Triple-double overrides double-double - never both.
 */
function calculateImportFantasyScore(stat: {
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
}): number {
  const base =
    stat.points * 1 +
    stat.rebounds * 1.2 +
    stat.assists * 1.5 +
    stat.steals * 3 +
    stat.blocks * 3 -
    stat.turnovers * 1;

  const categoriesInDoubleDigits = [
    stat.points,
    stat.rebounds,
    stat.assists,
    stat.steals,
    stat.blocks,
  ].filter((v) => v >= 10).length;

  let bonus = 0;
  if (categoriesInDoubleDigits >= 3) {
    bonus = 5; // triple-double
  } else if (categoriesInDoubleDigits >= 2) {
    bonus = 3; // double-double
  }

  return base + bonus;
}

const saveStatsSchema = z.object({
  filename: z.string().min(1),
  rows: z
    .array(
      z.object({
        player_id: z.string().min(1),
        points: z.number().default(0),
        rebounds: z.number().default(0),
        assists: z.number().default(0),
        steals: z.number().default(0),
        blocks: z.number().default(0),
        turnovers: z.number().default(0),
        minutes_played: z.number().default(0),
      })
    )
    .min(1, "No player rows to save"),
});

/**
 * Saves matched player stats into Player_Stats, after locating the right
 * game from the uploaded filename. Only ever called once every row is
 * matched (100%) - the frontend enforces this, and we double check here too.
 */
router.post("/import-stats-save", async (req, res) => {
  try {
    const { filename, rows } = saveStatsSchema.parse(req.body);

    // STEP 1: require 100% matching - every row must already carry a
    // player_id by the time it reaches this endpoint (auto-matched or
    // manually confirmed). There's no "unmatched" concept here since the
    // schema requires player_id on every row, but we keep this explicit
    // check in case the frontend ever sends an incomplete set.
    if (rows.some((r) => !r.player_id)) {
      return res.status(400).json({
        error: "Not all players are matched. 100% matching is required before saving.",
      });
    }

    // STEP 2: extract home_team, away_team, game_date from the filename.
    const teams = await getSheetData("Teams");
    const knownTeamNames = teams.map((t) => String(t.team_name));
    const { home_team, away_team, game_date } = parseGameInfoFromFilename(filename, knownTeamNames);

    if (!home_team || !away_team || !game_date) {
      return res.status(400).json({
        error:
          "Could not determine the game from the filename. Expected a format like 'HOME_TEAM_vs_AWAY_TEAM_YYYYMMDD.html'.",
      });
    }

    // STEP 3: find the matching Games row, using normalized team names so
    // casing/whitespace differences between the filename and the sheet
    // (e.g. "MIGHTY BARROLLE" vs "Mighty Barrolle") don't break the match.
    const games = await getSheetData("Games");

    const matchingGame = games.find((g) => {
      const gameDate = String(g.game_date).slice(0, 10); // tolerate datetime strings too
      return (
        normalizeTeamName(String(g.home_team)) === normalizeTeamName(home_team) &&
        normalizeTeamName(String(g.away_team)) === normalizeTeamName(away_team) &&
        gameDate === game_date
      );
    });

    if (!matchingGame) {
      return res.status(404).json({
        error: `No matching game found for ${home_team} vs ${away_team} on ${game_date}. Add this game first in the admin panel.`,
      });
    }

    const game_id = matchingGame.game_id;

    // STEP 4: check Import_Log for this file/game having already been
    // imported successfully, instead of just inferring it from Player_Stats.
    const importLog = await getSheetData("Import_Log");
    const alreadyImported = importLog.some(
      (entry) =>
        String(entry.status).toLowerCase() === "success" &&
        (String(entry.game_id) === String(game_id) ||
          normalizeTeamName(String(entry.file_name)) === normalizeTeamName(filename))
    );
    if (alreadyImported) {
      return res.status(409).json({
        error: "This game has already been imported.",
      });
    }

    // STEP 5/6: calculate fantasy score (with double/triple-double bonus)
    // for each player, then STEP 7: insert one Player_Stats row per player.
    for (const row of rows) {
      const fantasy_points = calculateImportFantasyScore(row);

      await appendRow("Player_Stats", {
        stat_id: uuidv4(),
        game_id,
        player_id: row.player_id,
        points: row.points,
        rebounds: row.rebounds,
        assists: row.assists,
        steals: row.steals,
        blocks: row.blocks,
        turnovers: row.turnovers,
        minutes_played: row.minutes_played,
        fantasy_points: fantasy_points.toFixed(2),
      });
    }

    // STEP 8: update each player's games_played and running averages for
    // points/rebounds/assists.
    const allPlayers = await getSheetData("Players");
    for (const row of rows) {
      const player = allPlayers.find((p) => p.player_id === row.player_id);
      if (!player) continue;

      const previousGamesPlayed = Number(player.games_played || 0);
      const newGamesPlayed = previousGamesPlayed + 1;

      const runningAverage = (previousAverage: any, newValue: number) => {
        const prevAvg = Number(previousAverage || 0);
        return ((prevAvg * previousGamesPlayed + newValue) / newGamesPlayed).toFixed(2);
      };

      await updateRow("Players", "player_id", row.player_id, {
        games_played: newGamesPlayed,
        average_points: runningAverage(player.average_points, row.points),
        average_rebounds: runningAverage(player.average_rebounds, row.rebounds),
        average_assists: runningAverage(player.average_assists, row.assists),
      });
    }

    // STEP 9: mark the game as completed.
    await updateRow("Games", "game_id", game_id, { status: "completed" });

    // STEP 10: log this import.
    await appendRow("Import_Log", {
      import_id: uuidv4(),
      file_name: filename,
      game_id,
      imported_at: new Date().toISOString(),
      status: "success",
    });

    // STEP 11: success message.
    res.json({
      message: `Successfully saved ${rows.length} player stats.`,
      game_id,
      saved_count: rows.length,
    });
  } catch (err: any) {
    if (err.name === "ZodError") {
      return res.status(400).json({ error: "Invalid input", details: err.errors });
    }
    console.error("Import stats save error:", err);
    res.status(500).json({ error: "Failed to save player stats" });
  }
});

const quickAddPlayerSchema = z.object({
  full_name: z.string().min(1),
  team_id: z.string().min(1),
  position: z.enum(["PG", "SG", "SF", "PF", "C"]),
  fantasy_price: z.number().optional().default(6),
  status: z.string().optional().default("active"),
  import_alias: z.string().min(1), // the imported name that triggered this, e.g. "RICHARD WEAH CLARKE III"
});

/**
 * Used from the Manual Review panel when an imported player genuinely
 * doesn't exist in the Players sheet yet (e.g. "RICHARD WEAH CLARKE III").
 * Creates the new player, immediately saves the imported name as their
 * import_alias (STEP 5), so the row this came from can be marked Matched
 * right away (STEP 6) without needing a second import to pick up the alias.
 */
router.post("/quick-add-player", async (req, res) => {
  try {
    const data = quickAddPlayerSchema.parse(req.body);

    const player_id = uuidv4();
    const player = {
      player_id,
      full_name: data.full_name,
      team_id: data.team_id,
      position: data.position,
      fantasy_price: data.fantasy_price,
      status: data.status,
      games_played: 0,
      average_points: 0,
      average_rebounds: 0,
      average_assists: 0,
      photo_url: "",
      import_alias: data.import_alias.trim(),
      source: "import",
      created_at: new Date().toISOString(),
    };

    await appendRow("Players", player);

    res.status(201).json({ message: "Player created", player });
  } catch (err: any) {
    if (err.name === "ZodError") {
      return res.status(400).json({ error: "Invalid input", details: err.errors });
    }
    console.error("Quick add player error:", err);
    res.status(500).json({ error: "Failed to create player" });
  }
});

export default router;
