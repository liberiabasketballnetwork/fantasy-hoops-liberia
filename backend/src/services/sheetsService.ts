import { google } from "googleapis";
import { SPREADSHEET_ID, SHEET_HEADERS } from "../config/googleSheets";

const auth = new google.auth.JWT({
  email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  key: (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const sheets = google.sheets({ version: "v4", auth });

export interface Row { [key: string]: any; }

const CACHE_TTL_MS = 15_000;
const cache = new Map<string, { data: Row[]; expiresAt: number }>();

function invalidateCache(sheetName: string) { cache.delete(sheetName); }

async function withRetry<T>(fn: () => Promise<T>, retries = 3, delayMs = 1000): Promise<T> {
  let lastError: any;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try { return await fn(); }
    catch (err: any) {
      lastError = err;
      if (attempt < retries) await new Promise((r) => setTimeout(r, delayMs * Math.pow(2, attempt)));
    }
  }
  throw lastError;
}

function colLetter(index: number): string {
  let letters = "";
  let n = index + 1;
  while (n > 0) { const rem = (n - 1) % 26; letters = String.fromCharCode(65 + rem) + letters; n = Math.floor((n - 1) / 26); }
  return letters;
}

function rowsToObjects(values: any[][], headers: string[]): Row[] {
  if (!values || values.length === 0) return [];
  return values.map((row) => {
    const obj: Row = {};
    headers.forEach((header, i) => { obj[header] = row[i] !== undefined ? row[i] : ""; });
    return obj;
  });
}

export async function getSheetData(sheetName: string, useCache = true): Promise<Row[]> {
  const cached = cache.get(sheetName);
  if (useCache && cached && cached.expiresAt > Date.now()) return cached.data;
  const headers = SHEET_HEADERS[sheetName];
  if (!headers) throw new Error(`Unknown sheet: ${sheetName}`);
  const range = `${sheetName}!A2:${colLetter(headers.length - 1)}`;
  const res = await withRetry(() => sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range }));
  const data = rowsToObjects(res.data.values || [], headers);
  cache.set(sheetName, { data, expiresAt: Date.now() + CACHE_TTL_MS });
  return data;
}

export async function appendRow(sheetName: string, rowObject: Row): Promise<Row> {
  const headers = SHEET_HEADERS[sheetName];
  if (!headers) throw new Error(`Unknown sheet: ${sheetName}`);
  const values = [headers.map((h) => rowObject[h] ?? "")];
  await withRetry(() => sheets.spreadsheets.values.append({ spreadsheetId: SPREADSHEET_ID, range: `${sheetName}!A1`, valueInputOption: "USER_ENTERED", insertDataOption: "INSERT_ROWS", requestBody: { values } }));
  invalidateCache(sheetName);
  return rowObject;
}

async function findSheetRowNumber(sheetName: string, idField: string, idValue: string): Promise<number | null> {
  const headers = SHEET_HEADERS[sheetName];
  const range = `${sheetName}!A2:${colLetter(headers.length - 1)}`;
  const res = await withRetry(() => sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range }));
  const rows = res.data.values || [];
  const fieldIndex = headers.indexOf(idField);
  if (fieldIndex === -1) return null;
  for (let i = 0; i < rows.length; i++) {
    const rowVal = rows[i][fieldIndex];
    if (String(rowVal).replace(/^'/, "") === String(idValue)) return i + 2;
  }
  return null;
}

export async function updateRow(sheetName: string, idField: string, idValue: string, updates: Partial<Row>): Promise<Row | null> {
  const headers = SHEET_HEADERS[sheetName];
  if (!headers) throw new Error(`Unknown sheet: ${sheetName}`);
  const rowNumber = await findSheetRowNumber(sheetName, idField, idValue);
  if (!rowNumber) return null;
  const existingRange = `${sheetName}!A${rowNumber}:${colLetter(headers.length - 1)}${rowNumber}`;
  const getRes = await withRetry(() => sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: existingRange }));
  const existingRow = getRes.data.values?.[0] || [];
  const existingObj: Row = {};
  headers.forEach((h, i) => { existingObj[h] = existingRow[i] ?? ""; });
  const merged = { ...existingObj, ...updates };
  await withRetry(() => sheets.spreadsheets.values.update({ spreadsheetId: SPREADSHEET_ID, range: existingRange, valueInputOption: "USER_ENTERED", requestBody: { values: [headers.map((h) => merged[h])] } }));
  invalidateCache(sheetName);
  return merged;
}

export async function deleteRow(sheetName: string, idField: string, idValue: string): Promise<boolean> {
  const rowNumber = await findSheetRowNumber(sheetName, idField, idValue);
  if (!rowNumber) return false;
  const sheetMetaRes = await withRetry(() => sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID, fields: "sheets.properties" }));
  const sheetMeta = sheetMetaRes.data.sheets?.find((s: any) => s.properties?.title === sheetName);
  if (!sheetMeta?.properties?.sheetId) throw new Error(`Could not resolve sheetId for ${sheetName}`);
  const sheetId = sheetMeta.properties.sheetId;
  await withRetry(() => sheets.spreadsheets.batchUpdate({ spreadsheetId: SPREADSHEET_ID, requestBody: { requests: [{ deleteDimension: { range: { sheetId, dimension: "ROWS", startIndex: rowNumber - 1, endIndex: rowNumber } } }] } }));
  invalidateCache(sheetName);
  return true;
}

export async function findRowById(sheetName: string, idField: string, idValue: string): Promise<Row | null> {
  const rows = await getSheetData(sheetName);
  return rows.find((r) => String(r[idField]) === String(idValue)) || null;
}

export async function findRowByField(sheetName: string, field: string, value: string): Promise<Row | null> {
  const rows = await getSheetData(sheetName);
  return rows.find((r) => String(r[field]).toLowerCase() === String(value).toLowerCase()) || null;
}

export async function filterPlayers(filters: { team_id?: string; position?: string; status?: string }): Promise<Row[]> {
  let players = await getSheetData("Players");
  if (filters.team_id) players = players.filter((p) => p.team_id === filters.team_id);
  if (filters.position) players = players.filter((p) => p.position === filters.position);
  if (filters.status) players = players.filter((p) => String(p.status).toLowerCase() === filters.status!.toLowerCase());
  return players;
}

export function sortLeaderboard(rows: Row[]): Row[] {
  return [...rows].sort((a, b) => Number(b.score) - Number(a.score));
}

export async function lockWeek(weekId: string): Promise<Row | null> {
  return updateRow("Weekly_Gameweek", "week_id", weekId, { is_locked: "TRUE" });
}

export async function resetWeek(weekId: string): Promise<void> {
  const leaderboard = await getSheetData("Leaderboard");
  for (const row of leaderboard.filter((r) => String(r.week_id) === String(weekId))) {
    await deleteRow("Leaderboard", "leaderboard_id", row.leaderboard_id);
  }
  const fantasyScoring = await getSheetData("Fantasy_Scoring");
  for (const row of fantasyScoring.filter((r) => String(r.week_id) === String(weekId))) {
    await deleteRow("Fantasy_Scoring", "score_id", row.score_id);
  }
  await updateRow("Weekly_Gameweek", "week_id", weekId, { scores_calculated: "FALSE", prices_updated: "FALSE", is_locked: "FALSE" });
}

export async function getSetting(key: string, defaultValue = ""): Promise<string> {
  const rows = await getSheetData("Settings");
  const row = rows.find((r) => r.setting_key === key);
  return row ? String(row.setting_value) : defaultValue;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const rows = await getSheetData("Settings", false);
  const existing = rows.find((r) => r.setting_key === key);
  if (existing) { await updateRow("Settings", "setting_key", key, { setting_value: value }); }
  else { await appendRow("Settings", { setting_key: key, setting_value: value }); }
}

export async function batchUpdateRows(sheetName: string, updates: { rowNumber: number; data: Row }[]): Promise<void> {
  if (updates.length === 0) return;
  const headers = SHEET_HEADERS[sheetName];
  if (!headers) throw new Error(`Unknown sheet: ${sheetName}`);
  const data = updates.map(({ rowNumber, data: rowData }) => ({
    range: `${sheetName}!A${rowNumber}:${colLetter(headers.length - 1)}${rowNumber}`,
    values: [headers.map((h) => rowData[h] ?? "")],
  }));
  await withRetry(() => sheets.spreadsheets.values.batchUpdate({ spreadsheetId: SPREADSHEET_ID, requestBody: { valueInputOption: "USER_ENTERED", data } }));
  invalidateCache(sheetName);
}

export function clearAllCache() { cache.clear(); }
