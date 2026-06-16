-- The Runt — default availability (Phase 2 enhancement)
-- Run once in the Supabase SQL Editor (safe to re-run).
--
-- Lets each player set a personal default (playing / not playing) that
-- pre-fills their availability for upcoming Saturdays. Regulars set
-- default = playing and only deselect the dates they can't make.

-- 1. The default flag on the profile.
alter table players
  add column if not exists default_available boolean not null default false;

-- 2. When a new week is created, seed every active player's availability
--    row from their default. (Existing weeks are handled by step 3 when a
--    player sets their default.)
create or replace function seed_week_availability()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into availability (week_id, player_id, is_available)
  select new.id, p.id, p.default_available
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

-- 3. Caller sets their own default and applies it to all upcoming Saturdays.
--    Overwrites existing future rows on purpose ("preselect all future dates"),
--    so pressing the toggle is a deliberate bulk action.
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

  insert into availability (week_id, player_id, is_available)
  select w.id, pid, p_default
  from weeks w
  where w.start_date >= current_date
  on conflict (week_id, player_id)
    do update set is_available = excluded.is_available;
end;
$$;
