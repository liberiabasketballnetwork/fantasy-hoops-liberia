import { google } from "googleapis";
import dotenv from "dotenv";

dotenv.config();

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

function getAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n");

  if (!email || !key) {
    throw new Error(
      "Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_PRIVATE_KEY in environment variables."
    );
  }

  return new google.auth.JWT({
    email,
    key,
    scopes: SCOPES,
  });
}

export const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID || "";

export const sheets = google.sheets({ version: "v4", auth: getAuth() });

// Names of every "table" (worksheet tab) in the Google Sheet.
export const SHEET_NAMES = {
  USERS: "Users",
  TEAMS: "Teams",
  PLAYERS: "Players",
  GAMEWEEK: "Weekly_Gameweek",
  USER_LINEUPS: "User_Lineups",
  LINEUP_PLAYERS: "Lineup_Players",
  GAMES: "Games",
  PLAYER_STATS: "Player_Stats",
  FANTASY_SCORING: "Fantasy_Scoring",
  LEADERBOARD: "Leaderboard",
  SPONSORS: "Sponsors",
  SETTINGS: "Settings",
} as const;

// Column headers per sheet, in order. Row 1 of every tab must match these exactly.
export const SHEET_HEADERS: Record<string, string[]> = {
  [SHEET_NAMES.USERS]: [
    "user_id",
    "full_name",
    "email",
    "password_hash",
    "phone",
    "created_at",
    "last_login",
  ],
  [SHEET_NAMES.TEAMS]: ["team_id", "team_name", "division", "logo_url", "created_at"],
  [SHEET_NAMES.PLAYERS]: [
    "player_id",
    "full_name",
    "team_id",
    "position",
    "fantasy_price",
    "status",
    "average_points",
    "average_rebounds",
    "average_assists",
    "photo_url",
    "created_at",
  ],
  [SHEET_NAMES.GAMEWEEK]: [
    "week_id",
    "start_date",
    "end_date",
    "submission_deadline",
    "is_locked",
    "created_at",
  ],
  [SHEET_NAMES.USER_LINEUPS]: [
    "lineup_id",
    "user_id",
    "week_id",
    "captain_player_id",
    "total_score",
    "submitted_at",
  ],
  [SHEET_NAMES.LINEUP_PLAYERS]: ["lineup_id", "player_id"],
  [SHEET_NAMES.GAMES]: ["game_id", "home_team", "away_team", "game_date", "status"],
  [SHEET_NAMES.PLAYER_STATS]: [
    "stat_id",
    "game_id",
    "player_id",
    "points",
    "rebounds",
    "assists",
    "steals",
    "blocks",
    "turnovers",
    "minutes_played",
  ],
  [SHEET_NAMES.FANTASY_SCORING]: ["score_id", "player_id", "week_id", "fantasy_points"],
  [SHEET_NAMES.LEADERBOARD]: ["leaderboard_id", "week_id", "user_id", "score", "rank"],
  [SHEET_NAMES.SPONSORS]: ["sponsor_id", "company_name", "prize", "week_id"],
  [SHEET_NAMES.SETTINGS]: ["setting_key", "setting_value"],
};
