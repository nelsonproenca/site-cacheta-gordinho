// RLS isolation suite called out in the engineering plan (M1, risk #1):
// proves an admin/moderator of account A can never read or write account B's
// protected data, and that role gating (owner vs moderator) and the
// no-direct-write tables (tiktok_accounts, players) hold. Runs against the
// real linked Supabase project — no local Postgres in this environment (see
// CLAUDE.md) — so every assertion is a network round-trip against real RLS
// policies, not a mock.
//
// Run with: npm run test:rls
//
// Complements, doesn't replace, scripts/smoke-test.ts (which exercises the
// happy-path data flow + ranking math end to end).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../lib/supabase/database.types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!url || !anonKey || !serviceKey) {
  throw new Error("Missing Supabase env vars — run with `npm run test:rls` (loads .env.local).");
}

const service = createClient<Database>(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const suffix = Date.now().toString(36);
const password = "rls-test-password-123";

type TestUser = { email: string; id: string; client: SupabaseClient<Database> };

async function createSignedInUser(label: string): Promise<TestUser> {
  const email = `rlstest-${label}-${suffix}@example.com`;
  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name: `RLS Test ${label}` },
  });
  if (error || !data.user) throw new Error(`create user ${label} failed: ${error?.message}`);

  // New admins default to 'pending' (20260718000018_admins_approval) and
  // can't call create_tiktok_account until an existing admin approves them
  // — this suite tests cross-tenant isolation, not the approval gate
  // itself, so fast-forward every test admin straight to 'approved'.
  const { error: approveErr } = await service.from("admins").update({ status: "approved" }).eq("id", data.user.id);
  if (approveErr) throw new Error(`approve user ${label} failed: ${approveErr.message}`);

  const client = createClient<Database>(url, anonKey);
  const { error: signInErr } = await client.auth.signInWithPassword({ email, password });
  if (signInErr) throw new Error(`signIn ${label} failed: ${signInErr.message}`);

  return { email, id: data.user.id, client };
}

let anon: SupabaseClient<Database>;
let ownerA: TestUser;
let ownerB: TestUser;
let moderatorA: TestUser;

let accountA: { id: string; handle: string };
let accountB: { id: string; handle: string };
let ruleB: { id: string };
let periodB: { id: string; status: string };
let sessionA: { id: string };
let sessionB: { id: string };
let matchA: { id: string };
let matchB: { id: string };
let playerX: { id: string };

beforeAll(async () => {
  anon = createClient<Database>(url, anonKey);

  ownerA = await createSignedInUser("owner-a");
  ownerB = await createSignedInUser("owner-b");
  moderatorA = await createSignedInUser("moderator-a");

  const handleA = `rlstest_a_${suffix}`;
  const handleB = `rlstest_b_${suffix}`;

  const { data: accA, error: accAErr } = await ownerA.client.rpc("create_tiktok_account", {
    p_handle: handleA,
    p_display_name: "RLS Test Account A",
  });
  if (accAErr || !accA) throw new Error(`create account A failed: ${accAErr?.message}`);
  accountA = { id: accA.id, handle: handleA };

  const { data: accB, error: accBErr } = await ownerB.client.rpc("create_tiktok_account", {
    p_handle: handleB,
    p_display_name: "RLS Test Account B",
  });
  if (accBErr || !accB) throw new Error(`create account B failed: ${accBErr?.message}`);
  accountB = { id: accB.id, handle: handleB };

  // Owner A grants moderator A access — also a positive control that the
  // owner write-path on admin_account_access actually works.
  const { error: addModErr } = await ownerA.client
    .from("admin_account_access")
    .insert({ admin_id: moderatorA.id, tiktok_account_id: accountA.id, role: "moderator" });
  if (addModErr) throw new Error(`owner A failed to add moderator: ${addModErr.message}`);

  // scoring_rules is global now (20260725000028), not seeded per account —
  // just grab any existing rule (the canonical 4 always exist) to use as a
  // valid scoring_rule_id below; the name "ruleB" is legacy, kept to avoid
  // touching every call site that still reads it.
  const { data: rulesB, error: rulesBErr } = await ownerB.client
    .from("scoring_rules")
    .select("id")
    .limit(1)
    .single();
  if (rulesBErr || !rulesB) throw new Error(`fetch a scoring_rule failed: ${rulesBErr?.message}`);
  ruleB = rulesB;

  const { data: perB, error: perBErr } = await ownerB.client
    .from("score_periods")
    .insert({ tiktok_account_id: accountB.id, label: "Período B", type: "season", starts_at: "2026-01-01" })
    .select("id, status")
    .single();
  if (perBErr || !perB) throw new Error(`create period B failed: ${perBErr?.message}`);
  periodB = perB;

  const { data: sesA, error: sesAErr } = await ownerA.client
    .from("live_sessions")
    .insert({ tiktok_account_id: accountA.id, session_date: new Date().toISOString(), created_by: ownerA.id })
    .select("id")
    .single();
  if (sesAErr || !sesA) throw new Error(`create session A failed: ${sesAErr?.message}`);
  sessionA = sesA;

  const { data: sesB, error: sesBErr } = await ownerB.client
    .from("live_sessions")
    .insert({ tiktok_account_id: accountB.id, session_date: new Date().toISOString(), created_by: ownerB.id })
    .select("id")
    .single();
  if (sesBErr || !sesB) throw new Error(`create session B failed: ${sesBErr?.message}`);
  sessionB = sesB;

  const { data: player, error: playerErr } = await service
    .from("players")
    .insert({ display_name: "RLS Test Player", tiktok_handle: `rlstest_player_${suffix}` })
    .select("id")
    .single();
  if (playerErr || !player) throw new Error(`create test player failed: ${playerErr?.message}`);
  playerX = player;

  const { data: mA, error: mAErr } = await ownerA.client
    .from("matches")
    .insert({ tiktok_account_id: accountA.id, live_session_id: sessionA.id })
    .select("id")
    .single();
  if (mAErr || !mA) throw new Error(`create match A failed: ${mAErr?.message}`);
  matchA = mA;

  const { data: mB, error: mBErr } = await ownerB.client
    .from("matches")
    .insert({ tiktok_account_id: accountB.id, live_session_id: sessionB.id })
    .select("id")
    .single();
  if (mBErr || !mB) throw new Error(`create match B failed: ${mBErr?.message}`);
  matchB = mB;
});

afterAll(async () => {
  const matchIds = [matchA, matchB].filter((m): m is { id: string } => !!m).map((m) => m.id);
  if (matchIds.length > 0) {
    await service.from("match_results").delete().in("match_id", matchIds);
  }

  if (accountA) await service.from("tiktok_accounts").delete().eq("id", accountA.id);
  if (accountB) await service.from("tiktok_accounts").delete().eq("id", accountB.id);
  if (playerX) await service.from("players").delete().eq("id", playerX.id);

  const emails = [ownerA?.email, ownerB?.email, moderatorA?.email].filter((e): e is string => !!e);
  if (emails.length > 0) {
    const { data: users } = await service.auth.admin.listUsers();
    const toDelete = (users?.users ?? []).filter((u) => u.email && emails.includes(u.email));
    for (const u of toDelete) {
      await service.auth.admin.deleteUser(u.id);
    }
  }

  // Verify cleanup actually took instead of trusting silent "no error".
  const { data: leftover } = await service
    .from("tiktok_accounts")
    .select("id")
    .in("handle", [accountA?.handle, accountB?.handle].filter((h): h is string => !!h));
  expect(leftover ?? []).toHaveLength(0);
});

describe("tiktok_accounts", () => {
  it("has no direct insert policy — only create_tiktok_account() can create one", async () => {
    const { error } = await ownerA.client
      .from("tiktok_accounts")
      .insert({ handle: `direct_insert_${suffix}`, display_name: "Should not work" });
    expect(error).not.toBeNull();
  });

  it("anon can read accounts (public select)", async () => {
    const { data, error } = await anon.from("tiktok_accounts").select("id").eq("id", accountA.id);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });
});

// scoring_rules is global (20260725000028) — no more per-tenant isolation to
// test here, only that a regular admin (owner or moderator, super admin or
// not doesn't matter for has_account_access anymore) can't write it at all.
// Known gap: the "a super admin CAN write" positive control isn't covered
// here (would need a dedicated super-admin fixture, out of scope for this
// pass) — verified instead with a throwaway script when this policy was
// introduced, same pattern as every other feature in this codebase.
describe("scoring_rules", () => {
  it("a regular owner cannot insert a scoring_rule (super admin only now)", async () => {
    const { error } = await ownerA.client.from("scoring_rules").insert({ name: "Owner hack", points: 1 });
    expect(error).not.toBeNull();
  });

  it("a regular owner cannot update a scoring_rule", async () => {
    // RLS silently filters non-matching rows on UPDATE instead of erroring —
    // must verify via the service client that nothing actually changed.
    await ownerA.client.from("scoring_rules").update({ points: -999 }).eq("id", ruleB.id);
    const { data: check } = await service.from("scoring_rules").select("points").eq("id", ruleB.id).single();
    expect(check?.points).not.toBe(-999);
  });

  it("a regular owner cannot delete a scoring_rule", async () => {
    await ownerA.client.from("scoring_rules").delete().eq("id", ruleB.id);
    const { data: check } = await service.from("scoring_rules").select("id").eq("id", ruleB.id).maybeSingle();
    expect(check).not.toBeNull();
  });

  it("anon cannot write scoring_rules", async () => {
    const { error } = await anon.from("scoring_rules").insert({ name: "anon hack", points: 1 });
    expect(error).not.toBeNull();
  });

  it("anon can read scoring_rules (public select)", async () => {
    const { data, error } = await anon.from("scoring_rules").select("id").limit(1);
    expect(error).toBeNull();
    expect(data?.length).toBeGreaterThan(0);
  });
});

describe("score_periods", () => {
  it("owner A cannot insert a score_period for account B", async () => {
    // status: "closed" sidesteps the one-open-period-per-account unique
    // index (periodB is already open) so this isolates the RLS check —
    // without it, the unique constraint could mask a broken RLS policy.
    const { error } = await ownerA.client.from("score_periods").insert({
      tiktok_account_id: accountB.id,
      label: "hack",
      type: "season",
      starts_at: "2026-01-01",
      status: "closed",
    });
    expect(error).not.toBeNull();
  });

  it("owner A cannot close account B's score_period", async () => {
    await ownerA.client.from("score_periods").update({ status: "closed" }).eq("id", periodB.id);
    const { data: check } = await service.from("score_periods").select("status").eq("id", periodB.id).single();
    expect(check?.status).toBe("open");
  });
});

describe("live_sessions", () => {
  it("owner A cannot open a live_session under account B", async () => {
    const { error } = await ownerA.client.from("live_sessions").insert({
      tiktok_account_id: accountB.id,
      session_date: new Date().toISOString(),
      created_by: ownerA.id,
    });
    expect(error).not.toBeNull();
  });

  it("owner A cannot close account B's live_session", async () => {
    await ownerA.client.from("live_sessions").update({ status: "closed" }).eq("id", sessionB.id);
    const { data: check } = await service.from("live_sessions").select("status").eq("id", sessionB.id).single();
    expect(check?.status).toBe("open");
  });
});

describe("live_participants", () => {
  it("owner A cannot add a participant to account B's live_session", async () => {
    const { error } = await ownerA.client
      .from("live_participants")
      .insert({ live_session_id: sessionB.id, player_id: playerX.id });
    expect(error).not.toBeNull();
  });
});

describe("matches", () => {
  it("owner A cannot insert a match under account B", async () => {
    const { error } = await ownerA.client
      .from("matches")
      .insert({ tiktok_account_id: accountB.id, live_session_id: sessionB.id });
    expect(error).not.toBeNull();
  });

  it("owner A cannot spoof tiktok_account_id=A while pointing live_session_id at account B's session", async () => {
    // has_account_access(A) alone would pass for owner A — this only fails
    // because of the matches_validate_account trigger (migration
    // 20260717000014), which this test exists specifically to pin down.
    const { error } = await ownerA.client
      .from("matches")
      .insert({ tiktok_account_id: accountA.id, live_session_id: sessionB.id });
    expect(error).not.toBeNull();
  });
});

describe("match_results", () => {
  it("owner A cannot record a result against account B's match", async () => {
    const { error } = await ownerA.client.from("match_results").insert({
      match_id: matchB.id,
      player_id: playerX.id,
      scoring_rule_id: ruleB.id,
      points_awarded: 1,
      recorded_by: ownerA.id,
    });
    expect(error).not.toBeNull();
  });
});

describe("admin_account_access", () => {
  it("owner A cannot see account B's admin_account_access rows", async () => {
    const { data } = await ownerA.client
      .from("admin_account_access")
      .select("*")
      .eq("tiktok_account_id", accountB.id);
    expect(data).toHaveLength(0);
  });

  it("moderator A (non-owner) cannot add another moderator to account A", async () => {
    const { error } = await moderatorA.client
      .from("admin_account_access")
      .insert({ admin_id: ownerB.id, tiktok_account_id: accountA.id, role: "moderator" });
    expect(error).not.toBeNull();
  });

  it("moderator A cannot write scoring_rules either (super admin only, not has_account_access)", async () => {
    const { error } = await moderatorA.client.from("scoring_rules").insert({ name: "Moderator hack", points: 1 });
    expect(error).not.toBeNull();
  });
});

describe("players", () => {
  it("an authenticated admin cannot insert players directly (must go through the service-role Server Action)", async () => {
    const { error } = await ownerA.client
      .from("players")
      .insert({ display_name: "Direct insert", tiktok_handle: `direct_${suffix}` });
    expect(error).not.toBeNull();
  });

  it("anon cannot insert players directly", async () => {
    const { error } = await anon
      .from("players")
      .insert({ display_name: "Anon insert", tiktok_handle: `anon_${suffix}` });
    expect(error).not.toBeNull();
  });
});

// Fase 6 (specs/001-cacheta-jogo-online): jogo de Cacheta jogável — domínio
// isolado, com sua própria noção de identidade (players, via
// current_player_id(), não admins) e fixture própria, aninhada neste mesmo
// arquivo em vez de duplicar o suite inteiro. Extensão deferida para o fim
// da fase (T033), por preferência já registrada do usuário — ver
// feedback_defer_tests_to_phase_end — em vez de uma suite por migration.
describe("cacheta game", () => {
  type CachetaPlayer = { authUserId: string; playerId: string; client: SupabaseClient<Database> };
  const cachetaSuffix = `cacheta_${suffix}`;

  let playerA: CachetaPlayer;
  let playerB: CachetaPlayer;
  let outsider: CachetaPlayer;
  let tableId: string;

  async function createCachetaPlayer(label: string): Promise<CachetaPlayer> {
    const email = `rlstest-${cachetaSuffix}-${label}@example.com`;
    const { data: created, error: createErr } = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { actor_type: "player" },
    });
    if (createErr || !created.user) throw new Error(`create cacheta player ${label} failed: ${createErr?.message}`);

    const { data: player, error: playerErr } = await service
      .from("players")
      .insert({ auth_user_id: created.user.id, tiktok_handle: `${cachetaSuffix}_${label}`, display_name: `Cacheta Test ${label}` })
      .select("id")
      .single();
    if (playerErr || !player) throw new Error(`players insert for ${label} failed: ${playerErr?.message}`);

    const client = createClient<Database>(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { error: signInErr } = await client.auth.signInWithPassword({ email, password });
    if (signInErr) throw new Error(`signIn cacheta player ${label} failed: ${signInErr.message}`);

    return { authUserId: created.user.id, playerId: player.id as string, client };
  }

  beforeAll(async () => {
    playerA = await createCachetaPlayer("a");
    playerB = await createCachetaPlayer("b");
    outsider = await createCachetaPlayer("outsider");

    const { data: createdTableId, error: createErr } = await playerA.client.rpc("create_cacheta_table", {
      p_mode: "online",
      p_max_seats: 2,
    });
    if (createErr || !createdTableId) throw new Error(`create_cacheta_table failed: ${createErr?.message}`);
    tableId = createdTableId as string;

    const { error: joinErr } = await playerB.client.rpc("join_cacheta_table", { p_table_id: tableId });
    if (joinErr) throw new Error(`join_cacheta_table failed: ${joinErr.message}`);

    const { error: startErr } = await playerA.client.rpc("start_cacheta_game", { p_table_id: tableId });
    if (startErr) throw new Error(`start_cacheta_game failed: ${startErr.message}`);
  });

  afterAll(async () => {
    if (tableId) {
      await service.from("cacheta_game_results").delete().eq("table_id", tableId);
      await service.from("cacheta_moves").delete().eq("table_id", tableId);
      await service.from("cacheta_hands").delete().eq("table_id", tableId);
      await service.from("cacheta_table_decks").delete().eq("table_id", tableId);
      await service.from("cacheta_table_seats").delete().eq("table_id", tableId);
      await service.from("cacheta_tables").delete().eq("id", tableId);
    }
    for (const p of [playerA, playerB, outsider]) {
      if (p?.playerId) await service.from("players").delete().eq("id", p.playerId);
      if (p?.authUserId) await service.auth.admin.deleteUser(p.authUserId);
    }
  });

  describe("cacheta_tables", () => {
    it("a player with no seat cannot read the table", async () => {
      const { data } = await outsider.client.from("cacheta_tables").select("id").eq("id", tableId);
      expect(data).toHaveLength(0);
    });

    it("a seated player can read the table", async () => {
      const { data, error } = await playerA.client.from("cacheta_tables").select("id").eq("id", tableId);
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
    });

    it("anon cannot read the table (no public select)", async () => {
      // current_player_id() (used inside the RLS policy) is revoked from
      // anon entirely (20260801000034) — anon hits a permission-denied error
      // evaluating the policy itself, not a graceful empty result set.
      const { data, error } = await anon.from("cacheta_tables").select("id").eq("id", tableId);
      expect(data ?? []).toHaveLength(0);
      expect(error).not.toBeNull();
    });

    it("has no direct insert/update policy — only the RPCs mutate it", async () => {
      const { error } = await playerA.client.from("cacheta_tables").update({ status: "finished" }).eq("id", tableId);
      // RLS silently filters the row on UPDATE instead of erroring — the
      // real assertion is that it has no effect (same pattern used above
      // for scoring_rules/score_periods/live_sessions).
      const { data: check } = await service.from("cacheta_tables").select("status").eq("id", tableId).single();
      expect(error).toBeNull();
      expect(check?.status).toBe("playing");
    });
  });

  describe("cacheta_table_seats", () => {
    it("a player with no seat cannot read the table's seats", async () => {
      const { data } = await outsider.client.from("cacheta_table_seats").select("id").eq("table_id", tableId);
      expect(data).toHaveLength(0);
    });

    it("a seated player sees both seats at the table", async () => {
      const { data, error } = await playerA.client.from("cacheta_table_seats").select("id").eq("table_id", tableId);
      expect(error).toBeNull();
      expect(data).toHaveLength(2);
    });

    it("has no direct insert policy — only create_cacheta_table()/join_cacheta_table() create seats", async () => {
      const { error } = await outsider.client
        .from("cacheta_table_seats")
        .insert({ table_id: tableId, seat_no: 99, player_id: outsider.playerId });
      expect(error).not.toBeNull();
    });
  });

  describe("cacheta_hands", () => {
    it("player A cannot read player B's hand", async () => {
      const { data: seatB } = await service.from("cacheta_table_seats").select("id").eq("table_id", tableId).eq("player_id", playerB.playerId).single();
      const { data } = await playerA.client.from("cacheta_hands").select("cards").eq("seat_id", seatB!.id);
      expect(data).toHaveLength(0);
    });

    it("player A only ever sees exactly one hand row for the table — their own", async () => {
      const { data, error } = await playerA.client.from("cacheta_hands").select("seat_id").eq("table_id", tableId);
      expect(error).toBeNull();
      expect(data).toHaveLength(1);

      const { data: seatA } = await service.from("cacheta_table_seats").select("id").eq("table_id", tableId).eq("player_id", playerA.playerId).single();
      expect(data?.[0]?.seat_id).toBe(seatA!.id);
    });

    it("a non-seated player cannot read any hand at this table", async () => {
      const { data } = await outsider.client.from("cacheta_hands").select("cards").eq("table_id", tableId);
      expect(data).toHaveLength(0);
    });

    it("has no direct write policy — only the RPCs/Server Action mutate hands", async () => {
      const { data: seatA } = await service.from("cacheta_table_seats").select("id").eq("table_id", tableId).eq("player_id", playerA.playerId).single();
      const { error } = await playerA.client.from("cacheta_hands").update({ cards: [] }).eq("seat_id", seatA!.id);
      // RLS silently filters the row on UPDATE instead of erroring — the
      // real assertion is that the real data is untouched (same pattern as
      // scoring_rules/score_periods above), not just that no error came back.
      const { data: check } = await service.from("cacheta_hands").select("cards").eq("seat_id", seatA!.id).single();
      expect(error).toBeNull();
      expect((check?.cards as unknown as unknown[]).length).toBe(9);
    });
  });

  describe("cacheta_table_decks", () => {
    it("has no select policy at all — not even the table's own players can read the monte", async () => {
      const { data: seated } = await playerA.client.from("cacheta_table_decks").select("monte").eq("table_id", tableId);
      expect(seated ?? []).toHaveLength(0);

      const { data: anonRead } = await anon.from("cacheta_table_decks").select("monte").eq("table_id", tableId);
      expect(anonRead ?? []).toHaveLength(0);
    });
  });

  describe("cacheta_moves", () => {
    it("a seated player can read the move log", async () => {
      const { data, error } = await playerA.client.from("cacheta_moves").select("id").eq("table_id", tableId);
      expect(error).toBeNull();
      expect(data).not.toBeNull();
    });

    it("a non-seated player cannot read the move log", async () => {
      const { data } = await outsider.client.from("cacheta_moves").select("id").eq("table_id", tableId);
      expect(data).toHaveLength(0);
    });

    it("has no direct insert policy — only the RPCs/Server Action log moves", async () => {
      const { data: seatA } = await service.from("cacheta_table_seats").select("id").eq("table_id", tableId).eq("player_id", playerA.playerId).single();
      const { error } = await playerA.client.from("cacheta_moves").insert({ table_id: tableId, seat_id: seatA!.id, type: "discard" });
      expect(error).not.toBeNull();
    });
  });

  describe("cacheta_game_results", () => {
    it("anon can read game results (public select, feeds /jogar/ranking)", async () => {
      const { error } = await anon.from("cacheta_game_results").select("id").eq("table_id", tableId);
      expect(error).toBeNull();
    });

    it("has no direct insert policy for authenticated players — only the Server Action writes it", async () => {
      const { error } = await playerA.client.from("cacheta_game_results").insert({
        table_id: tableId,
        winner_player_id: playerA.playerId,
        combination_type: "batida_normal",
        points_awarded: 999,
      });
      expect(error).not.toBeNull();
    });

    it("anon cannot insert game results either", async () => {
      const { error } = await anon.from("cacheta_game_results").insert({
        table_id: tableId,
        winner_player_id: playerA.playerId,
        combination_type: "batida_normal",
        points_awarded: 999,
      } as never);
      expect(error).not.toBeNull();
    });
  });
});
