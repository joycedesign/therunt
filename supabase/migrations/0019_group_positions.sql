-- The Runt — admin group editing: ordering + admin-only membership writes
-- Run once in the Supabase SQL Editor (safe to re-run).

alter table group_members add column if not exists position int not null default 0;

-- Only admins may change group membership directly (move/add/remove/reorder).
-- apply_draw/reset_draw run as definer and bypass this. Reads stay open
-- (read_all_authenticated from migration 0001).
drop policy if exists "manage_authenticated" on group_members;
drop policy if exists "gm_admin_write" on group_members;
create policy "gm_admin_write" on group_members
  for all to authenticated
  using (is_admin())
  with check (is_admin());
