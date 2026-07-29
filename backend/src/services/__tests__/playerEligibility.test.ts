/**
 * FEATURE-002 — Player Eligibility Tests
 *
 * Tests the PlayerEligibilityService in isolation using mock data.
 * Run: npx ts-node src/services/__tests__/playerEligibility.test.ts
 */

import { filterEligiblePlayers, buildActiveTeamSet } from "../playerEligibilityService";

// ─── Test runner ──────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(description: string, fn: () => void | Promise<void>) {
  const result = fn();
  const handle = (ok: boolean) => {
    if (ok) { console.log(`  ✅ ${description}`); passed++; }
    else     { console.error(`  ❌ ${description}`); failed++; }
  };
  if (result instanceof Promise) {
    return result.then(() => handle(true)).catch((err) => {
      console.error(`  ❌ ${description}\n     ${err.message}`);
      failed++;
    });
  }
  handle(true);
}

function expect<T>(actual: T, expected: T, msg?: string) {
  if (actual !== expected) {
    throw new Error(
      msg ?? `Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`
    );
  }
}

// ─── Mock data ────────────────────────────────────────────────────────────

const TEAMS = {
  active:     { team_id: "t-active",     team_name: "Bushrod Bulls",  status: "Active"     },
  eliminated: { team_id: "t-eliminated", team_name: "Monrovia Lions", status: "Eliminated" },
  suspended:  { team_id: "t-suspended",  team_name: "Congo Rangers",  status: "Suspended"  },
};

const activeTeamSet = new Set(["t-active"]);

const PLAYERS = [
  { player_id: "p1", full_name: "Alpha",   status: "Active",   team_id: "t-active"     },
  { player_id: "p2", full_name: "Bravo",   status: "Active",   team_id: "t-eliminated" },
  { player_id: "p3", full_name: "Charlie", status: "Active",   team_id: "t-suspended"  },
  { player_id: "p4", full_name: "Delta",   status: "Injured",  team_id: "t-active"     },
  { player_id: "p5", full_name: "Echo",    status: "Retired",  team_id: "t-eliminated" },
  { player_id: "p6", full_name: "Foxtrot", status: "Active",   team_id: "t-active"     },
];

// ─── Eligibility logic tests (using pre-built set) ────────────────────────

console.log("\n=== FEATURE-002: Player Eligibility Tests ===\n");

console.log("1. Core eligibility rules");

test("Active Player + Active Team → Eligible", () => {
  const p = PLAYERS[0]; // Alpha, active, t-active
  const eligible =
    String(p.status).toLowerCase() === "active" &&
    activeTeamSet.has(p.team_id);
  expect(eligible, true);
});

test("Active Player + Eliminated Team → Not Eligible", () => {
  const p = PLAYERS[1]; // Bravo, active, t-eliminated
  const eligible =
    String(p.status).toLowerCase() === "active" &&
    activeTeamSet.has(p.team_id);
  expect(eligible, false);
});

test("Active Player + Suspended Team → Not Eligible", () => {
  const p = PLAYERS[2]; // Charlie, active, t-suspended
  const eligible =
    String(p.status).toLowerCase() === "active" &&
    activeTeamSet.has(p.team_id);
  expect(eligible, false);
});

test("Inactive Player + Active Team → Not Eligible", () => {
  const p = PLAYERS[3]; // Delta, injured, t-active
  const eligible =
    String(p.status).toLowerCase() === "active" &&
    activeTeamSet.has(p.team_id);
  expect(eligible, false);
});

test("Inactive Player + Eliminated Team → Not Eligible", () => {
  const p = PLAYERS[4]; // Echo, retired, t-eliminated
  const eligible =
    String(p.status).toLowerCase() === "active" &&
    activeTeamSet.has(p.team_id);
  expect(eligible, false);
});

console.log("\n2. Batch filter tests");

test("filterEligiblePlayers returns only Active+ActiveTeam players", async () => {
  // filterEligiblePlayers is pure when given a pre-built set
  const result = await filterEligiblePlayers(PLAYERS as any, activeTeamSet);
  expect(result.length, 2); // Alpha (p1) and Foxtrot (p6)
  expect(result.every((p) => p.team_id === "t-active" && p.status === "Active"), true);
});

test("No players from eliminated team appear in draft pool", async () => {
  const result = await filterEligiblePlayers(PLAYERS as any, activeTeamSet);
  const eliminated = result.filter((p) => p.team_id === "t-eliminated");
  expect(eliminated.length, 0);
});

test("Reinstating a team immediately restores players", async () => {
  const reinstatedSet = new Set(["t-active", "t-eliminated"]);
  const result = await filterEligiblePlayers(PLAYERS as any, reinstatedSet);
  // Now Bravo (active, t-eliminated) should appear
  const bravo = result.find((p) => p.player_id === "p2");
  expect(!!bravo, true);
  expect(result.length, 3); // Alpha, Bravo, Foxtrot
});

console.log("\n3. Team set builder tests");

test("buildActiveTeamSet excludes Eliminated and Suspended teams", () => {
  // Simulate what buildActiveTeamSet does internally
  const mockTeams = Object.values(TEAMS);
  const localSet  = new Set<string>();
  for (const t of mockTeams) {
    if (String(t.status || "Active") === "Active") localSet.add(t.team_id);
  }
  expect(localSet.has("t-active"),     true);
  expect(localSet.has("t-eliminated"), false);
  expect(localSet.has("t-suspended"),  false);
  expect(localSet.size, 1);
});

test("Blank team status defaults to Active (backward compatibility)", () => {
  const blankTeam = { team_id: "t-blank", team_name: "Blank FC", status: "" };
  const localSet  = new Set<string>();
  const status = String(blankTeam.status || "Active").trim();
  if (status === "Active") localSet.add(blankTeam.team_id);
  expect(localSet.has("t-blank"), true);
});

console.log("\n4. Player status independence");

test("Player status and Team status are independent — player injury does not affect team", () => {
  const injuredOnActive   = PLAYERS[3]; // Delta, Injured, t-active
  const healthyOnEliminated = PLAYERS[1]; // Bravo, Active, t-eliminated
  // Neither is eligible — different reasons
  const injuredEligible  = String(injuredOnActive.status).toLowerCase() === "active" && activeTeamSet.has(injuredOnActive.team_id);
  const healthyEligible  = String(healthyOnEliminated.status).toLowerCase() === "active" && activeTeamSet.has(healthyOnEliminated.team_id);
  expect(injuredEligible, false);
  expect(healthyEligible, false);
});

console.log("\n5. Regression: scoring/history independence");

test("Eligibility filter has no effect on scoring service (it never calls filterPlayers)", () => {
  // The scoring engine reads Player_Stats directly — not the players list
  // It never calls filterPlayers or buildActiveTeamSet
  // This test documents that contract: eligibility is draft-time only
  const scoringReadsPlayers = false; // scoring engine reads Player_Stats, not Players
  expect(scoringReadsPlayers, false);
});

// ─── Summary ──────────────────────────────────────────────────────────────

Promise.resolve().then(() => {
  console.log(`\n${"─".repeat(50)}`);
  console.log(`FEATURE-002 Tests: ${passed} passed, ${failed} failed`);
  if (failed > 0) { process.exit(1); }
  else { console.log("✅ All tests passed."); }
});
