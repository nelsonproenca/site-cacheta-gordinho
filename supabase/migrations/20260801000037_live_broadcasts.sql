-- Fase 5, M6: in-app video broadcast for the account's official streamer.
-- Deliberately linked to live_sessions (not a parallel concept) — starting a
-- broadcast creates-or-reuses the account's currently open live_sessions row
-- (lib/actions/live-broadcasts.ts getOrCreateOpenLiveSession), so the same
-- "live" a streamer opens for manual scoring is the one being watched.
create table public.live_broadcasts (
  id uuid primary key default gen_random_uuid(),
  tiktok_account_id uuid not null references public.tiktok_accounts (id) on delete cascade,
  live_session_id uuid not null references public.live_sessions (id) on delete cascade,
  started_by uuid not null references public.admins (id),
  -- pgcrypto lives in the `extensions` schema on this project (confirmed via
  -- pg_extension), not `public` — gen_random_uuid() above is core Postgres
  -- (PG13+) so it needs no qualification, but gen_random_bytes() does.
  stream_key text not null unique default encode(extensions.gen_random_bytes(16), 'hex'),
  srs_stream_id text,
  status text not null default 'created' check (status in ('created', 'live', 'ended')),
  title text,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now()
);

-- Same denormalization-spoofing defense as matches_validate_account
-- (20260717000014): tiktok_account_id must always agree with the real
-- account of live_session_id, not just be a value the caller happens to have
-- access to.
create or replace function public.live_broadcasts_validate_account()
returns trigger
language plpgsql
as $$
declare
  v_session_account uuid;
begin
  select tiktok_account_id into v_session_account
  from public.live_sessions
  where id = new.live_session_id;

  if v_session_account is null or v_session_account <> new.tiktok_account_id then
    raise exception 'live_broadcasts.tiktok_account_id must match live_sessions.tiktok_account_id for live_session_id %', new.live_session_id;
  end if;

  return new;
end;
$$;

create trigger live_broadcasts_check_account_matches_session
  before insert or update of tiktok_account_id, live_session_id on public.live_broadcasts
  for each row execute function public.live_broadcasts_validate_account();

alter table public.live_broadcasts enable row level security;

-- Read is admin-only at the table level — stream_key/srs_stream_id are
-- sensitive (leak of stream_key = anyone can publish/hijack the RTMP feed)
-- and RLS can't hide a column within an otherwise-visible row, only a row.
-- Players never query this table directly; they go through
-- list_live_broadcasts_now()/get_live_broadcast_public() below, which return
-- only the safe columns.
create policy "live_broadcasts_select_admin"
  on public.live_broadcasts
  for select
  using (public.has_account_access(tiktok_account_id));

create policy "live_broadcasts_insert_admin"
  on public.live_broadcasts
  for insert
  with check (public.has_account_access(tiktok_account_id));

-- No update policy at all: status/srs_stream_id/started_at/ended_at only
-- ever change via the SRS callbacks (app/api/srs/on-publish,on-unpublish) or
-- endBroadcastManually (lib/actions/live-broadcasts.ts) — both go through
-- createServiceClient(), which bypasses RLS entirely. This is stricter than
-- the admins.is_super_admin column-revoke pattern (which turned out to be a
-- no-op given this project's default table-wide grants, see
-- 20260801000036) — omitting the policy is the version of "off-limits
-- regardless of payload" that actually holds up under RLS's real semantics.

-- list_live_broadcasts_now()/get_live_broadcast_public(): the read path for
-- any logged-in session (player or admin) that deliberately excludes
-- stream_key/srs_stream_id. grant is to `authenticated` only — no vitrine
-- pública anônima (prd.md §4.14).
create or replace function public.list_live_broadcasts_now()
returns table (
  id uuid,
  tiktok_account_id uuid,
  status text,
  title text,
  started_at timestamptz
)
language sql
stable
security definer set search_path = public
as $$
  select id, tiktok_account_id, status, title, started_at
  from public.live_broadcasts
  where status = 'live'
  order by started_at desc;
$$;

revoke all on function public.list_live_broadcasts_now() from public;
grant execute on function public.list_live_broadcasts_now() to authenticated;

create or replace function public.get_live_broadcast_public(p_id uuid)
returns table (
  id uuid,
  tiktok_account_id uuid,
  live_session_id uuid,
  status text,
  title text,
  started_at timestamptz,
  ended_at timestamptz
)
language sql
stable
security definer set search_path = public
as $$
  select id, tiktok_account_id, live_session_id, status, title, started_at, ended_at
  from public.live_broadcasts
  where id = p_id;
$$;

revoke all on function public.get_live_broadcast_public(uuid) from public;
grant execute on function public.get_live_broadcast_public(uuid) to authenticated;
