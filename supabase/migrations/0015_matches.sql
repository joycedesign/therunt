-- The Runt — matches (Phase 3): keep two players in the same group
-- Run once in the Supabase SQL Editor (safe to re-run).
--
-- When two members have a match on, they must be drawn into the same group.
-- Either player can create/remove a match they're part of.

create table if not exists matches (
  id         uuid primary key default gen_random_uuid(),
  week_id    uuid not null references weeks(id) on delete cascade,
  player_a   uuid not null references players(id) on delete cascade,
  player_b   uuid not null references players(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (player_a <> player_b)
);
create index if not exists matches_week_id_idx on matches(week_id);
-- One match per unordered pair per week (A v B == B v A).
create unique index if not exists matches_unique_pair
  on matches (week_id, least(player_a, player_b), greatest(player_a, player_b));

drop trigger if exists set_matches_updated_at on matches;
create trigger set_matches_updated_at before update on matches
  for each row execute function set_updated_at();

alter table matches enable row level security;

drop policy if exists "matches_read_all" on matches;
create policy "matches_read_all" on matches
  for select to authenticated using (true);

-- Either player in the match can create/remove it.
drop policy if exists "matches_write_involved" on matches;
create policy "matches_write_involved" on matches
  for all to authenticated
  using (player_a = current_player_id() or player_b = current_player_id())
  with check (player_a = current_player_id() or player_b = current_player_id());

do $$ begin
  if not exists (select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='matches') then
    alter publication supabase_realtime add table matches;
  end if;
end $$;
