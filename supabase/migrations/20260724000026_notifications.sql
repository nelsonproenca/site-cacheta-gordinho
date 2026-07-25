-- Admin-to-admin notifications (e.g. "notifyStreamer" when starting a
-- cross-account confronto, lib/actions/notifications.ts). Scoped per admin
-- row on purpose, not shared with the recipient's moderadores — "notificação
-- para o streamer selecionado" names a specific person, not their account's
-- whole access group.
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_admin_id uuid not null references public.admins (id) on delete cascade,
  sender_admin_id uuid references public.admins (id) on delete set null,
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.notifications enable row level security;

create policy "notifications_select_own"
  on public.notifications
  for select
  using (recipient_admin_id = auth.uid());

create policy "notifications_update_own"
  on public.notifications
  for update
  using (recipient_admin_id = auth.uid())
  with check (recipient_admin_id = auth.uid());

create policy "notifications_insert_sender"
  on public.notifications
  for insert
  with check (sender_admin_id = auth.uid() and public.is_approved_admin());
