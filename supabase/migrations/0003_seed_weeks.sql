-- The Runt — generate upcoming Saturdays (Phase 2 / availability)
-- Run once in the Supabase SQL Editor (safe to re-run).
--
-- Creates a reusable function that inserts the next N Saturdays as `weeks`
-- rows (if they don't already exist), with booking_deadline set to 4pm
-- (Australia/Sydney) 8 days before each Saturday. Later this same function
-- can be scheduled with pg_cron to roll the calendar forward.

create or replace function ensure_upcoming_weeks(n int default 8)
returns void
language plpgsql
as $$
declare
  next_sat date;
  d date;
  i int;
begin
  -- The first Saturday on or after today (dow: Sunday=0 .. Saturday=6).
  next_sat := current_date + ((6 - extract(dow from current_date)::int + 7) % 7);

  for i in 0 .. (n - 1) loop
    d := next_sat + (i * 7);
    insert into weeks (start_date, booking_deadline, status)
    values (
      d,
      ((d - 8)::timestamp + time '16:00') at time zone 'Australia/Sydney',
      'pending'
    )
    on conflict (start_date) do nothing;
  end loop;
end;
$$;

-- Seed the next 8 Saturdays now.
select ensure_upcoming_weeks(8);
