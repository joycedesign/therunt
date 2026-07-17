-- The Runt — let admins manage admin status (safely)
-- Run once in the Supabase SQL Editor (safe to re-run).

-- Admins can update any player row (needed to toggle is_admin on other members).
drop policy if exists "players_admin_update" on players;
create policy "players_admin_update" on players
  for update to authenticated
  using (is_admin())
  with check (is_admin());

-- Column-level guard: only an admin may change is_admin. This blocks
-- self-promotion via the existing "update your own row" policy.
create or replace function guard_is_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_admin is distinct from old.is_admin and not is_admin() then
    raise exception 'Only admins can change admin status';
  end if;
  return new;
end;
$$;

drop trigger if exists players_guard_is_admin on players;
create trigger players_guard_is_admin
  before update on players
  for each row execute function guard_is_admin();
