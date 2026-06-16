-- The Runt — initial schema (Phase 1 foundation)
-- Run once in the Supabase SQL Editor.
-- Safe to re-run: uses IF NOT EXISTS / idempotent guards where practical.
--
-- Conventions (from CLAUDE.md):
--   * every table: id uuid PK, created_at, updated_at
--   * Row-Level Security (RLS) enabled on every table
--   * v1 access model: any signed-in player can read everything (small, trusted
--     ~20-person group); writes are scoped to "your own" rows where it matters.
--     Organiser/Runt-only restrictions can be tightened in a later slice.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$ begin
  create type player_status as enum ('active', 'inactive', 'blocked');
exception when duplicate_object then null; end $$;

do $$ begin
  create type week_status as enum ('pending', 'draw_complete', 'booked', 'completed', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type group_booking_status as enum ('open', 'confirmed', 'cancelled');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- updated_at trigger helper
-- ---------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- players
-- ---------------------------------------------------------------------------
create table if not exists players (
  id            uuid primary key default gen_random_uuid(),
  auth_user_id  uuid references auth.users(id) on delete set null,
  email         text not null unique,
  name          text not null,
  preferred_name text,
  phone         text,
  status        player_status not null default 'active',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists players_auth_user_id_idx on players(auth_user_id);

-- ---------------------------------------------------------------------------
-- weeks
-- ---------------------------------------------------------------------------
create table if not exists weeks (
  id               uuid primary key default gen_random_uuid(),
  start_date       date not null unique,
  booking_deadline timestamptz,
  status           week_status not null default 'pending',
  runt_player_id   uuid references players(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists weeks_runt_player_id_idx on weeks(runt_player_id);

-- ---------------------------------------------------------------------------
-- availability  (one row per player per week)
-- ---------------------------------------------------------------------------
create table if not exists availability (
  id           uuid primary key default gen_random_uuid(),
  week_id      uuid not null references weeks(id) on delete cascade,
  player_id    uuid not null references players(id) on delete cascade,
  is_available boolean not null default false,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (week_id, player_id)
);
create index if not exists availability_week_id_idx on availability(week_id);
create index if not exists availability_player_id_idx on availability(player_id);

-- ---------------------------------------------------------------------------
-- groups
-- ---------------------------------------------------------------------------
create table if not exists groups (
  id              uuid primary key default gen_random_uuid(),
  week_id         uuid not null references weeks(id) on delete cascade,
  group_name      text not null,
  target_size     int not null default 4,
  actual_size     int,
  booking_status  group_booking_status not null default 'open',
  tee_time        timestamptz,
  target_tee_time timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists groups_week_id_idx on groups(week_id);

-- ---------------------------------------------------------------------------
-- group_members
-- ---------------------------------------------------------------------------
create table if not exists group_members (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references groups(id) on delete cascade,
  player_id  uuid not null references players(id) on delete cascade,
  joined_at  timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (group_id, player_id)
);
create index if not exists group_members_group_id_idx on group_members(group_id);
create index if not exists group_members_player_id_idx on group_members(player_id);

-- ---------------------------------------------------------------------------
-- results
-- ---------------------------------------------------------------------------
create table if not exists results (
  id              uuid primary key default gen_random_uuid(),
  week_id         uuid not null references weeks(id) on delete cascade,
  player_id       uuid not null references players(id) on delete cascade,
  gross           int,
  nett            int,
  score           int,
  finish_position int,
  is_winner       boolean not null default false,
  is_loser        boolean not null default false,
  source_url      text,
  recorded_at     timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (week_id, player_id)
);
create index if not exists results_week_id_idx on results(week_id);
create index if not exists results_player_id_idx on results(player_id);

-- ---------------------------------------------------------------------------
-- runt_history
-- ---------------------------------------------------------------------------
create table if not exists runt_history (
  id          uuid primary key default gen_random_uuid(),
  week_id     uuid not null references weeks(id) on delete cascade,
  player_id   uuid not null references players(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists runt_history_week_id_idx on runt_history(week_id);
create index if not exists runt_history_player_id_idx on runt_history(player_id);

-- ---------------------------------------------------------------------------
-- booking_targets  (future booking bot reads these; manual flow ignores them)
-- ---------------------------------------------------------------------------
create table if not exists booking_targets (
  id                   uuid primary key default gen_random_uuid(),
  week_id              uuid not null references weeks(id) on delete cascade,
  group_id             uuid not null references groups(id) on delete cascade,
  target_tee_time      timestamptz not null,
  fallback_rank        int not null,
  fallback_description text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index if not exists booking_targets_week_id_idx on booking_targets(week_id);
create index if not exists booking_targets_group_id_idx on booking_targets(group_id);

-- ---------------------------------------------------------------------------
-- updated_at triggers (one per table)
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'players','weeks','availability','groups','group_members',
    'results','runt_history','booking_targets'
  ] loop
    execute format('drop trigger if exists set_%1$s_updated_at on %1$s;', t);
    execute format(
      'create trigger set_%1$s_updated_at before update on %1$s
         for each row execute function set_updated_at();', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------------
alter table players         enable row level security;
alter table weeks           enable row level security;
alter table availability    enable row level security;
alter table groups          enable row level security;
alter table group_members   enable row level security;
alter table results         enable row level security;
alter table runt_history    enable row level security;
alter table booking_targets enable row level security;

-- Helper: the players.id belonging to the current logged-in user.
create or replace function current_player_id()
returns uuid language sql stable as $$
  select id from players where auth_user_id = auth.uid() limit 1;
$$;

-- Any signed-in player can read everything (group-wide visibility).
do $$
declare t text;
begin
  foreach t in array array[
    'players','weeks','availability','groups','group_members',
    'results','runt_history','booking_targets'
  ] loop
    execute format('drop policy if exists "read_all_authenticated" on %1$s;', t);
    execute format(
      'create policy "read_all_authenticated" on %1$s
         for select to authenticated using (true);', t);
  end loop;
end $$;

-- players: you may update your own profile row.
drop policy if exists "players_update_own" on players;
create policy "players_update_own" on players
  for update to authenticated
  using (auth_user_id = auth.uid())
  with check (auth_user_id = auth.uid());

-- availability: you may create / change / remove your own rows.
drop policy if exists "availability_write_own" on availability;
create policy "availability_write_own" on availability
  for all to authenticated
  using (player_id = current_player_id())
  with check (player_id = current_player_id());

-- Organiser-managed tables: any signed-in player may write for now (trusted
-- ~20-person group). Tighten to "Runt only" in a later slice.
do $$
declare t text;
begin
  foreach t in array array[
    'weeks','groups','group_members','results','runt_history','booking_targets'
  ] loop
    execute format('drop policy if exists "manage_authenticated" on %1$s;', t);
    execute format(
      'create policy "manage_authenticated" on %1$s
         for all to authenticated using (true) with check (true);', t);
  end loop;
end $$;
