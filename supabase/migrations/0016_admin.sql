-- The Runt — admins; restrict the draw to admins (Phase 3)
-- Run once in the Supabase SQL Editor (safe to re-run).

alter table players add column if not exists is_admin boolean not null default false;

-- Henry (membership 4053) is an admin.
update players set is_admin = true where membership_number = '4053';

-- Is the current user an admin?
create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_admin from players where auth_user_id = auth.uid()), false);
$$;

-- Running the draw is admin-only.
create or replace function apply_draw(p_week_id uuid, p_groups jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  grp jsonb;
  gid uuid;
  letter int := 0;
  pid uuid;
  realcount int;
begin
  if not is_admin() then
    raise exception 'Only admins can run the draw';
  end if;

  delete from groups where week_id = p_week_id;

  for grp in select value from jsonb_array_elements(p_groups) loop
    realcount := coalesce(jsonb_array_length(grp->'memberIds'), 0)
               + coalesce(jsonb_array_length(grp->'guestIds'), 0);
    insert into groups (week_id, group_name, target_size, actual_size, booking_status)
    values (p_week_id, 'Group ' || chr(65 + letter), 4, realcount, 'open')
    returning id into gid;
    letter := letter + 1;
    for pid in select t::uuid from jsonb_array_elements_text(grp->'memberIds') as t loop
      insert into group_members (group_id, player_id, is_blocker) values (gid, pid, false);
    end loop;
    for pid in select t::uuid from jsonb_array_elements_text(grp->'blockerIds') as t loop
      insert into group_members (group_id, player_id, is_blocker) values (gid, pid, true);
    end loop;
    update guests set group_id = gid
      where id in (select t::uuid from jsonb_array_elements_text(grp->'guestIds') as t);
  end loop;
end;
$$;

-- Resetting the draw is admin-only.
create or replace function reset_draw(p_week_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'Only admins can reset the draw';
  end if;
  delete from groups where week_id = p_week_id;
  update weeks set status = 'pending' where id = p_week_id;
end;
$$;
