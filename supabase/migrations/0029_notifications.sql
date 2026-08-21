-- The Runt — notification schedule (Phase 6, slice 1): super-admin tier +
-- an admin-managed set of notification rules. Run once in the SQL Editor.
--
-- Rules are the schedule the app sends push notifications from (the sender +
-- push tokens come in later slices). A rule is either:
--   * time-based  — anchor ('deadline' | 'game') + offset_minutes (negative =
--                    before the anchor), e.g. -2880 = 2 days before the deadline
--   * event-based — anchor null; fired when something happens (kind decides:
--                    groups_drawn on the auto-draw, tee_booked when booked)
-- audience: 'all' (everyone) | 'in' (available players) | 'group' (a group's players)

-- 1. Super-admin tier (above regular admins). Henry (4053) is the super-admin.
alter table players add column if not exists is_super_admin boolean not null default false;
update players set is_super_admin = true where membership_number = '4053';

create or replace function is_super_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((select is_super_admin from players where auth_user_id = auth.uid()), false);
$$;

-- 2. Notification rules.
create table if not exists notification_rules (
  id             uuid primary key default gen_random_uuid(),
  kind           text not null check (kind in
                   ('availability_reminder','deadline_reminder','groups_drawn','tee_booked','custom')),
  title          text not null,
  body           text not null,
  enabled        boolean not null default true,
  anchor         text check (anchor in ('deadline','game')),
  offset_minutes int,
  audience       text not null default 'all' check (audience in ('all','in','group')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

drop trigger if exists set_notification_rules_updated_at on notification_rules;
create trigger set_notification_rules_updated_at before update on notification_rules
  for each row execute function set_updated_at();

alter table notification_rules enable row level security;

drop policy if exists "notif_rules_read" on notification_rules;
create policy "notif_rules_read" on notification_rules
  for select to authenticated using (true);

-- Only the super-admin manages the schedule.
drop policy if exists "notif_rules_write" on notification_rules;
create policy "notif_rules_write" on notification_rules
  for all to authenticated using (is_super_admin()) with check (is_super_admin());

-- 3. Seed the four default rules (only if the table is empty).
insert into notification_rules (kind, title, body, enabled, anchor, offset_minutes, audience)
select * from (values
  ('availability_reminder', 'Nominate for Saturday',
   'Are you in for {date}? Confirm before nominations close at 4pm.', true, 'deadline', -2880, 'all'),
  ('deadline_reminder', 'Last chance to confirm',
   'Nominations for {date} close at 4pm today.', true, 'deadline', -60, 'all'),
  ('groups_drawn', 'The groups are up',
   'The draw for {date} is done — check your group in The Runt.', true, null, null, 'in'),
  ('tee_booked', 'You''re booked',
   '{group} is booked: {teetime}, {tee} tee on {date}.', true, null, null, 'group')
) as v(kind, title, body, enabled, anchor, offset_minutes, audience)
where not exists (select 1 from notification_rules);
