-- The Runt — carts (Phase 3): a per-player cart flag for a week.
-- Run once in the Supabase SQL Editor (safe to re-run).
--
-- Each player individually marks that they want a cart. At draw time the
-- cart-holders are paired up (two share a group); an odd one out rides alone.
-- Each player manages only their own cart flag.

-- (Was briefly a pairwise table like matches — replaced with per-player.)
drop table if exists carts cascade;

create table carts (
  id         uuid primary key default gen_random_uuid(),
  week_id    uuid not null references weeks(id) on delete cascade,
  player_id  uuid not null references players(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (week_id, player_id)
);
create index if not exists carts_week_id_idx on carts(week_id);

alter table carts enable row level security;

drop policy if exists "carts_read_all" on carts;
create policy "carts_read_all" on carts
  for select to authenticated using (true);

-- Each player creates/removes only their own cart flag.
drop policy if exists "carts_write_own" on carts;
create policy "carts_write_own" on carts
  for all to authenticated
  using (player_id = current_player_id())
  with check (player_id = current_player_id());

do $$ begin
  if not exists (select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='carts') then
    alter publication supabase_realtime add table carts;
  end if;
end $$;
