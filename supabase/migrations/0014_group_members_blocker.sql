-- The Runt — add is_blocker to group_members (Phase 3)
-- Run once in the Supabase SQL Editor (safe to re-run).
--
-- Blockers are placeholder names padding a short group to a full 4-ball; they
-- don't play. The draw (apply_draw) sets this flag.

alter table group_members
  add column if not exists is_blocker boolean not null default false;
