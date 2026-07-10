/**
 * League Service — COMMUNITY-001
 *
 * Private mini-leagues that reuse the existing Weekly Score Engine.
 * Standings are filtered views of the Leaderboard sheet — no new
 * scoring logic exists here.
 *
 * All behaviour is gated by Settings:
 *   private_leagues_enabled    (default: true)
 *   premium_required_private_leagues  (default: false)
 *   max_free_leagues           (default: 5)
 *   max_free_members           (default: 20)
 */

import { v4 as uuidv4 } from "uuid";
import { getSheetData, appendRow, updateRow, deleteRow, getSetting } from "./sheetsService";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface League {
  league_id: string;
  league_name: string;
  description: string;
  invite_code: string;
  owner_user_id: string;
  max_members: number;
  visibility: "private";
  status: "active" | "disabled";
  created_at: string;
}

export interface LeagueMember {
  league_member_id: string;
  league_id: string;
  user_id: string;
  joined_at: string;
}

export interface LeagueStandingEntry {
  rank: number;
  league_rank: number;
  user_id: string;
  display_name: string;
  score: number;
}

export interface LeagueWithMembers extends League {
  members: LeagueMember[];
  member_count: number;
}

// ─── Feature flags ─────────────────────────────────────────────────────────────

async function getFlags() {
  const [enabled, premiumRequired, maxLeagues, maxMembers] = await Promise.all([
    getSetting("private_leagues_enabled", "true"),
    getSetting("premium_required_private_leagues", "false"),
    getSetting("max_free_leagues", "5"),
    getSetting("max_free_members", "20"),
  ]);
  return {
    enabled: enabled.toLowerCase() === "true",
    premiumRequired: premiumRequired.toLowerCase() === "true",
    maxLeagues: Number(maxLeagues),
    maxMembers: Number(maxMembers),
  };
}

/**
 * Determines whether a user can create a league.
 * Initially always true unless premium is required.
 * Structured for easy future extension (e.g. verified accounts).
 */
export async function canCreateLeague(
  _user_id: string,
  isPremium = false
): Promise<{ allowed: boolean; reason?: string }> {
  const flags = await getFlags();
  if (!flags.enabled) return { allowed: false, reason: "Private leagues are not currently available." };
  if (flags.premiumRequired && !isPremium) return { allowed: false, reason: "A premium account is required to create private leagues." };
  return { allowed: true };
}

// ─── Invite code generator ────────────────────────────────────────────────────

function generateInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const random = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `LBN-${random}`;
}

// ─── Create league ────────────────────────────────────────────────────────────

export async function createLeague(
  user_id: string,
  league_name: string,
  description = ""
): Promise<League> {
  const cap = await canCreateLeague(user_id);
  if (!cap.allowed) throw new Error(cap.reason!);

  const flags = await getFlags();
  const trimmedName = league_name.trim();
  if (!trimmedName) throw new Error("League name is required.");
  if (trimmedName.length > 50) throw new Error("League name must be 50 characters or fewer.");

  // Enforce per-user league limit
  const allMembers = await getSheetData("League_Members");
  const allLeagues = await getSheetData("Leagues");
  const ownedLeagues = allLeagues.filter(
    (l) => l.owner_user_id === user_id && l.status === "active"
  );
  if (ownedLeagues.length >= flags.maxLeagues) {
    throw new Error(`You can own up to ${flags.maxLeagues} leagues.`);
  }

  // Unique invite code
  const existingCodes = new Set(allLeagues.map((l) => l.invite_code));
  let invite_code = generateInviteCode();
  let attempts = 0;
  while (existingCodes.has(invite_code) && attempts < 10) {
    invite_code = generateInviteCode();
    attempts++;
  }

  const league: League = {
    league_id: uuidv4(),
    league_name: trimmedName,
    description: description.trim(),
    invite_code,
    owner_user_id: user_id,
    max_members: flags.maxMembers,
    visibility: "private",
    status: "active",
    created_at: new Date().toISOString(),
  };

  await appendRow("Leagues", league);

  // Owner automatically joins
  await appendRow("League_Members", {
    league_member_id: uuidv4(),
    league_id: league.league_id,
    user_id,
    joined_at: new Date().toISOString(),
  });

  return league;
}

// ─── Join league ──────────────────────────────────────────────────────────────

export async function joinLeague(user_id: string, invite_code: string): Promise<League> {
  const flags = await getFlags();
  if (!flags.enabled) throw new Error("Private leagues are not currently available.");

  const code = invite_code.trim().toUpperCase();
  const allLeagues = await getSheetData("Leagues");
  const league = allLeagues.find((l) => l.invite_code === code);

  if (!league) throw new Error("Invalid invite code. Check the code and try again.");
  if (league.status !== "active") throw new Error("This league is no longer active.");

  const allMembers = await getSheetData("League_Members");
  const leagueMembers = allMembers.filter((m) => m.league_id === league.league_id);

  if (leagueMembers.some((m) => m.user_id === user_id)) {
    throw new Error("You are already a member of this league.");
  }

  const maxMembers = Number(league.max_members || flags.maxMembers);
  if (leagueMembers.length >= maxMembers) {
    throw new Error(`This league is full (${maxMembers} members maximum).`);
  }

  await appendRow("League_Members", {
    league_member_id: uuidv4(),
    league_id: league.league_id,
    user_id,
    joined_at: new Date().toISOString(),
  });

  return league as League;
}

// ─── My leagues ───────────────────────────────────────────────────────────────

export async function getMyLeagues(user_id: string): Promise<LeagueWithMembers[]> {
  const [allLeagues, allMembers] = await Promise.all([
    getSheetData("Leagues"),
    getSheetData("League_Members"),
  ]);

  const myLeagueIds = new Set(
    allMembers.filter((m) => m.user_id === user_id).map((m) => m.league_id)
  );

  return allLeagues
    .filter((l) => myLeagueIds.has(l.league_id) && l.status === "active")
    .map((l) => {
      const members = allMembers.filter((m) => m.league_id === l.league_id) as LeagueMember[];
      return { ...l, members, member_count: members.length } as LeagueWithMembers;
    });
}

// ─── League details + standings ───────────────────────────────────────────────

export async function getLeagueDetails(
  league_id: string,
  requesting_user_id: string
): Promise<{
  league: LeagueWithMembers;
  standings: LeagueStandingEntry[];
}> {
  const [allLeagues, allMembers, leaderboard, allUsers, allWeeks] = await Promise.all([
    getSheetData("Leagues"),
    getSheetData("League_Members"),
    getSheetData("Leaderboard"),
    getSheetData("Users"),
    getSheetData("Weekly_Gameweek"),
  ]);

  const league = allLeagues.find((l) => l.league_id === league_id);
  if (!league) throw new Error("League not found.");
  if (league.status !== "active") throw new Error("This league is no longer active.");

  const members = allMembers.filter((m) => m.league_id === league_id) as LeagueMember[];
  const isMember = members.some((m) => m.user_id === requesting_user_id);
  if (!isMember) throw new Error("You are not a member of this league.");

  const memberUserIds = new Set(members.map((m) => m.user_id));

  // Standings: filter existing leaderboard to league members only
  // Uses the most recent week with scores_calculated
  const latestScoredWeek = allWeeks
    .filter((w) => String(w.scores_calculated).toUpperCase() === "TRUE")
    .sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime())[0];

  let standings: LeagueStandingEntry[] = [];
  if (latestScoredWeek) {
    const weekEntries = leaderboard.filter(
      (l) => String(l.week_id) === String(latestScoredWeek.week_id) &&
              memberUserIds.has(l.user_id)
    );

    // Sort by score descending, assign league-specific rank
    const sorted = weekEntries
      .sort((a, b) => Number(b.score) - Number(a.score))
      .map((entry, idx) => {
        const user = allUsers.find((u) => u.user_id === entry.user_id);
        return {
          rank: Number(entry.rank),
          league_rank: idx + 1,
          user_id: entry.user_id,
          display_name: user?.display_name || user?.full_name || "Unknown",
          score: Math.round(Number(entry.score) * 100) / 100,
        };
      });

    standings = sorted;
  }

  return {
    league: { ...league, members, member_count: members.length } as LeagueWithMembers,
    standings,
  };
}

// ─── Leave league ──────────────────────────────────────────────────────────────

export async function leaveLeague(league_id: string, user_id: string): Promise<void> {
  const [allLeagues, allMembers] = await Promise.all([
    getSheetData("Leagues"),
    getSheetData("League_Members"),
  ]);

  const league = allLeagues.find((l) => l.league_id === league_id);
  if (!league) throw new Error("League not found.");

  if (league.owner_user_id === user_id) {
    throw new Error("League owners cannot leave their own league. Transfer ownership first. (Coming in COMMUNITY-002)");
  }

  const membership = allMembers.find(
    (m) => m.league_id === league_id && m.user_id === user_id
  );
  if (!membership) throw new Error("You are not a member of this league.");

  await deleteRow("League_Members", "league_member_id", membership.league_member_id);
}
