-- Adapts get_live_broadcast_public (20260801000037/038) for MediaMTX, the
-- media server actually running on the user's VPS (not SRS, as the original
-- plan assumed — confirmed by inspecting the real VPS). MediaMTX serves both
-- WHIP (publish) and WHEP (read) under the SAME path-based URL
-- (`/<path>/whip`, `/<path>/whep`) — there's no per-protocol alias without
-- its Control API (out of scope), so the "watch by broadcast.id, publish by
-- secret stream_key" separation from 20260801000037 isn't achievable here.
--
-- Revised, confirmed model: the player-facing RPC now also returns a
-- `playback_path` (`'live_' || stream_key`, matching the mediamtx.yml
-- `~^live_(.+)$` path pattern) — but ONLY once `status = 'live'`. Before
-- that, it's null: a player who navigates to a broadcast's page before the
-- real streamer has actually started publishing gets nothing to act on,
-- closing the window where they could otherwise pre-emptively WHIP-publish
-- to that same path themselves. Once genuinely live, MediaMTX's own
-- single-publisher-per-path behavior is what stops a second publish attempt
-- (confirmed trade-off, not a silent downgrade — see CLAUDE.md's Fase 5
-- section). list_live_broadcasts_now() deliberately still excludes this
-- entirely — a player only ever learns a playback_path by opening one
-- specific broadcast's page, never from the public listing.
-- create or replace can't change a TABLE-returning function's row type.
drop function public.get_live_broadcast_public(uuid);

create function public.get_live_broadcast_public(p_id uuid)
returns table (
  id uuid,
  tiktok_account_id uuid,
  live_session_id uuid,
  status text,
  title text,
  started_at timestamptz,
  ended_at timestamptz,
  playback_path text
)
language sql
stable
security definer set search_path = public
as $$
  select
    id, tiktok_account_id, live_session_id, status, title, started_at, ended_at,
    case when status = 'live' then 'live_' || stream_key else null end as playback_path
  from public.live_broadcasts
  where id = p_id and auth.uid() is not null;
$$;

revoke all on function public.get_live_broadcast_public(uuid) from public, anon;
grant execute on function public.get_live_broadcast_public(uuid) to authenticated;
