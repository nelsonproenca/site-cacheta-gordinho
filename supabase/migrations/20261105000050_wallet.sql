-- specs/002-moedas-pagamento-indicacao, Foundational — carteira de moedas.
-- Saldo nunca é armazenado, sempre derivado por soma de wallet_movements
-- (research.md §1): evita duas fontes de verdade que poderiam desincronizar.
-- wallet_accounts existe só para servir de ponto de lock de concorrência
-- (select ... for update) dentro das funções que debitam/creditam — não
-- guarda saldo nenhum.
create table public.wallet_accounts (
  player_id uuid primary key references public.players (id),
  created_at timestamptz not null default now()
);

alter table public.wallet_accounts enable row level security;
-- Sem nenhuma policy: só as funções security definer abaixo tocam nela
-- (mesmo padrão de cacheta_table_decks).

create table public.wallet_movements (
  id uuid primary key default gen_random_uuid(),
  player_id uuid references public.players (id),
  amount int not null check (amount != 0),
  reason text not null check (reason in (
    'coin_purchase', 'table_entry', 'table_payout', 'table_refund', 'house_rake', 'referral_commission'
  )),
  reference_table_id uuid references public.cacheta_tables (id),
  reference_purchase_id uuid,
  created_at timestamptz not null default now()
);

alter table public.wallet_movements enable row level security;

create policy "wallet_movements_select_own_or_admin"
  on public.wallet_movements
  for select
  using (player_id = public.current_player_id() or public.is_approved_admin());

-- Sem policy de insert/update/delete: todo movimento nasce dentro de
-- wallet_credit/wallet_debit abaixo, nunca por escrita direta do cliente
-- (Princípio II da constituição).

-- current_player_is_guest(): fail-closed — também true quando não há
-- jogador logado (ninguém sem sessão deveria passar em nenhum gate de
-- dinheiro). current_player_is_identified() é só o inverso, para deixar as
-- RLS policies mais legíveis.
create or replace function public.current_player_is_guest()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select coalesce(
    (select is_guest from public.players where id = public.current_player_id()),
    true
  );
$$;

revoke all on function public.current_player_is_guest() from public;
grant execute on function public.current_player_is_guest() to authenticated;

create or replace function public.current_player_is_identified()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select not public.current_player_is_guest();
$$;

revoke all on function public.current_player_is_identified() from public;
grant execute on function public.current_player_is_identified() to authenticated;

-- is_handle_available(): leitura pública simples, sem precisar resolver
-- identidade do chamador — mesma normalização de normalize_tiktok_handle().
create or replace function public.is_handle_available(p_handle text)
returns boolean
language sql
stable
as $$
  select not exists (
    select 1 from public.players where tiktok_handle = lower(ltrim(coalesce(p_handle, ''), '@'))
  );
$$;

revoke all on function public.is_handle_available(text) from public;
grant execute on function public.is_handle_available(text) to anon, authenticated;

-- wallet_credit/wallet_debit: ponto único de escrita do ledger, reaproveitado
-- por toda RPC das fases seguintes (compra aprovada, entrada de mesa, payout,
-- estorno, comissão, taxa da casa) — evita duplicar a lógica de lock em cada
-- uma (Princípio II). Ambas fazem upsert de wallet_accounts primeiro, só
-- para garantir uma linha para travar com for update mesmo na primeira
-- operação de um jogador.
create or replace function public.wallet_credit(
  p_player_id uuid,
  p_amount int,
  p_reason text,
  p_reference_table_id uuid default null,
  p_reference_purchase_id uuid default null
)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if p_amount <= 0 then
    raise exception 'wallet_credit amount must be positive';
  end if;

  insert into public.wallet_accounts (player_id) values (p_player_id)
  on conflict (player_id) do nothing;

  perform 1 from public.wallet_accounts where player_id = p_player_id for update;

  insert into public.wallet_movements (player_id, amount, reason, reference_table_id, reference_purchase_id)
  values (p_player_id, p_amount, p_reason, p_reference_table_id, p_reference_purchase_id);
end;
$$;

revoke all on function public.wallet_credit(uuid, int, text, uuid, uuid) from public, anon, authenticated;

create or replace function public.wallet_debit(
  p_player_id uuid,
  p_amount int,
  p_reason text,
  p_reference_table_id uuid default null
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_balance int;
begin
  if p_amount <= 0 then
    raise exception 'wallet_debit amount must be positive';
  end if;

  insert into public.wallet_accounts (player_id) values (p_player_id)
  on conflict (player_id) do nothing;

  perform 1 from public.wallet_accounts where player_id = p_player_id for update;

  select coalesce(sum(amount), 0) into v_balance
  from public.wallet_movements where player_id = p_player_id;

  if v_balance < p_amount then
    raise exception 'insufficient balance';
  end if;

  insert into public.wallet_movements (player_id, amount, reason, reference_table_id)
  values (p_player_id, -p_amount, p_reason, p_reference_table_id);
end;
$$;

revoke all on function public.wallet_debit(uuid, int, text, uuid) from public, anon, authenticated;

-- Nota: wallet_credit/wallet_debit são chamadas só por outras funções
-- security definer (request_coin_purchase, review_coin_purchase,
-- create_cacheta_table, join_cacheta_table, cancel_cacheta_table, e o
-- Server Action baterCombinacao via service-role) — não têm grant para
-- authenticated porque nunca devem ser chamadas diretamente pelo cliente com
-- um p_player_id arbitrário.
