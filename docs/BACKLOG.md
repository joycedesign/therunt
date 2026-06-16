# The Runt — backlog

Captured feature requests not yet built. See [CLAUDE.md](../CLAUDE.md) for the
overall build order.

## Availability / profile enhancements (Henry, requested during Phase 2)

### 1. Guests
- Registered members can invite **1 or more** guests per playing date.
- A guest is either a **non-registered member** or a **non-registered
  non-member**.
- Guests are added either by:
  - **Name + Golf Australia number**, or
  - picking from a **list of Manly Golf Club members** (Henry to supply the
    list).
- **Draw rule:** a guest is placed in the **same group as the member who added
  them**.
- Likely schema: a `guests` table (week_id, host_player_id, name, ga_number,
  source) so guests count as occupants in the draw and stay with their host.

### 2. Who's-in roster + the draw (ties into Phase 3)
- **Tap a Saturday row to expand** the list of members registered as playing.
- **Before 4:05pm, 8 days before the playing date:** show a flat,
  **non-grouped** list of who's in.
- **At 4:05pm, 8 days before:** the list is **randomly drawn into groups of 2,
  3, or 4** depending on numbers.
- **Blockers** (reinstated — see conflict below): groups that fall short of 4
  are padded with "blockers" drawn from players **not** playing that day:
  - group of 3 → + **1 blocker**
  - group of 2 → + **2 blockers**
  - (so every booked group fills a 4-ball; blockers hold the slots.)

### 3. Default availability (Profile setting)
- Profile toggle: **default playing** or **default not playing**.
- Applied to **newly-added future Saturdays**:
  - default = **playing** → all future dates pre-selected **In**.
  - default = **not playing** → all future dates pre-selected **Out**.
- Goal: regulars set default = playing and only deselect the dates they can't
  make (and vice-versa).
- Likely schema: `players.default_available boolean`; when weeks are created,
  auto-create each active player's `availability` row using their default.

## Decisions (folded into CLAUDE.md)
- **Draw timing:** **4:05pm, 8 days before** the Saturday (5 min after the 4pm
  confirm deadline that shipped in Phase 2). Supersedes the old "Friday 6pm".
- **Blockers:** reinstated as **placeholder names only** — they hold booking
  slots so strangers can't join a short group; they do **not** play. Tracked via
  `group_members.is_blocker`.
- **Guests:** a guest **occupies one of the four slots** in the host's group; the
  draw must reserve room for guests. Tracked via a `guests` table.
