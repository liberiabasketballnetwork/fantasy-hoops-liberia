/**
 * PlayerEligibilityService — FEATURE-002
 *
 * Single source of truth for player draft eligibility.
 * A player is eligible only when:
 *   1. Player.status === "Active"   (individual eligibility)
 *   2. Team.status   === "Active"   (team eligibility)
 *
 * Neither condition alone is sufficient. Both must be true.
 *
 * No player records are modified when a team is eliminated.
 * Team status is checked at request time — not stored on the player.
 *
 * Consumers:
 *   - playerRoutes.ts / filterPlayers (draft pool)
 *   - Future: transfer market, lineup validation
 */

import { getSheetData } from "./sheetsService";

// ─── Types ────────────────────────────────────────────────────────────────

export type TeamStatus   = "Active" | "Eliminated" | "Suspended";
export type PlayerStatus = string;  // "Active", "Injured", "Suspended", "Retired", etc.

export interface EligibilityResult {
  eligible:      boolean;
  reason?:       string;   // Human-readable explanation when not eligible
  player_status: string;
  team_status:   string;
}

// ─── Active team set builder ──────────────────────────────────────────────

/**
 * Load all teams and return a Set of team_ids whose status is "Active".
 * Blank / missing status defaults to "Active" for backward compatibility
 * during the transition period, but all rows should be explicitly set.
 *
 * Uses sheetsService 15-second cache — no extra API calls on repeated reads.
 */
export async function buildActiveTeamSet(): Promise<Set<string>> {
  const teams = await getSheetData("Teams");
  const activeIds = new Set<string>();
  for (const team of teams) {
    const status = String(team.status || "Active").trim();
    if (status === "Active") {
      activeIds.add(String(team.team_id));
    }
  }
  return activeIds;
}

// ─── Single player eligibility check ─────────────────────────────────────

/**
 * Determine whether a single player is eligible for drafting.
 * Accepts an optional pre-built activeTeamSet to avoid redundant sheet reads
 * when checking multiple players in one request.
 */
export async function isPlayerEligible(
  player: Record<string, any>,
  activeTeamSet?: Set<string>
): Promise<EligibilityResult> {
  const playerStatus = String(player.status || "").trim();
  const teamId       = String(player.team_id || "");

  // Check player-level status first (cheapest check)
  if (playerStatus.toLowerCase() !== "active") {
    return {
      eligible:      false,
      reason:        `Player status is "${playerStatus}"`,
      player_status: playerStatus,
      team_status:   "unknown",
    };
  }

  // Load team set if not provided
  const teamSet = activeTeamSet ?? await buildActiveTeamSet();

  // Check team-level status
  if (!teamSet.has(teamId)) {
    // Load team name for a useful reason message
    const teams   = await getSheetData("Teams");
    const team    = teams.find((t) => String(t.team_id) === teamId);
    const tStatus = team ? String(team.status || "Unknown") : "Not found";

    return {
      eligible:      false,
      reason:        `Team status is "${tStatus}"`,
      player_status: playerStatus,
      team_status:   tStatus,
    };
  }

  return {
    eligible:      true,
    player_status: playerStatus,
    team_status:   "Active",
  };
}

// ─── Batch filter (primary consumer entry point) ──────────────────────────

/**
 * Filter a player array to only eligible players.
 * Builds the activeTeamSet once and reuses it across all players — O(n).
 *
 * @param players  Raw player rows from getSheetData("Players")
 * @param activeTeamSet  Optional pre-built set; built internally if not provided
 * @returns Players where both Player.status and Team.status are "Active"
 */
export async function filterEligiblePlayers(
  players: Record<string, any>[],
  activeTeamSet?: Set<string>
): Promise<Record<string, any>[]> {
  const teamSet = activeTeamSet ?? await buildActiveTeamSet();

  return players.filter((player) => {
    const playerStatus = String(player.status || "").trim().toLowerCase();
    const teamId       = String(player.team_id || "");

    // Both conditions must be true
    return playerStatus === "active" && teamSet.has(teamId);
  });
}

// ─── Migration helper ─────────────────────────────────────────────────────

/**
 * Ensure every existing team row has an explicit "Active" status.
 * Safe to re-run — only writes rows where status is blank or missing.
 * Called once on server startup via server.ts.
 */
export async function migrateTeamStatuses(): Promise<{
  migrated: number;
  skipped:  number;
}> {
  const { updateRow } = await import("./sheetsService");
  const teams = await getSheetData("Teams");

  let migrated = 0;
  let skipped  = 0;

  for (const team of teams) {
    const currentStatus = String(team.status || "").trim();
    if (!currentStatus) {
      try {
        await updateRow("Teams", "team_id", team.team_id, {
          ...team,
          status: "Active",
        });
        migrated++;
      } catch {
        console.warn(`[TeamMigration] Could not set status for team ${team.team_id}`);
      }
    } else {
      skipped++;
    }
  }

  console.log(`[TeamMigration] ${migrated} teams migrated to Active, ${skipped} already had status.`);
  return { migrated, skipped };
}
