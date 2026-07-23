-- The Runt — carts (Phase 3): keep two cart-sharers in the same group.
-- Run once in the Supabase SQL Editor (safe to re-run).
--
-- Same mechanic as matches: when two members share a cart, they must be drawn
-- into the same group. Either player can create/remove a cart they're part of.

create table if not exists carts (
  id         uuid primary key default gen_random_uuid(),
  week_id    uuid not null references weeks(id) on delete cascade,
  player_a   uuid not null references players(id) on delete cascade,
  player_b   uuid not null references players(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (player_a <> player_b)
);
create index if not exists carts_week_id_idx on carts(week_id);
-- One cart per unordered pair per week (A+B == B+A).
create unique index if not exists carts_unique_pair
  on carts (week_id, least(player_a, player_b), greatest(player_a, player_b));

drop trigger if exists set_carts_updated_at on carts;
create trigger set_carts_updated_at before update on carts
  for each row execute function set_updated_at();

alter table carts enable row level security;

drop policy if exists "carts_read_all" on carts;
create policy "carts_read_all" on carts
  for select to authenticated using (true);

-- Either player in the cart can create/remove it.
drop policy if exists "carts_write_involved" on carts;
create policy "carts_write_involved" on carts
  for all to authenticated
  using (player_a = current_player_id() or player_b = current_player_id())
  with check (player_a = current_player_id() or player_b = current_player_id());

do $$ begin
  if not exists (select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='carts') then
    alter publication supabase_realtime add table carts;
  end if;
end $$;
