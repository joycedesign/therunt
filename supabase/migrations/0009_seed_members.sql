-- The Runt — import existing Manly GC members (Phase 2, #4)
-- Run once in the Supabase SQL Editor (safe to re-run).
--
-- Members from Henry's roster (shortname + membership number). No email yet;
-- each person claims their profile by entering their number on first sign-in.
-- Guests (Pikey, Chad) and the blocker (Etienne) are NOT members and are
-- intentionally excluded.

insert into players (name, preferred_name, membership_number, status)
values
  ('Brian',  'Brian',  '6221', 'active'),
  ('Tweeds', 'Tweeds', '3025', 'active'),
  ('Trotty', 'Trotty', '6359', 'active'),
  ('Hallie', 'Hallie', '6321', 'active'),
  ('gaboh',  'gaboh',  '3026', 'active'),
  ('Stevo',  'Stevo',  '2755', 'active'),
  ('LJ',     'LJ',     '2457', 'active'),
  ('Miksu',  'Miksu',  '6334', 'active'),
  ('DK',     'DK',     '751',  'active'),
  ('Dunny',  'Dunny',  '2768', 'active'),
  ('wayno',  'wayno',  '2383', 'active'),
  ('OMW',    'OMW',    '4048', 'active'),
  ('CT',     'CT',     '5147', 'active'),
  ('MJ',     'MJ',     '5152', 'active'),
  ('froth',  'froth',  '5038', 'active'),
  ('Matt',   'Matt',   '6305', 'active')
on conflict (membership_number) do nothing;
