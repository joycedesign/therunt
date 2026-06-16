-- The Runt — enable real-time sync (Phase 2)
-- Run once in the Supabase SQL Editor (safe to re-run).
--
-- Adds `availability` and `players` to the supabase_realtime publication so
-- the app receives live INSERT/UPDATE/DELETE events and keeps every device's
-- availability list and profile default in sync without reloading. RLS still
-- applies: clients only receive changes to rows they're allowed to read.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'availability'
  ) then
    alter publication supabase_realtime add table availability;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'players'
  ) then
    alter publication supabase_realtime add table players;
  end if;
end $$;
