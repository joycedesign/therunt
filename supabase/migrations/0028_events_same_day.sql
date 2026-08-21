-- The Runt — allow multiple events on the same day.
-- Run once in the Supabase SQL Editor (safe to re-run).
--
-- weeks.start_date was globally UNIQUE, which blocked a second event (or an
-- event on a normal Saturday's date). Replace it with a PARTIAL unique index
-- that only applies to ordinary Saturdays (event_type is null), so:
--   * two ordinary Saturdays still can't share a date (seeding stays safe),
--   * any number of events can share a date, with each other and a Saturday.

-- Drop the single-column unique constraint on start_date (name-agnostic).
do $$
declare
  cname text;
begin
  select conname into cname
  from pg_constraint
  where conrelid = 'public.weeks'::regclass
    and contype = 'u'
    and conkey = array[
      (select attnum from pg_attribute
       where attrelid = 'public.weeks'::regclass and attname = 'start_date')
    ];
  if cname is not null then
    execute format('alter table weeks drop constraint %I', cname);
  end if;
end $$;

-- Ordinary Saturdays remain unique per date; events are unconstrained.
create unique index if not exists weeks_saturday_date_key
  on weeks (start_date) where event_type is null;

-- ensure_upcoming_weeks() only creates ordinary Saturdays, so point its
-- ON CONFLICT at the partial index (matching its predicate).
create or replace function ensure_upcoming_weeks(n int default 8)
returns void
language plpgsql
as $$
declare
  next_sat date;
  d date;
  i int;
begin
  next_sat := current_date + ((6 - extract(dow from current_date)::int + 7) % 7);
  for i in 0 .. (n - 1) loop
    d := next_sat + (i * 7);
    insert into weeks (start_date, booking_deadline, status)
    values (
      d,
      ((d - 8)::timestamp + time '16:00') at time zone 'Australia/Sydney',
      'pending'
    )
    on conflict (start_date) where event_type is null do nothing;
  end loop;
end;
$$;
