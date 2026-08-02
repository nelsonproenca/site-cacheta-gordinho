-- Fase 5, M7: live chat + moderation (delete message, mute a spectator).
create table public.live_chat_messages (
  id uuid primary key default gen_random_uuid(),
  live_broadcast_id uuid not null references public.live_broadcasts (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  body text not null,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.live_chat_mutes (
  id uuid primary key default gen_random_uuid(),
  live_broadcast_id uuid not null references public.live_broadcasts (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  muted_by uuid not null references public.admins (id),
  created_at timestamptz not null default now(),
  unique (live_broadcast_id, player_id)
);

alter table public.live_chat_messages enable row level security;
alter table public.live_chat_mutes enable row level security;

-- Deliberately NOT filtering out deleted_at here: Supabase Realtime's
-- postgres_changes only delivers an UPDATE event to a subscriber whose
-- SELECT policy still matches the row post-update. If this policy hid
-- deleted rows, the soft-delete UPDATE (deleted_at set) would simply stop
-- being delivered to anyone already watching, and their chat would show the
-- "removed" message forever until a manual refresh. The client filters
-- deleted_at itself, both on initial load and on the realtime event.
create policy "live_chat_messages_select"
  on public.live_chat_messages
  for select
  using (
    public.current_player_id() is not null
    or exists (
      select 1 from public.live_broadcasts lb
      where lb.id = live_chat_messages.live_broadcast_id
        and public.has_account_access(lb.tiktok_account_id)
    )
  );

-- No insert policy at all — same "no direct write, only via RPC" pattern as
-- players/cachetao_registrations. send_live_chat_message (below) is the
-- only path in, since it needs to check mute status and broadcast status
-- atomically with the insert.
create policy "live_chat_messages_moderate"
  on public.live_chat_messages
  for update
  using (
    exists (
      select 1 from public.live_broadcasts lb
      where lb.id = live_chat_messages.live_broadcast_id
        and public.has_account_access(lb.tiktok_account_id)
    )
  )
  with check (
    exists (
      select 1 from public.live_broadcasts lb
      where lb.id = live_chat_messages.live_broadcast_id
        and public.has_account_access(lb.tiktok_account_id)
    )
  );

-- A player needs to see their own mute row to disable their own chat input;
-- an admin needs to see (and manage) every mute for a broadcast they moderate.
create policy "live_chat_mutes_select"
  on public.live_chat_mutes
  for select
  using (
    player_id = public.current_player_id()
    or exists (
      select 1 from public.live_broadcasts lb
      where lb.id = live_chat_mutes.live_broadcast_id
        and public.has_account_access(lb.tiktok_account_id)
    )
  );

create policy "live_chat_mutes_write_admin"
  on public.live_chat_mutes
  for all
  using (
    exists (
      select 1 from public.live_broadcasts lb
      where lb.id = live_chat_mutes.live_broadcast_id
        and public.has_account_access(lb.tiktok_account_id)
    )
  )
  with check (
    exists (
      select 1 from public.live_broadcasts lb
      where lb.id = live_chat_mutes.live_broadcast_id
        and public.has_account_access(lb.tiktok_account_id)
    )
  );

-- security definer so it can atomically check "is this broadcast live" +
-- "is this player muted" + insert, none of which a plain RLS insert policy
-- could express together in one round trip.
create or replace function public.send_live_chat_message(p_broadcast_id uuid, p_body text)
returns public.live_chat_messages
language plpgsql
security definer set search_path = public
as $$
declare
  v_player_id uuid;
  v_status text;
  v_body text;
  v_row public.live_chat_messages;
begin
  v_player_id := public.current_player_id();
  if v_player_id is null then
    raise exception 'send_live_chat_message requires a logged-in player';
  end if;

  select status into v_status from public.live_broadcasts where id = p_broadcast_id;
  if v_status is distinct from 'live' then
    raise exception 'this broadcast is not live';
  end if;

  if exists (
    select 1 from public.live_chat_mutes
    where live_broadcast_id = p_broadcast_id and player_id = v_player_id
  ) then
    raise exception 'you are muted in this broadcast';
  end if;

  v_body := btrim(coalesce(p_body, ''));
  if v_body = '' then
    raise exception 'message cannot be empty';
  end if;
  if char_length(v_body) > 300 then
    raise exception 'message is too long (max 300 characters)';
  end if;

  insert into public.live_chat_messages (live_broadcast_id, player_id, body)
  values (p_broadcast_id, v_player_id, v_body)
  returning * into v_row;

  return v_row;
end;
$$;

-- 20260801000038 found that `revoke all ... from public` alone does NOT
-- stop `anon` on this project (default privileges grant it independently at
-- CREATE time) — revoke from anon explicitly here too, from the start this
-- time instead of as a follow-up fix.
revoke all on function public.send_live_chat_message(uuid, text) from public, anon;
grant execute on function public.send_live_chat_message(uuid, text) to authenticated;

-- Enables Supabase Realtime's postgres_changes for chat delivery — this is
-- the actual mechanism (RLS-native, no separate "Realtime Authorization"
-- feature needed, see prd.md §12's resolved open question).
alter publication supabase_realtime add table public.live_chat_messages;
