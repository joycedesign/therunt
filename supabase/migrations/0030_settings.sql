-- The Runt — app settings / personalisation (Phase 6). Run once in the SQL Editor.
--
-- A single-row settings table the super-admin edits to personalise the app:
--   organiser_name — the weekly organiser role term (default "The Runt"),
--                    used by the Runt-rotation feature. This is the ROLE label,
--                    NOT the app title (the app is always called "The Runt").
-- Forward-compatible with multi-tenancy: when clubs land, add club_id here and
-- drop the singleton guard so each club has its own row.

create table if not exists settings (
  id             uuid primary key default gen_random_uuid(),
  singleton      boolean not null default true,
  organiser_name text not null default 'The Runt',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
-- Exactly one row for now.
create unique index if not exists settings_singleton_key on settings (singleton);

drop trigger if exists set_settings_updated_at on settings;
create trigger set_settings_updated_at before update on settings
  for each row execute function set_updated_at();

alter table settings enable row level security;

-- Branding is public (shown on the sign-in screen before auth).
drop policy if exists "settings_read_all" on settings;
create policy "settings_read_all" on settings
  for select using (true);

-- Only the super-admin personalises the app.
drop policy if exists "settings_write_super" on settings;
create policy "settings_write_super" on settings
  for all to authenticated using (is_super_admin()) with check (is_super_admin());

insert into settings (singleton) values (true) on conflict (singleton) do nothing;

do $$ begin
  if not exists (select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='settings') then
    alter publication supabase_realtime add table settings;
  end if;
end $$;
