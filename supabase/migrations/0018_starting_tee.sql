-- The Runt — starting tee (1st or 11th) on booked groups
-- Run once in the Supabase SQL Editor (safe to re-run).

alter table groups add column if not exists starting_tee int; -- 1 or 11
