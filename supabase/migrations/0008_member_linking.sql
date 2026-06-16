-- The Runt — member import prep + claim-by-membership-number sign-in (Phase 2, #4a)
-- Run once in the Supabase SQL Editor (safe to re-run).
--
-- Members are pre-added without an email; when a person signs in they claim
-- their profile by entering their Manly GC membership number. New people (not
-- in the list) get a fresh profile instead.

-- 1. Email becomes optional (imported members have none until they claim).
alter table players alter column email drop not null;

-- 2. Membership number is unique (multiple NULLs allowed for guests/blockers).
create unique index if not exists players_membership_number_key
  on players (membership_number);

-- 3. Stop auto-creating a profile on sign-up; the app's onboarding (below)
--    handles claim-or-create instead.
drop trigger if exists on_auth_user_created on auth.users;

-- 4. Claim an existing member by number, or create a new profile.
create or replace function claim_or_create_member(p_number text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  uemail text;
  num text := nullif(trim(coalesce(p_number, '')), '');
  claimed_by uuid;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  -- Already linked? Nothing to do.
  if exists (select 1 from players where auth_user_id = uid) then
    return;
  end if;

  select email into uemail from auth.users where id = uid;

  if num is not null then
    select auth_user_id into claimed_by from players where membership_number = num;
    if found then
      if claimed_by is not null then
        raise exception 'That membership number is already linked to another account.';
      end if;
      update players
        set auth_user_id = uid, email = uemail
        where membership_number = num;
      return;
    end if;
  end if;

  -- No member with that number — create a fresh profile.
  insert into players (auth_user_id, email, name, preferred_name, membership_number)
  values (uid, uemail, split_part(uemail, '@', 1), split_part(uemail, '@', 1), num);
end;
$$;
