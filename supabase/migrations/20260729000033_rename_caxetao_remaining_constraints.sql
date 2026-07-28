-- Follow-up to 20260729000032: that migration only caught the FK
-- constraints tied to a *_caxetao_event_id column (the ones I could see by
-- grepping regenerated types for leftover "caxetao" text). Primary keys and
-- unique constraints don't show up in generated TypeScript types at all, and
-- three more FK constraints (named after the *table*, not a caxetao_event_id
-- column: created_by, tiktok_account_id, player_id) were missed the same
-- way — caught this time by grepping the regenerated types file directly
-- rather than relying on memory alone.
alter table public.cachetao_events rename constraint caxetao_events_pkey to cachetao_events_pkey;
alter table public.cachetao_registrations rename constraint caxetao_registrations_pkey to cachetao_registrations_pkey;
alter table public.cachetao_registrations rename constraint caxetao_registrations_caxetao_event_id_player_id_key to cachetao_registrations_cachetao_event_id_player_id_key;

alter table public.cachetao_events rename constraint caxetao_events_created_by_fkey to cachetao_events_created_by_fkey;
alter table public.cachetao_events rename constraint caxetao_events_tiktok_account_id_fkey to cachetao_events_tiktok_account_id_fkey;
alter table public.cachetao_registrations rename constraint caxetao_registrations_player_id_fkey to cachetao_registrations_player_id_fkey;
