-- The Runt — let admins manage any guest (for the group editor)
-- Run once in the Supabase SQL Editor (safe to re-run).
-- Members still manage their own guests via guests_write_own (migration 0011).

drop policy if exists "guests_admin_write" on guests;
create policy "guests_admin_write" on guests
  for all to authenticated
  using (is_admin())
  with check (is_admin());
