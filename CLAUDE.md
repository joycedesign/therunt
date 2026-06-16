# The Runt

A small cross-platform app for a ~20-person golf group to organise their weekly
Saturday games: nominate availability, auto-draw balanced groups, book tee
times manually, then scrape results to crown each week's "Runt".

## Stack (decided)

- **Expo (React Native) + TypeScript** — one codebase for iOS, Android, and web.
- **Supabase** — Postgres, auth (email magic-link), `pg_cron`, Edge Functions.
- **Expo Push Notifications** — mobile alerts.
- **Git / GitHub** — source control from day one (remote: `joycedesign/therunt`).

## Weekly workflow

1. Players nominate which upcoming Saturdays they're available.
2. **Friday before 6pm:** a scheduled job randomly sorts available players into
   balanced groups of **4, dropping to 3 only when the numbers require it**.
3. The current **Runt** reviews the draw and **manually books** the tee times on
   miGolf at 6pm, then marks each group as booked (with its confirmed tee time)
   in the app.
4. Results are published on the club's **MiScore leaderboard**. The app scrapes
   them to find the week's winner and loser.
5. The **loser becomes the next Runt** and arranges the following week's groups
   and bookings.

~20 players total; not everyone plays every week.

## Build order (small, testable slices — ship a safe manual v1 first)

1. **Foundation** — auth, player profiles, database schema. ← *current*
2. **Weekly availability** — players nominate which Saturdays they're in.
3. **Friday random draw** — balanced groups of 3–4.
4. **Results + Runt** — scrape MiScore, set winner/loser, assign next Runt,
   leaderboard/stats.
5. **Manual booking** — Runt records tee times and marks groups booked → **ship v1**.
6. **Notifications & polish**.
7. **Ship** — TestFlight, Play Store internal testing, web deploy.
8. *(Later, not now)* automated miClub/miGolf booking bot.

## Future-ready design (do NOT build yet)

A later phase will add a Playwright booking bot (hosted in Sydney) that snipes
prime tee times the instant booking opens at 6pm. We are **not** building it now,
but the schema stores each group's **target tee time** and **ranked fallback
choices** (`booking_targets`) so the bot can later read those same fields.
Booking confirmation is kept separate from the draw so the manual review step
is always preserved.

## How we work

- One feature per slice; each slice is testable on a phone via Expo Go.
- Commit to git after each working slice with a clear message.
- Henry tests on device and reports back before we move on.
- Build the safe organiser core first; nothing risky before v1 ships.

## Proposed database schema (for approval)

Conventions: every table has `id uuid primary key default gen_random_uuid()`,
plus `created_at`/`updated_at timestamptz default now()` unless noted.
Row-level security (RLS) will be enabled on every table.

### players
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| auth_user_id | uuid | references `auth.users(id)`; links profile to login |
| email | text unique | used for magic-link auth |
| name | text | full name |
| preferred_name | text | what we show in the UI |
| phone | text, nullable | optional |
| status | enum(`active`,`inactive`,`blocked`) | |

### weeks
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| start_date | date | the Saturday being played |
| booking_deadline | timestamptz | typically Friday 6pm |
| status | enum(`pending`,`draw_complete`,`booked`,`completed`,`cancelled`) | |
| runt_player_id | uuid → players(id), nullable | the Runt responsible for this week |

### availability
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| week_id | uuid → weeks(id) | |
| player_id | uuid → players(id) | |
| is_available | boolean | |
| notes | text, nullable | |
| | | unique (week_id, player_id) |

### groups
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| week_id | uuid → weeks(id) | |
| group_name | text | e.g. "Group A" |
| target_size | int | usually 4 |
| actual_size | int | |
| booking_status | enum(`open`,`confirmed`,`cancelled`) | |
| tee_time | timestamptz, nullable | confirmed by the Runt after booking |
| target_tee_time | timestamptz, nullable | preferred time (for future bot) |

### group_members
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| group_id | uuid → groups(id) | |
| player_id | uuid → players(id) | |
| joined_at | timestamptz | |
| | | unique (group_id, player_id) |

### results
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| week_id | uuid → weeks(id) | |
| player_id | uuid → players(id) | |
| gross | int, nullable | |
| nett | int, nullable | |
| score | int, nullable | the figure used to rank (usually nett) |
| finish_position | int, nullable | |
| is_winner | boolean default false | |
| is_loser | boolean default false | becomes next week's Runt |
| source_url | text | the MiScore page scraped |
| recorded_at | timestamptz | |

### runt_history
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| week_id | uuid → weeks(id) | |
| player_id | uuid → players(id) | |
| assigned_at | timestamptz | |
| notes | text, nullable | |

### booking_targets  *(future bot reads these; manual flow ignores them)*
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| week_id | uuid → weeks(id) | |
| group_id | uuid → groups(id) | |
| target_tee_time | timestamptz | |
| fallback_rank | int | 1 = first choice, 2 = next, … |
| fallback_description | text, nullable | human note, e.g. "any time 7–8am" |

### Notable changes from the earlier draft
- Groups standardised to **4, dropping to 3 only when needed** (was "groups of 4").
- `players.auth_user_id` added to link a profile to its Supabase login.
- Dropped `availability.is_blocker` / `group_members.is_blocker`+`role`: with manual
  booking we simply reserve slots; "blocker" modelling can return later if needed.
- Results source is the club **MiScore leaderboard**, not Golf Australia.

## Open question
- **Exact MiScore leaderboard URL** — needed in Phase 4 to check for a JSON feed
  vs. HTML scraping. (Pending from Henry.)
