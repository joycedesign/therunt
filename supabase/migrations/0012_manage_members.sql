-- The Runt — let the organiser add/manage members (Phase 2 #4b)
-- Run once in the Supabase SQL Editor (safe to re-run).
--
-- v1 access model: any signed-in member can manage the *unclaimed* member
-- records (those not yet linked to a login). Claimed profiles remain editable
-- only by their owner (existing players_update_own policy). Tighten to an
-- organiser/Runt role later if needed.

drop policy if exists "players_insert_unclaimed" on players;
create policy "players_insert_unclaimed" on players
  for insert to authenticated
  with check (auth_user_id is null);

drop policy if exists "players_update_unclaimed" on players;
create policy "players_update_unclaimed" on players
  for update to authenticated
  using (auth_user_id is null)
  with check (auth_user_id is null);

drop policy if exists "players_delete_unclaimed" on players;
create policy "players_delete_unclaimed" on players
  for delete to authenticated
  using (auth_user_id is null);
