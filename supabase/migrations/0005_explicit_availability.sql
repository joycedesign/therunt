-- The Runt — protect manual availability choices from the default (Phase 2)
-- Run once in the Supabase SQL Editor (safe to re-run).
--
-- Adds `availability.is_explicit`: true once a player toggles a specific date
-- by hand. Changing the profile default then only affects dates the player
-- has NOT explicitly set, so manual choices are preserved.

alter table availability
  add column if not exists is_explicit boolean not null default false;

-- New weeks: seed a baseline (non-explicit) row from each player's default.
create or replace function seed_week_availability()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into availability (week_id, player_id, is_available, is_explicit)
  select new.id, p.id, p.default_available, false
  from players p
  where p.status = 'active'
  on conflict (week_id, player_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_week_created on weeks;
create trigger on_week_created
  after insert on weeks
  for each row execute function seed_week_availability();

-- Setting the default fills in missing rows and updates only the baseline
-- (non-explicit) rows, leaving hand-picked dates untouched.
create or replace function set_default_availability(p_default boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  pid uuid;
begin
  select id into pid from players where auth_user_id = auth.uid();
  if pid is null then
    raise exception 'No player profile for the current user';
  end if;

  update players set default_available = p_default where id = pid;

  -- create baseline rows where none exist yet
  insert into availability (week_id, player_id, is_available, is_explicit)
  select w.id, pid, p_default, false
  from weeks w
  where w.start_date >= current_date
  on conflict (week_id, player_id) do nothing;

  -- update only non-explicit (baseline) rows to the new default
  update availability a
  set is_available = p_default
  from weeks w
  where a.week_id = w.id
    and a.player_id = pid
    and w.start_date >= current_date
    and a.is_explicit = false;
end;
$$;
