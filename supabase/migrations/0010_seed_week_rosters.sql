-- The Runt — seed availability for the first 4 Saturdays from Henry's roster.
-- Run once in the Supabase SQL Editor (safe to re-run). Requires members
-- imported (migration 0009). Members only — guests (Pikey, Chad) and the
-- blocker (Etienne) are added once the guests feature exists.

-- Sat 20 Jun 2026
insert into availability (week_id, player_id, is_available, is_explicit)
select w.id, p.id, true, true
from weeks w, players p
where w.start_date = '2026-06-20'
  and p.membership_number in
    ('6221','3025','6359','6321','3026','2755','2457','6334','751','2768','2383','4048','5147','5152')
on conflict (week_id, player_id) do update set is_available = true, is_explicit = true;

-- Sat 27 Jun 2026
insert into availability (week_id, player_id, is_available, is_explicit)
select w.id, p.id, true, true
from weeks w, players p
where w.start_date = '2026-06-27'
  and p.membership_number in
    ('2755','3026','2457','6334','751','5152','5038','6305','2383','3025')
on conflict (week_id, player_id) do update set is_available = true, is_explicit = true;

-- Sat 4 Jul 2026
insert into availability (week_id, player_id, is_available, is_explicit)
select w.id, p.id, true, true
from weeks w, players p
where w.start_date = '2026-07-04'
  and p.membership_number in
    ('6221','2755','5038','6321','3026','2457','6334','751','5152')
on conflict (week_id, player_id) do update set is_available = true, is_explicit = true;

-- Sat 11 Jul 2026
insert into availability (week_id, player_id, is_available, is_explicit)
select w.id, p.id, true, true
from weeks w, players p
where w.start_date = '2026-07-11'
  and p.membership_number in
    ('2755','5038','6359','2457','6334','751','5152')
on conflict (week_id, player_id) do update set is_available = true, is_explicit = true;
