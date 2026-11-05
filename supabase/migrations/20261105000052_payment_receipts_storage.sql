-- specs/002-moedas-pagamento-indicacao, US1 — primeiro uso de Supabase
-- Storage neste projeto. Bucket privado para comprovante de Pix; path
-- sempre prefixado por current_player_id() (research.md §4), mesmo padrão
-- de RLS por dono já usado nas tabelas, só que em storage.objects.
insert into storage.buckets (id, name, public)
values ('payment-receipts', 'payment-receipts', false)
on conflict (id) do nothing;

create policy "payment_receipts_insert_own"
  on storage.objects
  for insert
  with check (
    bucket_id = 'payment-receipts'
    and (storage.foldername(name))[1] = public.current_player_id()::text
  );

create policy "payment_receipts_select_own_or_admin"
  on storage.objects
  for select
  using (
    bucket_id = 'payment-receipts'
    and (
      (storage.foldername(name))[1] = public.current_player_id()::text
      or public.is_approved_admin()
    )
  );
