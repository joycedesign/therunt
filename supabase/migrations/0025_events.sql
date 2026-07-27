-- The Runt — special events (Phase 3): admin-created dates that show a name
-- instead of the Saturday date. Run once in the Supabase SQL Editor (safe to re-run).
--
-- A week with event_type set is an "event":
--   'golf'  — behaves exactly like a normal golf Saturday (draw, groups, booking)
--   'other' — a non-golf gathering: RSVP only (no draw/groups/booking), with
--             optional +1 (partner) and/or other guests per the flags below.
-- event_type null = an ordinary Saturday.

alter table weeks add column if not exists title text;
alter table weeks add column if not exists event_type text
  check (event_type in ('golf', 'other'));
-- Non-golf event options (ignored for Saturdays and golf events):
alter table weeks add column if not exists allow_plus_one boolean not null default false;
alter table weeks add column if not exists allow_guests   boolean not null default false;

-- Distinguish a member's partner (+1) from other guests they bring.
alter table guests add column if not exists is_plus_one boolean not null default false;
