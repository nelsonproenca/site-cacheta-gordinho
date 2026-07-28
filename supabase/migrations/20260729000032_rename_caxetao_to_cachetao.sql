-- Renames every "caxetao" identifier in the schema to "cachetao" — tables,
-- columns, the constraints/index/policies named after them, the
-- auto-generated FK constraint names, and the three trigger function bodies
-- that hardcode "caxetao_events"/"caxetao_event_id" as literal SQL text
-- (unlike CHECK constraints and RLS policy expressions, which Postgres
-- re-deparses from parsed trees and so adapt to a column rename
-- automatically — plpgsql function bodies are just stored text and don't).
-- Trigger "of column" lists (e.g. cross_account_matches_check_accounts)
-- also don't need touching for the same reason: they bind by attnum, not name.

alter table public.caxetao_events rename to cachetao_events;
alter table public.caxetao_registrations rename to cachetao_registrations;

alter table public.cachetao_registrations rename column caxetao_event_id to cachetao_event_id;
alter table public.matches rename column caxetao_event_id to cachetao_event_id;
alter table public.cross_account_matches rename column caxetao_event_id to cachetao_event_id;
alter table public.cross_account_matches rename column opponent_caxetao_event_id to opponent_cachetao_event_id;
alter table public.partidas rename column caxetao_event_id to cachetao_event_id;
alter table public.partidas rename column opponent_caxetao_event_id to opponent_cachetao_event_id;

alter table public.cachetao_events rename constraint caxetao_events_closes_at_required_for_time to cachetao_events_closes_at_required_for_time;
alter table public.cachetao_events rename constraint caxetao_events_max_principals_required_for_count to cachetao_events_max_principals_required_for_count;
alter table public.cachetao_events rename constraint caxetao_events_max_principals_positive to cachetao_events_max_principals_positive;
alter table public.cachetao_events rename constraint caxetao_events_max_substitutes_non_negative to cachetao_events_max_substitutes_non_negative;
alter table public.cachetao_events rename constraint caxetao_events_closes_after_opens to cachetao_events_closes_after_opens;
alter table public.cachetao_registrations rename constraint caxetao_registrations_queue_position_only_for_substitutes to cachetao_registrations_queue_position_only_for_substitutes;

alter index public.caxetao_registrations_queue_position_unique rename to cachetao_registrations_queue_position_unique;

alter table public.cachetao_registrations rename constraint caxetao_registrations_caxetao_event_id_fkey to cachetao_registrations_cachetao_event_id_fkey;
alter table public.matches rename constraint matches_caxetao_event_id_fkey to matches_cachetao_event_id_fkey;
alter table public.cross_account_matches rename constraint cross_account_matches_caxetao_event_id_fkey to cross_account_matches_cachetao_event_id_fkey;
alter table public.cross_account_matches rename constraint cross_account_matches_opponent_caxetao_event_id_fkey to cross_account_matches_opponent_cachetao_event_id_fkey;
alter table public.partidas rename constraint partidas_caxetao_event_id_fkey to partidas_cachetao_event_id_fkey;
alter table public.partidas rename constraint partidas_opponent_caxetao_event_id_fkey to partidas_opponent_cachetao_event_id_fkey;

alter policy "caxetao_events_select_public" on public.cachetao_events rename to "cachetao_events_select_public";
alter policy "caxetao_events_write_admin" on public.cachetao_events rename to "cachetao_events_write_admin";
alter policy "caxetao_registrations_select_public" on public.cachetao_registrations rename to "cachetao_registrations_select_public";
alter policy "caxetao_registrations_write_admin" on public.cachetao_registrations rename to "cachetao_registrations_write_admin";

create or replace function public.matches_validate_account()
returns trigger
language plpgsql
as $$
declare
  v_source_account uuid;
begin
  if new.live_session_id is not null then
    select tiktok_account_id into v_source_account
    from public.live_sessions
    where id = new.live_session_id;
  else
    select tiktok_account_id into v_source_account
    from public.cachetao_events
    where id = new.cachetao_event_id;
  end if;

  if v_source_account is null or v_source_account <> new.tiktok_account_id then
    raise exception 'matches.tiktok_account_id must match the source (live_session or cachetao_event) account for match %', new.id;
  end if;

  return new;
end;
$$;

create or replace function public.partidas_validate()
returns trigger
language plpgsql
as $$
declare
  v_account_a uuid;
  v_account_b uuid;
begin
  if new.live_session_id is not null then
    select tiktok_account_id into v_account_a from public.live_sessions where id = new.live_session_id;
  else
    select tiktok_account_id into v_account_a from public.cachetao_events where id = new.cachetao_event_id;
  end if;

  if new.opponent_live_session_id is not null then
    select tiktok_account_id into v_account_b from public.live_sessions where id = new.opponent_live_session_id;
  else
    select tiktok_account_id into v_account_b from public.cachetao_events where id = new.opponent_cachetao_event_id;
  end if;

  if v_account_a is null or v_account_a <> new.account_a_id then
    raise exception 'partidas.account_a_id must match its source account';
  end if;
  if v_account_b is null or v_account_b <> new.account_b_id then
    raise exception 'partidas.account_b_id must match its source account';
  end if;

  return new;
end;
$$;

create or replace function public.cross_account_matches_validate()
returns trigger
language plpgsql
as $$
declare
  v_account uuid;
  v_opponent_account uuid;
begin
  if new.live_session_id is not null then
    select tiktok_account_id into v_account from public.live_sessions where id = new.live_session_id;
  else
    select tiktok_account_id into v_account from public.cachetao_events where id = new.cachetao_event_id;
  end if;

  if new.opponent_live_session_id is not null then
    select tiktok_account_id into v_opponent_account from public.live_sessions where id = new.opponent_live_session_id;
  else
    select tiktok_account_id into v_opponent_account from public.cachetao_events where id = new.opponent_cachetao_event_id;
  end if;

  if v_account is null or v_account <> new.account_id then
    raise exception 'cross_account_matches.account_id must match its source account';
  end if;
  if v_opponent_account is null or v_opponent_account <> new.opponent_account_id then
    raise exception 'cross_account_matches.opponent_account_id must match its source account';
  end if;

  return new;
end;
$$;
