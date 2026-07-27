-- Formalizes "partida" as a real record instead of an implicit grouping of
-- cross_account_matches that happen to share a (live_session_id,
-- opponent_live_session_id) pair. Lets the app snapshot a name (@handleA_X_
-- @handleB_yyyymmdd_hhmm) plus both accounts/lives once, at creation time,
-- and never again — there's deliberately no update policy below, so once a
-- partida exists its two sides are immutable at the DB level, not just by
-- UI convention. cross_account_matches gets a partida_id FK so "todos os
-- confrontos da partida" is a direct query, not a live-session-pair filter.
create table public.partidas (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  account_a_id uuid not null references public.tiktok_accounts (id) on delete cascade,
  account_b_id uuid not null references public.tiktok_accounts (id) on delete cascade,
  live_session_id uuid not null references public.live_sessions (id) on delete cascade,
  opponent_live_session_id uuid not null references public.live_sessions (id) on delete cascade,
  created_by uuid references public.admins (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint partidas_distinct_accounts check (account_a_id <> account_b_id)
);

alter table public.partidas enable row level security;

-- Same defense-in-depth reasoning as cross_account_matches_validate
-- (20260724000025): account_a_id/account_b_id are denormalized off
-- live_session_id/opponent_live_session_id for RLS speed, so verify each
-- actually matches the real account of its live session.
create or replace function public.partidas_validate()
returns trigger
language plpgsql
as $$
declare
  v_account_a uuid;
  v_account_b uuid;
begin
  select tiktok_account_id into v_account_a from public.live_sessions where id = new.live_session_id;
  select tiktok_account_id into v_account_b from public.live_sessions where id = new.opponent_live_session_id;

  if v_account_a is null or v_account_a <> new.account_a_id then
    raise exception 'partidas.account_a_id must match live_session_id''s account';
  end if;
  if v_account_b is null or v_account_b <> new.account_b_id then
    raise exception 'partidas.account_b_id must match opponent_live_session_id''s account';
  end if;

  return new;
end;
$$;

create trigger partidas_check_accounts
  before insert on public.partidas
  for each row execute function public.partidas_validate();

create policy "partidas_select_either_side"
  on public.partidas
  for select
  using (public.has_account_access(account_a_id) or public.has_account_access(account_b_id));

create policy "partidas_insert_creator_side"
  on public.partidas
  for insert
  with check (public.has_account_access(account_a_id));

-- Backfill: one partidas row per distinct existing live-session pair
-- already in cross_account_matches, named the same way new ones will be,
-- so no existing confronto gets orphaned once partida_id is required below.
insert into public.partidas (name, account_a_id, account_b_id, live_session_id, opponent_live_session_id, created_at)
select
  '@' || coalesce(a.handle, 'conta') || '_X_@' || coalesce(b.handle, 'conta') || '_' ||
    to_char(min(m.created_at) at time zone 'America/Sao_Paulo', 'YYYYMMDD_HH24MI'),
  m.account_id,
  m.opponent_account_id,
  m.live_session_id,
  m.opponent_live_session_id,
  min(m.created_at)
from public.cross_account_matches m
join public.tiktok_accounts a on a.id = m.account_id
join public.tiktok_accounts b on b.id = m.opponent_account_id
group by m.account_id, m.opponent_account_id, m.live_session_id, m.opponent_live_session_id, a.handle, b.handle;

alter table public.cross_account_matches
  add column partida_id uuid references public.partidas (id) on delete cascade;

update public.cross_account_matches m
set partida_id = p.id
from public.partidas p
where p.account_a_id = m.account_id
  and p.account_b_id = m.opponent_account_id
  and p.live_session_id = m.live_session_id
  and p.opponent_live_session_id = m.opponent_live_session_id;

alter table public.cross_account_matches
  alter column partida_id set not null;
