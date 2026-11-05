-- specs/002-moedas-pagamento-indicacao — mesmo motivo de
-- 20261105000057 (wallet_credit): revoke all ... from public também revoga
-- o grant universal padrão do Postgres a PUBLIC, o que inclui service_role
-- (não é membro de anon/authenticated, mas herda do PUBLIC como qualquer
-- role). referral_resolve_and_link só precisava ser chamável pelo dono via
-- SECURITY DEFINER até agora; grant explícito a service_role para permitir
-- verificação/manutenção futura por esse caminho também.
grant execute on function public.referral_resolve_and_link(uuid, text) to service_role;
