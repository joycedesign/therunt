-- The Runt — in-app account deletion (App Store requirement 5.1.1(v)).
-- Run once in the SQL Editor.
--
-- Lets a signed-in member permanently delete their own account: their player
-- row (all player-referencing tables cascade or set null) and their auth user.
-- security definer so it can remove the auth.users row; scoped strictly to the
-- caller (auth.uid()).

create or replace function delete_my_account()
returns void
language plpgsql security definer set search_path = public
as $$
declare
  me uuid := current_player_id();
begin
  if me is not null then
    delete from players where id = me;   -- cascades / null-outs all child rows
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function delete_my_account() from public;
grant execute on function delete_my_account() to authenticated;
