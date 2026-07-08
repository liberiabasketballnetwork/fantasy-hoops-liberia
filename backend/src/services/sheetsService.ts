import { sheets, SPREADSHEET_ID, SHEET_HEADERS } from "../config/googleSheets";

/**
 * This module is the entire "database layer" for Fantasy Hoops Liberia.
 * Every read/write to Google Sheets happens through these functions.
 * In-memory caching is used to keep things fast on low-bandwidth connections
 * and to stay well under Google Sheets API quotas.
 */

/**
 * Google's OAuth token endpoint occasionally drops the connection mid-response
 * ("Premature close" / ECONNRESET-style errors). These are transient, not
 * actual auth failures, so every Sheets API call is retried a few times with
 * a short backoff before giving up.
 */
async function withRetry<T>(fn: () => Promise<T>, retries = 3, delayMs = 500): Promise<T> {
  let lastError: any;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      const message = String(err?.message || "");
      const isTransient =
        message.includes("Premature close") ||
        message.includes("ECONNRESET") ||
        message.includes("ETIMEDOUT") ||
        message.includes("socket hang up") ||
        err?.code === "ECONNRESET";

      if (!isTransient || attempt === retries) throw err;

      await new Promise((res) => setTimeout(res, delayMs * attempt));
    }
  }
  throw lastError;
}

type Row = Record<string, any>;

interface CacheEntry {
  data: Row[];
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 15 * 1000; // 15s cache - keeps reads fast, writes still go straight through

function invalidateCache(sheetName: string) {
  cache.delete(sheetName);
}

function colLetter(index: number): string {
  // 0-indexed -> A, B, ... Z, AA, AB...
  let letters = "";
  let n = index + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

function rowsToObjects(values: any[][], headers: string[]): Row[] {
  if (!values || values.length === 0) return [];
  return values.map((row) => {
    const obj: Row = {};
    headers.forEach((header, i) => {
      obj[header] = row[i] !== undefined ? row[i] : "";
    });
    return obj;
  });
}

/**
 * Fetch all rows from a sheet (excluding the header row) as an array of objects.
 * Uses a short-lived in-memory cache to reduce API calls.
 */
export async function getSheetData(sheetName: string, useCache = true): Promise<Row[]> {
  const cached = cache.get(sheetName);
  if (useCache && cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const headers = SHEET_HEADERS[sheetName];
  if (!headers) throw new Error(`Unknown sheet: ${sheetName}`);

  const range = sheetRange(sheetName, `A2:${colLetter(headers.length - 1)}`);
  const res = await withRetry(() =>
    sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range })
  );

  const data = rowsToObjects(res.data.values || [], headers);
  cache.set(sheetName, { data, expiresAt: Date.now() + CACHE_TTL_MS });
  return data;
}

/**
 * Append a new row (object) to the end of a sheet.
 */
/**
 * Wraps a sheet name in single quotes for use in Google Sheets API range
 * notation. The API requires quoting for sheet names that contain spaces,
 * underscores, or other special characters — without it, names like
 * "Price_History" cause "Unable to parse range" errors on first write.
 * Any literal single quotes inside the name are escaped as ''.
 */
function sheetRange(sheetName: string, range: string): string {
  const quoted = `'${sheetName.replace(/'/g, "''")}'`;
  return `${quoted}!${range}`;
}

export async function appendRow(sheetName: string, rowObject: Row): Promise<Row> {
  const headers = SHEET_HEADERS[sheetName];
  if (!headers) throw new Error(`Unknown sheet: ${sheetName}`);

  const values = [headers.map((h) => rowObject[h] ?? "")];

  await withRetry(() =>
    sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: sheetRange(sheetName, "A:A"),
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values },
    })
  );

  invalidateCache(sheetName);
  return rowObject;
}

/**
 * Find the 1-indexed sheet row number (including header) for a record matching idField=idValue.
 * Returns -1 if not found. Internal helper used by updateRow/deleteRow.
 */
async function findSheetRowNumber(
  sheetName: string,
  idField: string,
  idValue: string | number
): Promise<number> {
  const headers = SHEET_HEADERS[sheetName];
  const range = sheetRange(sheetName, `A2:${colLetter(headers.length - 1)}`);
  const res = await withRetry(() =>
    sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range })
  );
  const values = res.data.values || [];
  const idIndex = headers.indexOf(idField);

  for (let i = 0; i < values.length; i++) {
    if (String(values[i][idIndex]) === String(idValue)) {
      return i + 2; // +2 because row 1 is header and arrays are 0-indexed
    }
  }
  return -1;
}

/**
 * Update an existing row identified by idField=idValue, merging in the supplied fields.
 */
export async function updateRow(
  sheetName: string,
  idField: string,
  idValue: string | number,
  updates: Row
): Promise<Row | null> {
  const headers = SHEET_HEADERS[sheetName];
  if (!headers) throw new Error(`Unknown sheet: ${sheetName}`);

  const rowNumber = await findSheetRowNumber(sheetName, idField, idValue);
  if (rowNumber === -1) return null;

  // Read existing row so we only overwrite fields the caller provided.
  const existingRange = sheetRange(sheetName, `A${rowNumber}:${colLetter(headers.length - 1)}${rowNumber}`);
  const existingRes = await withRetry(() =>
    sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: existingRange })
  );
  const existingValues = (existingRes.data.values && existingRes.data.values[0]) || [];

  const merged: Row = {};
  headers.forEach((h, i) => {
    merged[h] = updates[h] !== undefined ? updates[h] : existingValues[i] ?? "";
  });

  await withRetry(() =>
    sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: existingRange,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [headers.map((h) => merged[h])] },
    })
  );

  invalidateCache(sheetName);
  return merged;
}

/**
 * Delete a row identified by idField=idValue. Uses batchUpdate (deleteDimension)
 * which requires the sheet's internal sheetId — we look that up first.
 */
export async function deleteRow(
  sheetName: string,
  idField: string,
  idValue: string | number
): Promise<boolean> {
  const rowNumber = await findSheetRowNumber(sheetName, idField, idValue);
  if (rowNumber === -1) return false;

  const meta = await withRetry(() => sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID }));
  const sheet = meta.data.sheets?.find((s) => s.properties?.title === sheetName);
  if (!sheet || sheet.properties?.sheetId === undefined) {
    throw new Error(`Could not resolve sheetId for ${sheetName}`);
  }

  await withRetry(() =>
    sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId: sheet.properties!.sheetId!,
                dimension: "ROWS",
                startIndex: rowNumber - 1,
                endIndex: rowNumber,
              },
            },
          },
        ],
      },
    })
  );

  invalidateCache(sheetName);
  return true;
}

/**
 * Find a single row by id field. Returns null if not found.
 */
export async function findRowById(
  sheetName: string,
  idField: string,
  idValue: string | number
): Promise<Row | null> {
  const rows = await getSheetData(sheetName);
  return rows.find((r) => String(r[idField]) === String(idValue)) || null;
}

/**
 * Find a single row by any field/value match. Returns null if not found.
 */
export async function findRowByField(
  sheetName: string,
  field: string,
  value: string | number
): Promise<Row | null> {
  const rows = await getSheetData(sheetName);
  return rows.find((r) => String(r[field]).toLowerCase() === String(value).toLowerCase()) || null;
}

/**
 * Filter players by optional position/team/status. Used by GET /players.
 */
export async function filterPlayers(filters: {
  team_id?: string;
  position?: string;
  status?: string;
}): Promise<Row[]> {
  const players = await getSheetData("Players");
  return players.filter((p) => {
    if (filters.team_id && String(p.team_id) !== String(filters.team_id)) return false;
    if (filters.position && p.position !== filters.position) return false;
    if (filters.status && p.status !== filters.status) return false;
    return true;
  });
}

/**
 * Sort leaderboard rows for a given week, descending by score, and assign rank.
 */
export function sortLeaderboard(rows: Row[]): Row[] {
  const sorted = [...rows].sort((a, b) => Number(b.score) - Number(a.score));
  return sorted.map((row, i) => ({ ...row, rank: i + 1 }));
}

/**
 * Lock a gameweek so no further lineup submissions/edits are allowed.
 */
export async function lockWeek(weekId: string): Promise<Row | null> {
  return updateRow("Weekly_Gameweek", "week_id", weekId, { is_locked: "TRUE" });
}

/**
 * Reset a week's leaderboard and scoring rows (used by admin "Reset Week").
 * Does NOT delete lineups - only clears scoring/leaderboard so it can be recalculated.
 */
export async function resetWeek(weekId: string): Promise<void> {
  const leaderboardRows = await getSheetData("Leaderboard", false);
  const toDelete = leaderboardRows.filter((r) => String(r.week_id) === String(weekId));
  for (const row of toDelete) {
    await deleteRow("Leaderboard", "leaderboard_id", row.leaderboard_id);
  }

  const scoringRows = await getSheetData("Fantasy_Scoring", false);
  const scoringToDelete = scoringRows.filter((r) => String(r.week_id) === String(weekId));
  for (const row of scoringToDelete) {
    await deleteRow("Fantasy_Scoring", "score_id", row.score_id);
  }

  await updateRow("Weekly_Gameweek", "week_id", weekId, { is_locked: "FALSE" });
}

export function clearAllCache() {
  cache.clear();
}

/**
 * Simple key-value settings store backed by the Settings sheet.
 * Used for things like toggling the salary cap system on/off.
 *
 * getSetting always reads the LAST matching row (most recently written) and
 * setSetting always removes ALL existing rows for a key before appending a
 * single fresh one. This makes the store self-healing against any duplicate
 * rows and avoids any ambiguity between "first match" and "last match" reads.
 */
export async function getSetting(key: string, fallback: string = ""): Promise<string> {
  const rows = await getSheetData("Settings", false); // never use cache for settings
  const matches = rows.filter((r) => String(r.setting_key).toLowerCase() === key.toLowerCase());
  if (matches.length === 0) return fallback;
  return String(matches[matches.length - 1].setting_value);
}

export async function setSetting(key: string, value: string): Promise<void> {
  // Remove every existing row for this key first (handles any duplicates
  // cleanly), then write a single fresh row with the new value.
  let rows = await getSheetData("Settings", false);
  let matches = rows.filter((r) => String(r.setting_key).toLowerCase() === key.toLowerCase());

  while (matches.length > 0) {
    await deleteRow("Settings", "setting_key", key);
    rows = await getSheetData("Settings", false);
    matches = rows.filter((r) => String(r.setting_key).toLowerCase() === key.toLowerCase());
  }

  await appendRow("Settings", { setting_key: key, setting_value: value });
}
