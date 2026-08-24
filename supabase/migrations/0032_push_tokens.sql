-- The Runt — Expo push tokens (Phase 6). Run once in the SQL Editor.
--
-- One row per device that registered for push. A player may have several
-- (phone + tablet). The sender (later) reads these to deliver notifications.

create table if not exists push_tokens (
  id         uuid primary key default gen_random_uuid(),
  player_id  uuid not null references players(id) on delete cascade,
  token      text not null unique,     -- Expo push token (ExponentPushToken[...])
  platform   text,                     -- 'ios' | 'android'
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists push_tokens_player_id_idx on push_tokens(player_id);

drop trigger if exists set_push_tokens_updated_at on push_tokens;
create trigger set_push_tokens_updated_at before update on push_tokens
  for each row execute function set_updated_at();

alter table push_tokens enable row level security;

-- A player manages only their own device tokens.
drop policy if exists "push_tokens_own" on push_tokens;
create policy "push_tokens_own" on push_tokens
  for all to authenticated
  using (player_id = current_player_id())
  with check (player_id = current_player_id());
