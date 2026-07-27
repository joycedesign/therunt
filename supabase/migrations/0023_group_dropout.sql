-- The Runt — drop-out handling (Phase 3): if a player who is already in a drawn
-- group goes unavailable, their slot is held by turning them into a blocker.
-- Run once in the Supabase SQL Editor (safe to re-run).
--
-- group_members is admin-only (RLS gm_admin_write), so a player can't flip their
-- own row directly. This security-definer RPC lets a player toggle ONLY their
-- own is_blocker flag for a given week: true when they drop out, false when they
-- rejoin (reclaiming the same slot).

create or replace function set_own_group_blocker(p_week_id uuid, p_blocker boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid;
begin
  me := current_player_id();
  if me is null then
    raise exception 'No player for current user';
  end if;
  update group_members gm
  set is_blocker = p_blocker
  from groups g
  where gm.group_id = g.id
    and g.week_id = p_week_id
    and gm.player_id = me;
end;
$$;
