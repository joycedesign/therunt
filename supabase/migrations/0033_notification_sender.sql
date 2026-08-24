-- The Runt — push notification sender (Phase 6 slice B). Run once in the SQL Editor.
--
-- A pg_cron job (every 5 min, like the auto-draw) reads notification_rules and
-- delivers due notifications via Expo's push API using pg_net. A dedup ledger
-- ensures each (rule, week[, group], recipient) fires once.
--
-- Requires pg_net. On Supabase: Dashboard → Database → Extensions → enable
-- "pg_net" (or the create extension below if you have rights).
--
-- NOTE on first activation: time-based reminders only fire within 6h of their
-- scheduled moment, so stale ones won't backfill. But an already-drawn or
-- already-booked UPCOMING week will notify on the first run — disable those
-- rules first, or pre-insert their dedup keys, if you don't want the backfill.

create extension if not exists pg_net;

create table if not exists notifications_sent (
  dedup_key text primary key,
  sent_at   timestamptz not null default now()
);

-- Collect the recipients' Expo tokens and POST a batch to Expo's push API.
create or replace function _push_send(p_player_ids uuid[], p_title text, p_body text, p_data jsonb)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  msgs jsonb;
begin
  select jsonb_agg(jsonb_build_object('to', pt.token, 'title', p_title, 'body', p_body, 'data', p_data))
  into msgs
  from push_tokens pt
  where pt.player_id = any(p_player_ids);

  if msgs is null then
    return;   -- no registered devices among the recipients
  end if;

  perform net.http_post(
    url := 'https://exp.host/--/api/v2/push/send',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := msgs
  );
end;
$$;

create or replace function run_notifications()
returns void
language plpgsql security definer set search_path = public
as $$
declare
  org       text;
  r         record;
  w         record;
  g         record;
  fire_time timestamptz;
  recips    uuid[];
  k         text;
  d_date    text;
  d_dl      text;
  title     text;
  body      text;
begin
  select organiser_name into org from settings limit 1;
  org := coalesce(org, 'The Runt');

  for r in select * from notification_rules where enabled loop
    begin
      ----------------------------------------------------------------------
      if r.kind = 'tee_booked' then
        -- One notification per booked group, to that group's real players.
        for g in
          select gr.id, gr.week_id, gr.group_name, gr.tee_time, gr.starting_tee, wk.start_date
          from groups gr join weeks wk on wk.id = gr.week_id
          where gr.booking_status = 'confirmed' and gr.tee_time is not null
            and wk.start_date >= current_date
        loop
          k := r.id::text || ':' || g.id::text;
          if not exists (select 1 from notifications_sent where dedup_key = k) then
            select array_agg(gm.player_id) into recips
            from group_members gm where gm.group_id = g.id and not gm.is_blocker;
            if recips is not null and array_length(recips, 1) > 0 then
              insert into notifications_sent(dedup_key) values (k) on conflict do nothing;
              d_date := to_char(g.start_date, 'Dy DD Mon');
              title := replace(replace(r.title, '{organiser}', org), '{group}', g.group_name);
              body := r.body;
              body := replace(body, '{date}', d_date);
              body := replace(body, '{group}', g.group_name);
              body := replace(body, '{teetime}',
                coalesce(to_char(g.tee_time at time zone 'Australia/Sydney', 'HH12:MIam'), ''));
              body := replace(body, '{tee}', case when g.starting_tee = 11 then '11th' else '1st' end);
              body := replace(body, '{organiser}', org);
              perform _push_send(recips, title, body,
                jsonb_build_object('kind', 'tee_booked', 'weekId', g.week_id));
            end if;
          end if;
        end loop;

      ----------------------------------------------------------------------
      else
        -- Week-scoped rules over upcoming golf days.
        for w in
          select * from weeks
          where start_date >= current_date
            and (event_type is null or event_type = 'golf')
        loop
          fire_time := null;
          if r.kind = 'groups_drawn' then
            if w.status in ('draw_complete', 'booked') then fire_time := now(); end if;
          elsif r.kind = 'runt_select' then
            fire_time := (w.start_date::timestamp + time '18:00') at time zone 'Australia/Sydney';
          elsif r.anchor = 'deadline' and w.booking_deadline is not null then
            fire_time := w.booking_deadline + make_interval(mins => coalesce(r.offset_minutes, 0));
          elsif r.anchor = 'game' then
            fire_time := ((w.start_date::timestamp) at time zone 'Australia/Sydney')
                         + make_interval(mins => coalesce(r.offset_minutes, 0));
          end if;

          -- Fire only within 6h of the scheduled moment (no stale backfill).
          -- groups_drawn uses now(), so it fires as soon as the draw is done.
          if fire_time is not null and now() >= fire_time
             and (r.kind = 'groups_drawn' or now() < fire_time + interval '6 hours') then
            k := r.id::text || ':' || w.id::text;
            if not exists (select 1 from notifications_sent where dedup_key = k) then
              if r.audience = 'all' then
                select array_agg(id) into recips from players where status = 'active';
              elsif r.audience = 'in' then
                select array_agg(player_id) into recips
                from availability where week_id = w.id and is_available;
              elsif r.audience = 'runt' then
                select array_agg(runt_player_id) into recips
                from runt_tenures where current_date >= starts_on and current_date < ends_on;
              elsif r.audience = 'group' then
                select array_agg(gm.player_id) into recips
                from group_members gm join groups gr on gr.id = gm.group_id
                where gr.week_id = w.id and not gm.is_blocker;
              end if;

              if recips is not null and array_length(recips, 1) > 0 then
                insert into notifications_sent(dedup_key) values (k) on conflict do nothing;
                d_date := to_char(w.start_date, 'Dy DD Mon');
                d_dl := coalesce(
                  to_char(w.booking_deadline at time zone 'Australia/Sydney', 'HH12:MIam "on" Dy DD Mon'),
                  '');
                title := replace(replace(replace(r.title, '{date}', d_date),
                          '{deadline}', d_dl), '{organiser}', org);
                body := replace(replace(replace(r.body, '{date}', d_date),
                          '{deadline}', d_dl), '{organiser}', org);
                perform _push_send(recips, title, body,
                  jsonb_build_object('kind', r.kind, 'weekId', w.id));
              end if;
            end if;
          end if;
        end loop;
      end if;
    exception when others then
      raise warning 'run_notifications rule % failed: %', r.id, sqlerrm;
    end;
  end loop;
end;
$$;

select cron.unschedule(jobid) from cron.job where jobname = 'runt-notifications';
select cron.schedule('runt-notifications', '*/5 * * * *', $$select public.run_notifications();$$);
