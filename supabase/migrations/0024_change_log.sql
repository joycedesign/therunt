-- The Runt — change log (Phase 3): an append-only audit trail per week, shown
-- in the app next to Re-randomize / Edit groups.
-- Run once in the Supabase SQL Editor (safe to re-run).
--
-- Each row records who did what and when (author name snapshotted for display).
-- Append-only: RLS allows read + insert to any signed-in player, no update/delete.

create table if not exists change_log (
  id               uuid primary key default gen_random_uuid(),
  week_id          uuid not null references weeks(id) on delete cascade,
  author_player_id uuid references players(id) on delete set null,
  author_name      text not null,
  action           text not null,
  created_at       timestamptz not null default now()
);
create index if not exists change_log_week_idx on change_log(week_id, created_at);

alter table change_log enable row level security;

drop policy if exists "change_log_read_all" on change_log;
create policy "change_log_read_all" on change_log
  for select to authenticated using (true);

-- Any signed-in player can append an entry (trusted ~20-person group).
drop policy if exists "change_log_insert" on change_log;
create policy "change_log_insert" on change_log
  for insert to authenticated with check (true);

do $$ begin
  if not exists (select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='change_log') then
    alter publication supabase_realtime add table change_log;
  end if;
end $$;
