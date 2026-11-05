-- specs/002-moedas-pagamento-indicacao, Foundational (research.md §3): mais
-- um guard independente no trigger de auth.users — admin só se cadastra via
-- e-mail/senha (/admin/login), nunca via Google OAuth nem telefone. Google
-- OAuth (US4) é um fluxo de redirect onde não há controle confiável sobre
-- raw_user_meta_data (client-suppliable, logo não confiável para isso de
-- qualquer forma) — mas raw_app_meta_data->>'provider' é populado pelo
-- próprio GoTrue a partir do método real de auth usado, então é um sinal
-- server-side confiável para esta distinção.
create or replace function public.handle_new_admin_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if coalesce(new.raw_user_meta_data ->> 'actor_type', 'admin') != 'admin'
     or new.email is null
     or coalesce(new.raw_app_meta_data ->> 'provider', 'email') != 'email'
  then
    return new;
  end if;

  insert into public.admins (id, name, email, user_type, streamer_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    new.email,
    nullif(new.raw_user_meta_data ->> 'user_type', ''),
    nullif(new.raw_user_meta_data ->> 'streamer_id', '')::uuid
  );
  return new;
end;
$$;
