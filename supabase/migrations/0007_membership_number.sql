-- The Runt — add Manly Golf Club membership number to profiles (Phase 2)
-- Run once in the Supabase SQL Editor (safe to re-run).
--
-- Stored as text (numbers shown in the roster, but text keeps leading zeros
-- and any future formats safe). Nullable: guests/blockers aren't members.

alter table players
  add column if not exists membership_number text;
