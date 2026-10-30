-- Fixes "Database error creating anonymous user" discovered while wiring up
-- guest play for the Cacheta game: handle_new_admin_user() (20260715000001,
-- redefined 20260724000024) runs on every auth.users insert and defaults
-- coalesce(raw_user_meta_data->>'actor_type', 'admin') to 'admin' for any
-- row that doesn't explicitly say otherwise. signInAnonymously() sets no
-- metadata at all and has no email — so it fell into the 'admin' branch and
-- tried to insert into admins with email = null, violating admins.email's
-- not null constraint and rolling back the entire auth.users insert (GoTrue
-- reports this generically as a 500, not the real constraint error).
-- new.email is null is added as a second, independent guard: an admin row
-- genuinely cannot exist without an email, so any signup missing one should
-- skip this insert regardless of what actor_type claims — more robust than
-- depending on auth.users.is_anonymous (whose availability varies by
-- Supabase/GoTrue version) and correct for player-OTP signups too, which
-- already skip this branch via actor_type and also have no email.
create or replace function public.handle_new_admin_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if coalesce(new.raw_user_meta_data ->> 'actor_type', 'admin') != 'admin' or new.email is null then
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
