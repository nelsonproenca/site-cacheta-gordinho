-- specs/002-moedas-pagamento-indicacao, US1 — pacotes de moedas "estilo
-- TikTok" (valores a critério do admin, ver research.md §8) e pedidos de
-- compra com aprovação manual (sem PSP/banco, decisão explícita do usuário).
create table public.coin_packages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price_brl numeric(10, 2) not null check (price_brl > 0),
  coin_amount int not null check (coin_amount > 0),
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.coin_packages enable row level security;

create policy "coin_packages_select_identified_or_admin"
  on public.coin_packages
  for select
  using (
    (active and public.current_player_is_identified())
    or public.is_approved_admin()
  );

create policy "coin_packages_write_super_admin"
  on public.coin_packages
  for all
  using (public.is_super_admin())
  with check (public.is_super_admin());

create table public.coin_purchase_orders (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id),
  package_id uuid not null references public.coin_packages (id),
  coin_amount int not null,
  price_brl numeric(10, 2) not null,
  receipt_path text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references public.admins (id),
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now()
);

alter table public.coin_purchase_orders enable row level security;

create policy "coin_purchase_orders_select_own_or_admin"
  on public.coin_purchase_orders
  for select
  using (player_id = public.current_player_id() or public.is_approved_admin());

-- Sem policy de insert/update direta — request_coin_purchase/
-- review_coin_purchase abaixo são o único funil (Princípio II).

alter table public.wallet_movements
  add constraint wallet_movements_reference_purchase_id_fkey
  foreign key (reference_purchase_id) references public.coin_purchase_orders (id);

create or replace function public.request_coin_purchase(p_package_id uuid, p_receipt_path text)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_player_id uuid;
  v_package public.coin_packages;
  v_order_id uuid;
begin
  if public.current_player_is_guest() then
    raise exception 'guests cannot purchase coins';
  end if;
  v_player_id := public.current_player_id();

  select * into v_package from public.coin_packages where id = p_package_id and active = true;
  if v_package is null then
    raise exception 'coin package not found or inactive';
  end if;

  if p_receipt_path is null or btrim(p_receipt_path) = '' then
    raise exception 'receipt_path is required';
  end if;

  insert into public.coin_purchase_orders (player_id, package_id, coin_amount, price_brl, receipt_path)
  values (v_player_id, v_package.id, v_package.coin_amount, v_package.price_brl, p_receipt_path)
  returning id into v_order_id;

  return v_order_id;
end;
$$;

revoke all on function public.request_coin_purchase(uuid, text) from public, anon;
grant execute on function public.request_coin_purchase(uuid, text) to authenticated;

create or replace function public.review_coin_purchase(
  p_order_id uuid,
  p_approve boolean,
  p_rejection_reason text default null
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_order public.coin_purchase_orders;
begin
  if not public.is_approved_admin() then
    raise exception 'only an approved admin can review a purchase order';
  end if;

  select * into v_order from public.coin_purchase_orders where id = p_order_id for update;
  if v_order is null then
    raise exception 'order not found';
  end if;
  if v_order.status != 'pending' then
    raise exception 'order already reviewed';
  end if;

  if p_approve then
    perform public.wallet_credit(v_order.player_id, v_order.coin_amount, 'coin_purchase', null, v_order.id);
    update public.coin_purchase_orders
    set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now()
    where id = p_order_id;
  else
    update public.coin_purchase_orders
    set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), rejection_reason = p_rejection_reason
    where id = p_order_id;
  end if;
end;
$$;

revoke all on function public.review_coin_purchase(uuid, boolean, text) from public, anon;
grant execute on function public.review_coin_purchase(uuid, boolean, text) to authenticated;
