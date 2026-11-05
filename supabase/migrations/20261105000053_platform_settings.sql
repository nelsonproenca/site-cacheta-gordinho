-- specs/002-moedas-pagamento-indicacao — taxa da casa e comissão de
-- indicação, configuráveis pelo admin (FR-011/FR-016), linha única
-- (research.md §7). Não reaproveita scoring_rules (domínio diferente:
-- pontuação de partidas de live, não dinheiro).
create table public.platform_settings (
  id boolean primary key default true check (id),
  house_rake_percent numeric(5, 2) not null default 10 check (house_rake_percent between 0 and 100),
  referral_commission_percent numeric(5, 2) not null default 25 check (referral_commission_percent between 0 and 100),
  pix_key text,
  pix_key_owner_name text,
  updated_at timestamptz not null default now()
);

alter table public.platform_settings enable row level security;

create policy "platform_settings_select_identified_or_admin"
  on public.platform_settings
  for select
  using (public.current_player_is_identified() or public.is_approved_admin());

create policy "platform_settings_write_super_admin"
  on public.platform_settings
  for update
  using (public.is_super_admin())
  with check (public.is_super_admin());

insert into public.platform_settings (id) values (true);
