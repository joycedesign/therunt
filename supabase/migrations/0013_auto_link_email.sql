-- The Runt — auto-link an invited member by email (Phase 2 #4b)
-- Run once in the Supabase SQL Editor (safe to re-run).
--
-- When the organiser invites a member, their email is stored on the member
-- row. On first sign-in this links the auth user to that row automatically,
-- so invited members skip the membership-number step.

create or replace function auto_link_member()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  uemail text;
  linked int;
begin
  if uid is null then
    return false;
  end if;
  if exists (select 1 from players where auth_user_id = uid) then
    return true;
  end if;

  select email into uemail from auth.users where id = uid;

  update players
    set auth_user_id = uid
    where auth_user_id is null and lower(email) = lower(uemail);
  get diagnostics linked = row_count;

  return linked > 0;
end;
$$;
