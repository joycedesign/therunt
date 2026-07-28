-- The Runt — automatic draw (Phase 3, final): pg_cron runs the draw at 4:05pm,
-- 8 days before each Saturday (5 minutes after the 4pm confirm deadline).
-- Run once in the Supabase SQL Editor. Idempotent — safe to re-run.
--
-- This is a plpgsql port of lib/draw.ts computeGroups(): cluster players who
-- must stay together (matches + cart pairs + a host's guests) with union-find,
-- best-fit-pack the clusters into groups of 4, avoid a lonely group of 1, and
-- pad short groups with blockers. It reuses apply_draw's persistence.
--
-- NOTE: pg_cron must be enabled. On Supabase: Dashboard → Database → Extensions
-- → enable "pg_cron" (or the create extension below if you have rights).

create extension if not exists pg_cron;

-- 1. Split apply_draw so the auto-draw can persist a plan without the is_admin
--    check (cron has no auth context). apply_draw keeps its admin guard.
create or replace function apply_draw_plan(p_week_id uuid, p_groups jsonb)
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

create or replace function apply_draw(p_week_id uuid, p_groups jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'Only admins can run the draw';
  end if;
  perform apply_draw_plan(p_week_id, p_groups);
end;
$$;

-- 2. Compute and apply the draw for one week (the port of computeGroups).
create or replace function draw_week(p_week_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_in        uuid[];
  v_blockers  uuid[];
  roots       jsonb := '{}'::jsonb;
  cart_ids    uuid[];
  units       jsonb := '[]'::jsonb;
  g_units     jsonb[] := '{}';   -- per group: jsonb array of unit objects {m,g,sz}
  g_used      int[]   := '{}';   -- per group: members + guests placed
  plan        jsonb := '[]'::jsonb;
  rec         record;
  unit        jsonb;
  single      jsonb;
  u_members   text[];
  u_guests    text[];
  u_sz        int;
  la          text;
  lb          text;
  a           uuid;
  b           uuid;
  i           int;
  gi          int;
  best        int;
  donor       int;
  mem         text[];
  gst         text[];
  blk         text[];
  need        int;
  bi          int;
  tmp_arr     jsonb;
begin
  select coalesce(array_agg(player_id), '{}') into v_in
  from availability where week_id = p_week_id and is_available = true;
  if array_length(v_in, 1) is null then
    return;
  end if;

  -- union-find init
  foreach a in array v_in loop
    roots := jsonb_set(roots, array[a::text], to_jsonb(a::text));
  end loop;

  -- union matched pairs (both available)
  for rec in select player_a, player_b from matches where week_id = p_week_id loop
    if roots ? rec.player_a::text and roots ? rec.player_b::text then
      la := roots->>rec.player_a::text;
      lb := roots->>rec.player_b::text;
      if la <> lb then
        select jsonb_object_agg(key, to_jsonb(case when value = lb then la else value end))
        into roots from jsonb_each_text(roots);
      end if;
    end if;
  end loop;

  -- union cart pairs: shuffle cart-holders (available), pair consecutively
  select coalesce(array_agg(player_id order by random()), '{}') into cart_ids
  from carts where week_id = p_week_id and player_id = any(v_in);
  i := 1;
  while i + 1 <= coalesce(array_length(cart_ids, 1), 0) loop
    a := cart_ids[i];
    b := cart_ids[i + 1];
    la := roots->>a::text;
    lb := roots->>b::text;
    if la is not null and lb is not null and la <> lb then
      select jsonb_object_agg(key, to_jsonb(case when value = lb then la else value end))
      into roots from jsonb_each_text(roots);
    end if;
    i := i + 2;
  end loop;

  -- build one unit per cluster (members + their guests)
  for rec in
    select roots->>(t.pid::text) as root, array_agg(t.pid::text) as members
    from unnest(v_in) as t(pid)
    group by roots->>(t.pid::text)
  loop
    u_members := rec.members;
    select coalesce(array_agg(id::text), '{}') into u_guests
    from guests where week_id = p_week_id and host_player_id::text = any(u_members);
    u_sz := coalesce(array_length(u_members, 1), 0) + coalesce(array_length(u_guests, 1), 0);
    units := units || jsonb_build_object('m', to_jsonb(u_members), 'g', to_jsonb(u_guests), 'sz', u_sz);
  end loop;

  -- best-fit-decreasing pack into groups of capacity 4
  for unit in
    select value from jsonb_array_elements(units) as t(value)
    order by (t.value->>'sz')::int desc, random()
  loop
    u_sz := (unit->>'sz')::int;
    best := 0;
    for gi in 1..coalesce(array_length(g_used, 1), 0) loop
      if g_used[gi] + u_sz <= 4 and (best = 0 or g_used[gi] > g_used[best]) then
        best := gi;
      end if;
    end loop;
    if best = 0 then
      g_units := array_append(g_units, jsonb_build_array(unit));
      g_used := array_append(g_used, u_sz);
    else
      g_units[best] := g_units[best] || unit;
      g_used[best] := g_used[best] + u_sz;
    end if;
  end loop;

  -- avoid a lonely group of 1: borrow a single from a full group (→ 3 and 2)
  for gi in 1..coalesce(array_length(g_used, 1), 0) loop
    if g_used[gi] = 1 then
      for donor in 1..array_length(g_used, 1) loop
        if donor <> gi and g_used[donor] >= 4 then
          single := null;
          select value into single
          from jsonb_array_elements(g_units[donor]) as t(value)
          where (t.value->>'sz')::int = 1
          limit 1;
          if single is not null then
            select coalesce(jsonb_agg(value), '[]'::jsonb) into tmp_arr
            from jsonb_array_elements(g_units[donor]) as t(value)
            where value <> single;
            g_units[donor] := tmp_arr;
            g_units[gi] := g_units[gi] || single;
            g_used[donor] := g_used[donor] - 1;
            g_used[gi] := g_used[gi] + 1;
            exit;
          end if;
        end if;
      end loop;
    end if;
  end loop;

  -- blocker pool: active players not available this week, shuffled
  select coalesce(array_agg(id order by random()), '{}') into v_blockers
  from players where status = 'active' and not (id = any(v_in));

  -- flatten groups into the plan, padding short groups with blockers
  bi := 1;
  for gi in 1..coalesce(array_length(g_used, 1), 0) loop
    mem := '{}';
    gst := '{}';
    for unit in select value from jsonb_array_elements(g_units[gi]) as t(value) loop
      mem := mem || (select coalesce(array_agg(x), '{}') from jsonb_array_elements_text(unit->'m') as t2(x));
      gst := gst || (select coalesce(array_agg(x), '{}') from jsonb_array_elements_text(unit->'g') as t2(x));
    end loop;
    blk := '{}';
    need := 4 - g_used[gi];
    while need > 0 and bi <= coalesce(array_length(v_blockers, 1), 0) loop
      blk := array_append(blk, v_blockers[bi]::text);
      bi := bi + 1;
      need := need - 1;
    end loop;
    plan := plan || jsonb_build_object(
      'memberIds', to_jsonb(mem),
      'guestIds', to_jsonb(gst),
      'blockerIds', to_jsonb(blk)
    );
  end loop;

  perform apply_draw_plan(p_week_id, plan);
  update weeks set status = 'draw_complete' where id = p_week_id;
  delete from reserves where week_id = p_week_id;
  insert into change_log (week_id, author_player_id, author_name, action)
  values (p_week_id, null, 'Auto-draw', 'Randomised the groups automatically');
end;
$$;

-- 3. Cron entry point: draw every pending week whose 4:05pm draw time has passed.
create or replace function auto_draw()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  w record;
begin
  for w in
    select id from weeks
    where status = 'pending'
      and booking_deadline is not null
      and now() >= booking_deadline + interval '5 minutes'
      and start_date >= current_date
      and (event_type is null or event_type = 'golf')
      and exists (select 1 from availability a where a.week_id = weeks.id and a.is_available)
  loop
    begin
      perform draw_week(w.id);
    exception when others then
      raise warning 'auto_draw failed for week %: %', w.id, sqlerrm;
    end;
  end loop;
end;
$$;

-- 4. Schedule it every 5 minutes (a no-op until a week's draw time arrives).
--    With the +5min threshold above, the first tick at/after 4:05pm draws.
--    booking_deadline is an absolute timestamptz, so this is DST-safe.
select cron.unschedule(jobid) from cron.job where jobname = 'runt-auto-draw';
select cron.schedule('runt-auto-draw', '*/5 * * * *', $$select public.auto_draw();$$);
