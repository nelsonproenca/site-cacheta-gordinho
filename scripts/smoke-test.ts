// Manual smoke test for the Fase 1 (MVP) data flow and RLS isolation.
// Exercises the same operations as the Server Actions in lib/actions/*
// directly against the real linked Supabase project, then cleans up after
// itself. Run with:
//   node --env-file=.env.local --import tsx scripts/smoke-test.ts
//
// This is not a substitute for the Vitest RLS suite called out in the
// engineering plan (M6, risk #1) — it's a quick, repeatable manual check
// that the schema/RLS/ranking math actually work end to end.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../lib/supabase/database.types";
import { getRanking } from "../lib/scoring/get-ranking";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!url || !anonKey || !serviceKey) {
  throw new Error("Missing Supabase env vars — run with node --env-file=.env.local --import tsx scripts/smoke-test.ts");
}

const service = createClient<Database>(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const suffix = Date.now().toString(36);
const ownerEmail = `smoketest-owner-${suffix}@example.com`;
const outsiderEmail = `smoketest-outsider-${suffix}@example.com`;
const password = "smoke-test-password-123";
const handle = `smoketest_${suffix}`;

let ok = 0;
let fail = 0;

function assert(condition: unknown, message: string) {
  if (condition) {
    ok += 1;
    console.log(`  ✓ ${message}`);
  } else {
    fail += 1;
    console.error(`  ✗ ${message}`);
  }
}

async function signIn(email: string) {
  const client = createClient<Database>(url, anonKey);
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(`signIn(${email}) failed: ${error?.message}`);
  return client;
}

async function main() {
  console.log(`\nSetting up test admins (@${handle})...`);
  const { data: owner, error: ownerErr } = await service.auth.admin.createUser({
    email: ownerEmail,
    password,
    email_confirm: true,
    user_metadata: { name: "Smoke Test Owner" },
  });
  if (ownerErr || !owner.user) throw new Error(`create owner failed: ${ownerErr?.message}`);

  const { data: outsider, error: outsiderErr } = await service.auth.admin.createUser({
    email: outsiderEmail,
    password,
    email_confirm: true,
    user_metadata: { name: "Smoke Test Outsider" },
  });
  if (outsiderErr || !outsider.user) throw new Error(`create outsider failed: ${outsiderErr?.message}`);

  // New admins default to 'pending' (20260718000018_admins_approval) — the
  // owner needs to be 'approved' to call create_tiktok_account below.
  await service.from("admins").update({ status: "approved" }).eq("id", owner.user.id);

  const ownerClient = await signIn(ownerEmail);
  const outsiderClient = await signIn(outsiderEmail);
  const anonClient = createClient<Database>(url, anonKey);

  console.log("\n1. create_tiktok_account RPC");
  const { data: account, error: accountErr } = await ownerClient.rpc("create_tiktok_account", {
    p_handle: handle,
    p_display_name: "Smoke Test Account",
  });
  assert(!accountErr && account, `account created (${accountErr?.message ?? "ok"})`);
  const accountId = account!.id;

  // scoring_rules is global now (20260725000028) — create_tiktok_account no
  // longer seeds anything, just read whatever global rules already exist.
  const { data: rules } = await ownerClient
    .from("scoring_rules")
    .select("id, name, points")
    .order("points", { ascending: false });
  assert((rules?.length ?? 0) >= 4, `at least 4 global scoring rules exist (got ${rules?.length})`);
  const victoryLambreta = rules!.find((r) => r.points === 3)!;
  const victoryNormal = rules!.find((r) => r.points === 2)!;
  const defeatNormal = rules!.find((r) => r.points === -1)!;
  const defeatLambreta = rules!.find((r) => r.points === -3)!;

  console.log("\n2. players (service-role insert, mirrors createPlayer action)");
  const { data: playerA } = await service
    .from("players")
    .insert({ display_name: "Jogador A", tiktok_handle: `smoke_a_${suffix}` })
    .select("id")
    .single();
  const { data: playerB } = await service
    .from("players")
    .insert({ display_name: "Jogador B", tiktok_handle: `smoke_b_${suffix}` })
    .select("id")
    .single();
  assert(!!playerA && !!playerB, "2 players created");

  console.log("\n3. live session + participants");
  const { data: session } = await ownerClient
    .from("live_sessions")
    .insert({ tiktok_account_id: accountId, session_date: new Date().toISOString().slice(0, 10), created_by: owner.user.id })
    .select("id")
    .single();
  assert(!!session, "live session opened");

  await ownerClient.from("live_participants").insert([
    { live_session_id: session!.id, player_id: playerA!.id },
    { live_session_id: session!.id, player_id: playerB!.id },
  ]);

  console.log("\n4. record 3 match results with different scoring rules");
  const resultsToRecord = [
    { player: playerA!.id, rule: victoryLambreta },
    { player: playerB!.id, rule: defeatNormal },
    { player: playerA!.id, rule: victoryNormal },
  ];
  const recorded: { matchId: string; matchResultId: string; player: string }[] = [];
  for (const r of resultsToRecord) {
    const { data: match, error: matchErr } = await ownerClient
      .from("matches")
      .insert({ tiktok_account_id: accountId, live_session_id: session!.id })
      .select("id")
      .single();
    assert(!matchErr && match, `match created (${matchErr?.message ?? "ok"})`);
    const { data: result, error: resultErr } = await ownerClient
      .from("match_results")
      .insert({
        match_id: match!.id,
        player_id: r.player,
        scoring_rule_id: r.rule.id,
        points_awarded: r.rule.points,
        recorded_by: owner.user!.id,
      })
      .select("id")
      .single();
    assert(!resultErr, `match_result recorded (${resultErr?.message ?? "ok"})`);
    recorded.push({ matchId: match!.id, matchResultId: result!.id, player: r.player });
  }

  console.log("\n5. ranking aggregation (lib/scoring/get-ranking.ts)");
  const ranking = await getRanking(ownerClient, accountId);
  const a = ranking.find((r) => r.playerId === playerA!.id);
  const b = ranking.find((r) => r.playerId === playerB!.id);
  assert(a?.totalPoints === 5, `Jogador A total = 5 (lambreta +3, vitória normal +2) — got ${a?.totalPoints}`);
  assert(b?.totalPoints === -1, `Jogador B total = -1 (derrota normal) — got ${b?.totalPoints}`);
  assert(ranking[0]?.playerId === playerA!.id, "Jogador A ranked #1");

  console.log("\n6. RLS isolation — outsider admin (no admin_account_access row)");
  // scoring_rules is global and super-admin-only to write now — a regular
  // outsider is blocked the same way any non-super-admin would be, not
  // because of tenant isolation.
  const { error: outsiderWriteErr } = await outsiderClient
    .from("scoring_rules")
    .insert({ name: "hack", points: 999 });
  assert(!!outsiderWriteErr, `outsider (non-super-admin) blocked from writing scoring_rules (${outsiderWriteErr?.message})`);

  const { data: outsiderAccess } = await outsiderClient
    .from("admin_account_access")
    .select("*")
    .eq("tiktok_account_id", accountId);
  assert(outsiderAccess?.length === 0, "outsider cannot see admin_account_access rows for this account");

  console.log("\n7. RLS isolation — anonymous (unauthenticated)");
  const { data: anonRead } = await anonClient.from("scoring_rules").select("id");
  assert((anonRead?.length ?? 0) >= 4, "anon can read the global scoring_rules (public select)");

  const { error: anonWriteErr } = await anonClient.from("scoring_rules").insert({ name: "hack", points: 999 });
  assert(!!anonWriteErr, `anon blocked from writing scoring_rules (${anonWriteErr?.message})`);

  const { error: anonPlayerWriteErr } = await anonClient
    .from("players")
    .insert({ display_name: "hack", tiktok_handle: `hack_${suffix}` });
  assert(!!anonPlayerWriteErr, `anon blocked from writing players directly (${anonPlayerWriteErr?.message})`);

  // 8. mirrors lib/actions/lives.ts's updateMatchResult: log the previous
  // value to match_result_edits, then overwrite the match_result.
  console.log("\n8. update match result (updateMatchResult) + match_result_edits audit log");
  const editTarget = recorded[1]; // playerB, derrota normal (-1)
  const { data: beforeUpdate } = await ownerClient
    .from("match_results")
    .select("scoring_rule_id, points_awarded")
    .eq("id", editTarget.matchResultId)
    .single();
  assert(
    beforeUpdate?.scoring_rule_id === defeatNormal.id && beforeUpdate?.points_awarded === -1,
    `playerB result starts at derrota normal (-1) — got ${beforeUpdate?.points_awarded}`,
  );

  const { data: updateLogInsert, error: updateLogErr } = await ownerClient
    .from("match_result_edits")
    .insert({
      match_result_id: editTarget.matchResultId,
      action: "update",
      previous_scoring_rule_id: beforeUpdate!.scoring_rule_id,
      previous_points_awarded: beforeUpdate!.points_awarded,
      new_scoring_rule_id: defeatLambreta.id,
      new_points_awarded: defeatLambreta.points,
      edited_by: owner.user.id,
      tiktok_account_id: accountId,
    })
    .select("id")
    .single();
  assert(!updateLogErr, `update logged to match_result_edits (${updateLogErr?.message ?? "ok"})`);

  const { error: updateErr } = await ownerClient
    .from("match_results")
    .update({ scoring_rule_id: defeatLambreta.id, points_awarded: defeatLambreta.points })
    .eq("id", editTarget.matchResultId);
  assert(!updateErr, `match_result updated (${updateErr?.message ?? "ok"})`);

  const rankingAfterUpdate = await getRanking(ownerClient, accountId);
  const bAfterUpdate = rankingAfterUpdate.find((r) => r.playerId === playerB!.id);
  assert(
    bAfterUpdate?.totalPoints === -3,
    `Jogador B total = -3 after edit to derrota lambreta — got ${bAfterUpdate?.totalPoints}`,
  );

  const { data: updateLogRow } = await ownerClient
    .from("match_result_edits")
    .select("previous_points_awarded, new_points_awarded")
    .eq("id", updateLogInsert!.id)
    .single();
  assert(
    updateLogRow?.previous_points_awarded === -1 && updateLogRow?.new_points_awarded === -3,
    `match_result_edits row records -1 -> -3 (got ${updateLogRow?.previous_points_awarded} -> ${updateLogRow?.new_points_awarded})`,
  );

  // 9. mirrors lib/actions/lives.ts's removeParticipant: log the delete,
  // then drop the match_result, its owning match, and the live_participants row.
  console.log("\n9. remove participant (removeParticipant) + match_result_edits audit log");
  const { data: deleteLogInsert, error: deleteLogErr } = await ownerClient
    .from("match_result_edits")
    .insert({
      match_result_id: editTarget.matchResultId,
      action: "delete",
      previous_scoring_rule_id: defeatLambreta.id,
      previous_points_awarded: defeatLambreta.points,
      edited_by: owner.user.id,
      tiktok_account_id: accountId,
    })
    .select("id")
    .single();
  assert(!deleteLogErr, `delete logged to match_result_edits (${deleteLogErr?.message ?? "ok"})`);

  const { error: resultDeleteErr } = await ownerClient.from("match_results").delete().eq("id", editTarget.matchResultId);
  assert(!resultDeleteErr, `match_result deleted (${resultDeleteErr?.message ?? "ok"})`);

  const { error: matchDeleteErr } = await ownerClient.from("matches").delete().eq("id", editTarget.matchId);
  assert(!matchDeleteErr, `owning match deleted (${matchDeleteErr?.message ?? "ok"})`);

  const { error: participantDeleteErr } = await ownerClient
    .from("live_participants")
    .delete()
    .eq("live_session_id", session!.id)
    .eq("player_id", playerB!.id);
  assert(!participantDeleteErr, `live_participants row deleted (${participantDeleteErr?.message ?? "ok"})`);

  const rankingAfterDelete = await getRanking(ownerClient, accountId);
  assert(
    !rankingAfterDelete.some((r) => r.playerId === playerB!.id),
    "playerB no longer appears in ranking after removal",
  );
  assert(
    rankingAfterDelete.find((r) => r.playerId === playerA!.id)?.totalPoints === 5,
    "playerA total unaffected by playerB's removal",
  );

  const { data: participantLeftover } = await ownerClient
    .from("live_participants")
    .select("player_id")
    .eq("live_session_id", session!.id)
    .eq("player_id", playerB!.id)
    .maybeSingle();
  assert(!participantLeftover, "playerB's live_participants row is gone");

  const { data: editLog } = await ownerClient
    .from("match_result_edits")
    .select("id, action, match_result_id")
    .in("id", [updateLogInsert!.id, deleteLogInsert!.id]);
  const actions = (editLog ?? []).map((e) => e.action).sort();
  assert(
    actions.length === 2 && actions[0] === "delete" && actions[1] === "update",
    `match_result_edits kept both audit rows after the match_result was deleted — got [${actions.join(", ")}]`,
  );
  assert(
    (editLog ?? []).every((e) => e.match_result_id === null),
    "match_result_edits.match_result_id set null (on delete set null) once the match_result it describes is gone",
  );
}

async function cleanup() {
  console.log("\nCleaning up...");

  // match_results.scoring_rule_id has no ON DELETE CASCADE (by design — see
  // the comment in supabase/migrations/20260715000011_match_results.sql), so
  // it must be deleted explicitly before the account delete can cascade
  // through matches -> scoring_rules without hitting that FK.
  const { data: account } = await service.from("tiktok_accounts").select("id").eq("handle", handle).maybeSingle();
  if (account) {
    const { data: accountMatches } = await service.from("matches").select("id").eq("tiktok_account_id", account.id);
    const matchIds = (accountMatches ?? []).map((m) => m.id);
    if (matchIds.length > 0) {
      const { error: resultsDeleteErr } = await service.from("match_results").delete().in("match_id", matchIds);
      if (resultsDeleteErr) console.error(`  ! failed to delete test match_results: ${resultsDeleteErr.message}`);
    }
  }

  // cascades admin_account_access/scoring_rules/live_sessions/matches
  const { error: accountDeleteErr } = await service.from("tiktok_accounts").delete().eq("handle", handle);
  if (accountDeleteErr) console.error(`  ! failed to delete test account: ${accountDeleteErr.message}`);

  const { error: playersDeleteErr } = await service
    .from("players")
    .delete()
    .in("tiktok_handle", [`smoke_a_${suffix}`, `smoke_b_${suffix}`, `hack_${suffix}`]);
  if (playersDeleteErr) console.error(`  ! failed to delete test players: ${playersDeleteErr.message}`);

  const { data: list, error: listErr } = await service.auth.admin.listUsers();
  if (listErr) {
    console.error(`  ! failed to list users for cleanup: ${listErr.message}`);
  } else {
    const testUsers = list.users.filter((u) => u.email === ownerEmail || u.email === outsiderEmail);
    for (const u of testUsers) {
      const { error: deleteUserErr } = await service.auth.admin.deleteUser(u.id);
      if (deleteUserErr) console.error(`  ! failed to delete test user ${u.email}: ${deleteUserErr.message}`);
    }
  }

  // Verify cleanup actually took — don't trust a silent "no error" alone.
  const { data: leftover } = await service.from("tiktok_accounts").select("id").eq("handle", handle).maybeSingle();
  if (leftover) {
    fail += 1;
    console.error(`  ✗ test account @${handle} still exists after cleanup`);
  }

  console.log("Cleanup done.");
}

main()
  .catch((err) => {
    fail += 1;
    console.error("\nFATAL:", err);
  })
  .finally(async () => {
    await cleanup();
    console.log(`\n${ok} passed, ${fail} failed`);
    process.exit(fail > 0 ? 1 : 0);
  });
