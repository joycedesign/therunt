-- The Runt — availability sync for Sat 1 Aug 2026 (from the sheet).
-- Run once in the Supabase SQL editor. Idempotent — safe to re-run.
--
-- 15 players IN (matched by membership number); every other active member is
-- explicitly set OUT for this week.

-- 1. Ensure the week exists. Confirm deadline = 4pm, 8 days before = Fri 24 Jul.
insert into weeks (start_date, booking_deadline, status)
values ('2026-08-01', '2026-07-24 16:00:00+10', 'pending')
on conflict (start_date) do nothing;

-- 2. Set availability for every active member in one pass:
--    on the sheet -> is_available true, everyone else -> false.
insert into availability (week_id, player_id, is_available)
select w.id,
       p.id,
       p.membership_number in (
         '3047',  -- Bok
         '3025',  -- Tweeds
         '6221',  -- Brian
         '3026',  -- gaboh
         '2755',  -- Stevo
         '6321',  -- Hallie
         '2768',  -- Dunny
         '6334',  -- Miksu
         '751',   -- DK
         '6305',  -- Matt (cart)
         '2383',  -- wayno
         '5147',  -- CT / Tim (cart)
         '5038',  -- froth
         '2770',  -- Don
         '6336'   -- Etienne
       ) as is_available
from weeks w
cross join players p
where w.start_date = '2026-08-01'
  and p.status = 'active'
on conflict (week_id, player_id)
do update set is_available = excluded.is_available;
