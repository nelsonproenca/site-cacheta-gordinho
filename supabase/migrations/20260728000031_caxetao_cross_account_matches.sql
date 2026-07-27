-- Lets a partida/confronto be sourced from a Caxetão event's registrations
-- instead of a live session's participants, per side independently — same
-- "exactly one source" pattern matches already uses for live_session_id vs
-- caxetao_event_id (20260717000017).
alter table public.partidas
  alter column live_session_id drop not null,
  alter column opponent_live_session_id drop not null,
  add column caxetao_event_id uuid references public.caxetao_events (id) on delete cascade,
  add column opponent_caxetao_event_id uuid references public.caxetao_events (id) on delete cascade;

alter table public.partidas
  add constraint partidas_exactly_one_source_a check (
    (live_session_id is not null)::int + (caxetao_event_id is not null)::int = 1
  ),
  add constraint partidas_exactly_one_source_b check (
    (opponent_live_session_id is not null)::int + (opponent_caxetao_event_id is not null)::int = 1
  );

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
    select tiktok_account_id into v_account_a from public.caxetao_events where id = new.caxetao_event_id;
  end if;

  if new.opponent_live_session_id is not null then
    select tiktok_account_id into v_account_b from public.live_sessions where id = new.opponent_live_session_id;
  else
    select tiktok_account_id into v_account_b from public.caxetao_events where id = new.opponent_caxetao_event_id;
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

-- Same for cross_account_matches: a confronto's two players may come from a
-- Caxetão event's registrations instead of a live's participants.
alter table public.cross_account_matches
  alter column live_session_id drop not null,
  alter column opponent_live_session_id drop not null,
  add column caxetao_event_id uuid references public.caxetao_events (id) on delete cascade,
  add column opponent_caxetao_event_id uuid references public.caxetao_events (id) on delete cascade;

alter table public.cross_account_matches
  add constraint cross_account_matches_exactly_one_source_a check (
    (live_session_id is not null)::int + (caxetao_event_id is not null)::int = 1
  ),
  add constraint cross_account_matches_exactly_one_source_b check (
    (opponent_live_session_id is not null)::int + (opponent_caxetao_event_id is not null)::int = 1
  );

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
    select tiktok_account_id into v_account from public.caxetao_events where id = new.caxetao_event_id;
  end if;

  if new.opponent_live_session_id is not null then
    select tiktok_account_id into v_opponent_account from public.live_sessions where id = new.opponent_live_session_id;
  else
    select tiktok_account_id into v_opponent_account from public.caxetao_events where id = new.opponent_caxetao_event_id;
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

drop trigger if exists cross_account_matches_check_accounts on public.cross_account_matches;
create trigger cross_account_matches_check_accounts
  before insert or update of account_id, live_session_id, caxetao_event_id, opponent_account_id, opponent_live_session_id, opponent_caxetao_event_id
  on public.cross_account_matches
  for each row execute function public.cross_account_matches_validate();

-- Marks a `matches` row as the ranking-credit side effect of launching
-- points on a Caxetão-sourced cross_account_matches confronto — see
-- lib/actions/cross-account-matches.ts. Deliberately NOT a general-purpose
-- signal: only this one mirroring path ever sets it. The unique partial
-- index lets that action upsert (one mirrored match per confronto, updated
-- in place if points are relaunched with a different rule) instead of
-- accumulating duplicates.
alter table public.matches
  add column source_cross_account_match_id uuid references public.cross_account_matches (id) on delete set null;

create unique index matches_source_cross_account_match_unique
  on public.matches (source_cross_account_match_id)
  where source_cross_account_match_id is not null;
