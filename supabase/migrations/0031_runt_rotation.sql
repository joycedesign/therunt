-- The Runt — organiser (Runt) rotation (Phase 6). Run once in the SQL Editor.
--
-- Each week's loser becomes the organiser ("the Runt") for the next 7 days
-- (Sun–Sun) and, with an optional helper, gets admin rights for that window.
-- The organiser is chosen manually (later Phase 4 results can auto-pick the
-- loser). Admin rights are granted purely by extending is_admin() — every
-- existing RLS policy that calls it grants the organiser + helper automatically.

create table if not exists runt_tenures (
  id               uuid primary key default gen_random_uuid(),
  runt_player_id   uuid not null references players(id) on delete cascade,
  helper_player_id uuid references players(id) on delete set null,
  starts_on        date not null,   -- the Sunday the tenure begins
  ends_on          date not null,   -- starts_on + 7
  created_by       uuid references players(id) on delete set null,
  created_at       timestamptz not null default now()
);
-- One tenure per week.
create unique index if not exists runt_tenures_starts_on_key on runt_tenures (starts_on);
create index if not exists runt_tenures_window_idx on runt_tenures (starts_on, ends_on);

alter table runt_tenures enable row level security;
drop policy if exists "runt_tenures_read" on runt_tenures;
create policy "runt_tenures_read" on runt_tenures
  for select to authenticated using (true);
-- Writes go only through the RPCs below (security definer); no direct write policy.

do $$ begin
  if not exists (select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='runt_tenures') then
    alter publication supabase_realtime add table runt_tenures;
  end if;
end $$;

-- Extend admin: permanent admins OR the active tenure's organiser/helper.
create or replace function is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((select is_admin from players where auth_user_id = auth.uid()), false)
    or exists (
      select 1
      from runt_tenures t
      join players p on p.auth_user_id = auth.uid()
      where current_date >= t.starts_on and current_date < t.ends_on
        and (t.runt_player_id = p.id or t.helper_player_id = p.id)
    );
$$;

-- Assign next week's organiser (upcoming Sun–Sun). Current organiser or an admin.
create or replace function assign_runt(p_player_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  s date;
begin
  if not is_admin() then
    raise exception 'Only the current organiser or an admin can set the next organiser';
  end if;
  -- The upcoming Sunday on or after today (Sunday = dow 0).
  s := current_date + ((7 - extract(dow from current_date)::int) % 7);
  insert into runt_tenures (runt_player_id, starts_on, ends_on, created_by)
  values (p_player_id, s, s + 7, current_player_id())
  on conflict (starts_on) do update
    set runt_player_id = excluded.runt_player_id,
        helper_player_id = null,
        created_by = excluded.created_by;
end;
$$;

-- The organiser nominates (or clears) a helper on their current/upcoming tenure.
create or replace function set_runt_helper(p_helper_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  me uuid := current_player_id();
begin
  update runt_tenures
    set helper_player_id = p_helper_id
    where runt_player_id = me and ends_on > current_date;
  if not found then
    raise exception 'You have no active or upcoming organiser tenure';
  end if;
end;
$$;

-- Add the 6pm-after-game "pick the organiser" notification kind + a 'runt'
-- audience (targets the current organiser), then seed the rule.
alter table notification_rules drop constraint if exists notification_rules_kind_check;
alter table notification_rules add constraint notification_rules_kind_check
  check (kind in ('availability_reminder','deadline_reminder','groups_drawn',
                  'tee_booked','runt_select','custom'));
alter table notification_rules drop constraint if exists notification_rules_audience_check;
alter table notification_rules add constraint notification_rules_audience_check
  check (audience in ('all','in','group','runt'));

insert into notification_rules (kind, title, body, enabled, anchor, offset_minutes, audience)
select 'runt_select', 'Who was the {organiser}?',
       'Tap to set who''s the {organiser} for next week.', true, null, null, 'runt'
where not exists (select 1 from notification_rules where kind = 'runt_select');
