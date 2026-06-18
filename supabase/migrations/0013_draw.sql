-- The Runt — apply a computed draw (Phase 3)
-- Run once in the Supabase SQL Editor (safe to re-run).
--
-- The app randomizes In players into groups (keeping guests with their host
-- and padding short groups with blockers) and passes the plan here. This
-- writes it atomically and bypasses RLS so guests of any member can be
-- assigned to their group. Resetting is just deleting the week's groups
-- (group_members cascade; guests.group_id is set null), which the client does
-- directly.

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
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  -- Clear any existing draw for this week first.
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

-- Live updates so everyone sees the draw when the Runt randomizes.
do $$ begin
  if not exists (select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='groups') then
    alter publication supabase_realtime add table groups;
  end if;
  if not exists (select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='group_members') then
    alter publication supabase_realtime add table group_members;
  end if;
end $$;
