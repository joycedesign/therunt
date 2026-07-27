-- The Runt — event extras (Phase 3): optional time + emoji for events.
-- Run once in the Supabase SQL Editor (safe to re-run).
--
-- event_time: free "HH:MM" (24h) string, nullable — mainly for non-golf events.
-- emoji: a single emoji shown beside the event name (non-golf events).

alter table weeks add column if not exists event_time text;
alter table weeks add column if not exists emoji text;
