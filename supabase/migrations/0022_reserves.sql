-- The Runt — reserves (Phase 3): a waiting list for players who become
-- available AFTER a week has been randomised.
-- Run once in the Supabase SQL Editor (safe to re-run).
--
-- When a player flips their availability to Yes on an already-drawn week they
-- are added here instead of into a group. The list is numbered by created_at
-- (order added). An admin later replaces blockers with reserves in the group
-- editor. Re-running / resetting the draw clears the list.

create table if not exists reserves (
  id         uuid primary key default gen_random_uuid(),
  week_id    uuid not null references weeks(id) on delete cascade,
  player_id  uuid not null references players(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (week_id, player_id)
);
create index if not exists reserves_week_id_idx on reserves(week_id);

alter table reserves enable row level security;

drop policy if exists "reserves_read_all" on reserves;
create policy "reserves_read_all" on reserves
  for select to authenticated using (true);

-- A player adds/removes their own reserve spot (the availability toggle).
drop policy if exists "reserves_write_own" on reserves;
create policy "reserves_write_own" on reserves
  for all to authenticated
  using (player_id = current_player_id())
  with check (player_id = current_player_id());

-- Admins manage any reserve (promoting into a group, clearing on re-draw).
drop policy if exists "reserves_admin_write" on reserves;
create policy "reserves_admin_write" on reserves
  for all to authenticated
  using (is_admin())
  with check (is_admin());

do $$ begin
  if not exists (select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='reserves') then
    alter publication supabase_realtime add table reserves;
  end if;
end $$;
