-- The Runt — auto-create a player profile on sign-up (Phase 1 / auth)
-- Run once in the Supabase SQL Editor (safe to re-run).
--
-- When a new auth user is created, insert a matching row into players.
-- If a player row already exists for that email (e.g. the organiser pre-added
-- players by email), we just link it to the new auth user instead of duplicating.
-- SECURITY DEFINER lets this run despite row-level security.

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.players (auth_user_id, email, name, preferred_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'preferred_name', split_part(new.email, '@', 1))
  )
  on conflict (email) do update
    set auth_user_id = excluded.auth_user_id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
