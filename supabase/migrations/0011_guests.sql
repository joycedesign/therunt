-- The Runt — guests (Phase 2 #1)
-- Run once in the Supabase SQL Editor (safe to re-run).
--
-- A member can invite one or more guests for a given Saturday. A guest takes
-- a slot in the host's group at draw time (group_id set then). Guests are
-- non-registered people: typed in (name + Golf Australia number) for now;
-- a Manly member-list picker can come later (source = 'club_list').

do $$ begin
  create type guest_source as enum ('manual', 'club_list');
exception when duplicate_object then null; end $$;

create table if not exists guests (
  id             uuid primary key default gen_random_uuid(),
  week_id        uuid not null references weeks(id) on delete cascade,
  host_player_id uuid not null references players(id) on delete cascade,
  group_id       uuid references groups(id) on delete set null,
  name           text not null,
  ga_number      text,
  source         guest_source not null default 'manual',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists guests_week_id_idx on guests(week_id);
create index if not exists guests_host_player_id_idx on guests(host_player_id);

drop trigger if exists set_guests_updated_at on guests;
create trigger set_guests_updated_at before update on guests
  for each row execute function set_updated_at();

alter table guests enable row level security;

drop policy if exists "guests_read_all" on guests;
create policy "guests_read_all" on guests
  for select to authenticated using (true);

-- A member manages only their own guests.
drop policy if exists "guests_write_own" on guests;
create policy "guests_write_own" on guests
  for all to authenticated
  using (host_player_id = current_player_id())
  with check (host_player_id = current_player_id());

-- Live updates so the roster reflects guests immediately.
do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'guests'
  ) then
    alter publication supabase_realtime add table guests;
  end if;
end $$;
