-- specs/002-moedas-pagamento-indicacao — bug encontrado antes de ir a
-- produção: wallet_credit(p_player_id => null, ...), usado para registrar a
-- taxa da casa (reason = 'house_rake', sem dono — ver data-model.md), tentava
-- inserir player_id = null em wallet_accounts, cuja primary key implica
-- not null — a chamada falharia sempre que uma mesa paga terminasse. Corrige
-- pulando o upsert/lock de wallet_accounts quando p_player_id é null (não há
-- concorrência a serializar para um movimento sem dono).
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

  if p_player_id is not null then
    insert into public.wallet_accounts (player_id) values (p_player_id)
    on conflict (player_id) do nothing;

    perform 1 from public.wallet_accounts where player_id = p_player_id for update;
  end if;

  insert into public.wallet_movements (player_id, amount, reason, reference_table_id, reference_purchase_id)
  values (p_player_id, p_amount, p_reason, p_reference_table_id, p_reference_purchase_id);
end;
$$;

revoke all on function public.wallet_credit(uuid, int, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.wallet_credit(uuid, int, text, uuid, uuid) to service_role;
