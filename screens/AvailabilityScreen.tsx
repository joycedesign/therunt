// Weekly availability for The Runt (shown under the "Availability" tab).
//
// Lists upcoming Saturdays, lets the signed-in player toggle whether they're
// In (availability table), shows the who's-in roster, and lets a member add
// guests (guests table) — each guest takes a slot in the host's group.

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { runDraw, resetDraw } from '../lib/draw';
import { bookGroup, unbookGroup } from '../lib/booking';
import { logChange } from '../lib/changelog';
import TeeTimeModal from '../components/TeeTimeModal';
import GroupEditor from './GroupEditor';
import RuntCard from './RuntCard';
import { useSettings } from '../lib/useSettings';
import type { Player } from '../lib/useAuth';

type Week = {
  id: string;
  start_date: string;
  booking_deadline: string | null;
  status: string;
  title: string | null;
  event_type: 'golf' | 'other' | null;
  allow_plus_one: boolean;
  allow_guests: boolean;
  event_time: string | null;
  emoji: string | null;
};
type AvailMap = Record<string, boolean>;
type RosterMap = Record<string, string[]>;
type Guest = {
  id: string;
  name: string;
  hostName: string;
  host_player_id: string;
  isPlusOne: boolean;
};
type GuestsMap = Record<string, Guest[]>;
// label = short name (booked view); fullName + memberNo shown in the draw
// view so the Runt has the exact details needed to book (membership number,
// or GA number for guests).
type GroupEntry = {
  label: string;
  fullName: string;
  memberNo: string | null;
  kind: 'member' | 'blocker' | 'guest';
};
type DrawGroup = {
  id: string;
  name: string;
  entries: GroupEntry[];
  bookingStatus: string;
  teeTime: string | null;
  startingTee: number | null;
};
type GroupsMap = Record<string, DrawGroup[]>;
type InPlayer = { id: string; name: string };
type InByWeek = Record<string, InPlayer[]>;
type Match = { id: string; a: string; b: string; playerA: string; playerB: string };
type MatchesMap = Record<string, Match[]>;
// A cart is a per-player flag: this player wants a cart this week.
type Cart = { id: string; playerId: string; name: string };
type CartsMap = Record<string, Cart[]>;
// A reserve: someone who became available after the draw. Ordered by created_at.
type Reserve = { id: string; playerId: string; name: string };
type ReservesMap = Record<string, Reserve[]>;
type LogEntry = { id: string; created_at: string; action: string; author_name: string };

type NamePart = { preferred_name: string | null; name: string; membership_number?: string | null };
type RosterRow = { week_id: string; player_id: string; players: NamePart | NamePart[] | null };
type GuestRow = {
  id: string;
  week_id: string;
  name: string;
  ga_number: string | null;
  host_player_id: string;
  group_id: string | null;
  is_plus_one: boolean;
  players: NamePart | NamePart[] | null;
};
type GmRow = {
  group_id: string;
  player_id: string;
  is_blocker: boolean;
  players: NamePart | NamePart[] | null;
};

export default function AvailabilityScreen({
  player,
  header,
}: {
  player: Player | null;
  header?: ReactNode;
}) {
  const { organiserName } = useSettings();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [weeks, setWeeks] = useState<Week[]>([]);
  const [avail, setAvail] = useState<AvailMap>({});
  const [roster, setRoster] = useState<RosterMap>({});
  const [guests, setGuests] = useState<GuestsMap>({});
  const [drawGroups, setDrawGroups] = useState<GroupsMap>({});
  const [drawBusy, setDrawBusy] = useState<string | null>(null);
  const [inByWeek, setInByWeek] = useState<InByWeek>({});
  const [matches, setMatches] = useState<MatchesMap>({});
  const [carts, setCarts] = useState<CartsMap>({});
  const [reserves, setReserves] = useState<ReservesMap>({});
  // Player ids already placed in a group, per week (so a re-join goes to reserves).
  const [grouped, setGrouped] = useState<Record<string, Set<string>>>({});
  // Player ids currently holding a slot as a blocker (dropped out), per week.
  const [blockers, setBlockers] = useState<Record<string, Set<string>>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  // Add-match modal state.
  const [matchFor, setMatchFor] = useState<string | null>(null);
  const [matchBusy, setMatchBusy] = useState(false);

  // Cart is a per-player toggle (no modal); this guards double-taps.
  const [cartBusy, setCartBusy] = useState(false);

  const [editorWeekId, setEditorWeekId] = useState<string | null>(null);

  // Change-log modal state.
  const [logForWeek, setLogForWeek] = useState<string | null>(null);
  const [logEntries, setLogEntries] = useState<LogEntry[]>([]);
  const [logLoading, setLogLoading] = useState(false);

  // Tee-time picker state.
  const [pickerGroup, setPickerGroup] = useState<{
    groupId: string;
    weekId: string;
    startDate: string;
    teeTime: string | null;
    startingTee: number | null;
  } | null>(null);

  // Add-guest / +1 modal state.
  const [addingFor, setAddingFor] = useState<string | null>(null);
  const [guestName, setGuestName] = useState('');
  const [guestGa, setGuestGa] = useState('');
  const [guestBusy, setGuestBusy] = useState(false);
  const [addNoGa, setAddNoGa] = useState(false); // hide GA field (non-golf events)

  const load = useCallback(async () => {
    if (!supabase || !player) return;
    setError(null);
    const today = new Date().toISOString().slice(0, 10);
    const { data: wk, error: wErr } = await supabase
      .from('weeks')
      .select(
        'id, start_date, booking_deadline, status, title, event_type, allow_plus_one, allow_guests, event_time, emoji'
      )
      .gte('start_date', today)
      .order('start_date')
      .limit(8);
    if (wErr) {
      setError(wErr.message);
      return;
    }
    setWeeks((wk ?? []) as Week[]);
    const weekIds = ((wk ?? []) as Week[]).map((w) => w.id);

    const { data: av, error: aErr } = await supabase
      .from('availability')
      .select('week_id, is_available')
      .eq('player_id', player.id);
    if (aErr) {
      setError(aErr.message);
      return;
    }
    const map: AvailMap = {};
    (av ?? []).forEach((r: { week_id: string; is_available: boolean }) => {
      map[r.week_id] = r.is_available;
    });
    setAvail(map);

    // Roster: everyone who is In for each visible week (with ids for matches).
    const { data: rost, error: rErr } = await supabase
      .from('availability')
      .select('week_id, player_id, players(preferred_name, name)')
      .in('week_id', weekIds)
      .eq('is_available', true);
    if (rErr) {
      setError(rErr.message);
      return;
    }
    const rmap: RosterMap = {};
    const imap: InByWeek = {};
    ((rost ?? []) as unknown as RosterRow[]).forEach((r) => {
      const p = Array.isArray(r.players) ? r.players[0] : r.players;
      const nm = p?.preferred_name || p?.name;
      if (!nm) return;
      (rmap[r.week_id] ??= []).push(nm);
      (imap[r.week_id] ??= []).push({ id: r.player_id, name: nm });
    });
    Object.values(rmap).forEach((list) => list.sort((a, b) => a.localeCompare(b)));
    Object.values(imap).forEach((list) => list.sort((a, b) => a.name.localeCompare(b.name)));
    setRoster(rmap);
    setInByWeek(imap);

    // Name lookup (for matches display).
    const { data: pl } = await supabase.from('players').select('id, preferred_name, name');
    const nameById: Record<string, string> = {};
    ((pl ?? []) as { id: string; preferred_name: string | null; name: string }[]).forEach((p) => {
      nameById[p.id] = p.preferred_name || p.name;
    });

    // Matches per week.
    const { data: mt, error: mErr } = await supabase
      .from('matches')
      .select('id, week_id, player_a, player_b')
      .in('week_id', weekIds);
    if (mErr) {
      setError(mErr.message);
      return;
    }
    const mmap: MatchesMap = {};
    ((mt ?? []) as { id: string; week_id: string; player_a: string; player_b: string }[]).forEach(
      (m) => {
        (mmap[m.week_id] ??= []).push({
          id: m.id,
          a: nameById[m.player_a] ?? 'player',
          b: nameById[m.player_b] ?? 'player',
          playerA: m.player_a,
          playerB: m.player_b,
        });
      }
    );
    setMatches(mmap);

    // Carts per week (one row per player who wants a cart).
    const { data: ct, error: cErr } = await supabase
      .from('carts')
      .select('id, week_id, player_id')
      .in('week_id', weekIds);
    if (cErr) {
      setError(cErr.message);
      return;
    }
    const cmap: CartsMap = {};
    ((ct ?? []) as { id: string; week_id: string; player_id: string }[]).forEach((c) => {
      (cmap[c.week_id] ??= []).push({
        id: c.id,
        playerId: c.player_id,
        name: nameById[c.player_id] ?? 'player',
      });
    });
    setCarts(cmap);

    // Reserves per week, ordered by when they were added (the queue order).
    const { data: rv, error: resErr } = await supabase
      .from('reserves')
      .select('id, week_id, player_id')
      .in('week_id', weekIds)
      .order('created_at');
    if (resErr) {
      setError(resErr.message);
      return;
    }
    const resMap: ReservesMap = {};
    ((rv ?? []) as { id: string; week_id: string; player_id: string }[]).forEach((r) => {
      (resMap[r.week_id] ??= []).push({
        id: r.id,
        playerId: r.player_id,
        name: nameById[r.player_id] ?? 'player',
      });
    });
    setReserves(resMap);

    // Guests for each visible week (with host name + assigned group).
    const { data: gst, error: gErr } = await supabase
      .from('guests')
      .select(
        'id, week_id, name, ga_number, host_player_id, group_id, is_plus_one, players(preferred_name, name)'
      )
      .in('week_id', weekIds);
    if (gErr) {
      setError(gErr.message);
      return;
    }
    const gmap: GuestsMap = {};
    const guestByGroup: Record<string, GroupEntry[]> = {};
    ((gst ?? []) as unknown as GuestRow[]).forEach((g) => {
      const h = Array.isArray(g.players) ? g.players[0] : g.players;
      (gmap[g.week_id] ??= []).push({
        id: g.id,
        name: g.name,
        hostName: h?.preferred_name || h?.name || 'member',
        host_player_id: g.host_player_id,
        isPlusOne: g.is_plus_one ?? false,
      });
      if (g.group_id) {
        (guestByGroup[g.group_id] ??= []).push({
          label: g.name,
          fullName: g.name,
          memberNo: g.ga_number,
          kind: 'guest',
        });
      }
    });
    Object.values(gmap).forEach((list) => list.sort((a, b) => a.name.localeCompare(b.name)));
    setGuests(gmap);

    // Draw result (groups) for each visible week.
    const { data: grp, error: grErr } = await supabase
      .from('groups')
      .select('id, week_id, group_name, booking_status, tee_time, starting_tee')
      .in('week_id', weekIds)
      .order('group_name');
    if (grErr) {
      setError(grErr.message);
      return;
    }
    const groupIds = (grp ?? []).map((g: { id: string }) => g.id);
    const weekOfGroup: Record<string, string> = {};
    (grp ?? []).forEach((g: { id: string; week_id: string }) => (weekOfGroup[g.id] = g.week_id));
    const byGroup: Record<string, GroupEntry[]> = {};
    const groupedIds: Record<string, Set<string>> = {};
    const blockerIds: Record<string, Set<string>> = {};
    if (groupIds.length) {
      const { data: gm, error: gmErr } = await supabase
        .from('group_members')
        .select('group_id, player_id, is_blocker, players(preferred_name, name, membership_number)')
        .in('group_id', groupIds);
      if (gmErr) {
        setError(gmErr.message);
        return;
      }
      (gm as unknown as GmRow[]).forEach((r) => {
        const p = Array.isArray(r.players) ? r.players[0] : r.players;
        (byGroup[r.group_id] ??= []).push({
          label: p?.preferred_name || p?.name || 'player',
          fullName: p?.name || p?.preferred_name || 'player',
          memberNo: p?.membership_number ?? null,
          kind: r.is_blocker ? 'blocker' : 'member',
        });
        // Blockers are placeholders, not real players — if a blocker's member
        // becomes available they should reclaim their slot, not land on reserves.
        const wk = weekOfGroup[r.group_id];
        if (wk) {
          if (r.is_blocker) (blockerIds[wk] ??= new Set()).add(r.player_id);
          else (groupedIds[wk] ??= new Set()).add(r.player_id);
        }
      });
    }
    setGrouped(groupedIds);
    setBlockers(blockerIds);
    const grmap: GroupsMap = {};
    (grp ?? []).forEach(
      (g: {
        id: string;
        week_id: string;
        group_name: string;
        booking_status: string;
        tee_time: string | null;
        starting_tee: number | null;
      }) => {
        const entries = [...(byGroup[g.id] ?? []), ...(guestByGroup[g.id] ?? [])];
        (grmap[g.week_id] ??= []).push({
          id: g.id,
          name: g.group_name,
          entries,
          bookingStatus: g.booking_status,
          teeTime: g.tee_time,
          startingTee: g.starting_tee,
        });
      }
    );
    setDrawGroups(grmap);
  }, [player]);

  useEffect(() => {
    setLoading(true);
    void load().finally(() => setLoading(false));
  }, [load]);

  // Live sync: reload when anyone's availability OR any guest changes.
  useEffect(() => {
    const client = supabase;
    if (!client || !player) return;
    const channel = client
      .channel('availability-roster')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'availability' },
        () => void load()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'guests' },
        () => void load()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'groups' },
        () => void load()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'group_members' },
        () => void load()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'matches' },
        () => void load()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'carts' },
        () => void load()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'reserves' },
        () => void load()
      )
      .subscribe();
    return () => {
      void client.removeChannel(channel);
    };
  }, [player, load]);

  function toggleExpand(weekId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(weekId)) next.delete(weekId);
      else next.add(weekId);
      return next;
    });
  }

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function toggle(weekId: string, value: boolean) {
    if (!supabase || !player) return;
    const previous = avail[weekId];
    setAvail((prev) => ({ ...prev, [weekId]: value })); // optimistic
    const { error } = await supabase
      .from('availability')
      .upsert(
        { week_id: weekId, player_id: player.id, is_available: value, is_explicit: true },
        { onConflict: 'week_id,player_id' }
      );
    if (error) {
      setError(error.message);
      setAvail((prev) => ({ ...prev, [weekId]: previous ?? false })); // revert
      return;
    }

    // Availability changes after the draw need extra handling to keep the
    // groups and reserve list consistent.
    const drawn = (drawGroups[weekId]?.length ?? 0) > 0;
    if (!drawn) return;

    const isMember = grouped[weekId]?.has(player.id) ?? false;
    const isBlocker = blockers[weekId]?.has(player.id) ?? false;
    const who = player.preferred_name || player.name || 'A player';

    if (!value) {
      // Going unavailable. If you're a playing member, hold your slot by
      // becoming a blocker; either way, drop off any reserve list.
      if (isMember) {
        await supabase.rpc('set_own_group_blocker', { p_week_id: weekId, p_blocker: true });
        await logChange(weekId, `${who} dropped out — slot held by a blocker`, player);
      }
      await supabase.from('reserves').delete().eq('week_id', weekId).eq('player_id', player.id);
    } else if (isBlocker) {
      // Rejoining and you still hold your slot as a blocker → reclaim it.
      await supabase.rpc('set_own_group_blocker', { p_week_id: weekId, p_blocker: false });
      await logChange(weekId, `${who} rejoined and reclaimed their group slot`, player);
    } else if (!isMember) {
      // Newly available after the draw with no slot → join the reserve list.
      await supabase
        .from('reserves')
        .upsert(
          { week_id: weekId, player_id: player.id },
          { onConflict: 'week_id,player_id', ignoreDuplicates: true }
        );
      await logChange(weekId, `${who} joined the reserve list`, player);
    }
    void load();
  }

  async function addGuest() {
    if (!supabase || !player || !addingFor) return;
    const nm = guestName.trim();
    if (!nm) {
      setError('Enter a guest name.');
      return;
    }
    setGuestBusy(true);
    setError(null);
    const { error } = await supabase.from('guests').insert({
      week_id: addingFor,
      host_player_id: player.id,
      name: nm,
      ga_number: addNoGa ? null : guestGa.trim() || null,
      source: 'manual',
    });
    setGuestBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setAddingFor(null);
    setGuestName('');
    setGuestGa('');
    void load();
  }

  async function removeGuest(id: string) {
    if (!supabase) return;
    const { error } = await supabase.from('guests').delete().eq('id', id);
    if (error) setError(error.message);
    else void load();
  }

  async function addMatch(weekId: string, opponentId: string) {
    if (!supabase || !player) return;
    setMatchBusy(true);
    setError(null);
    const { error } = await supabase.from('matches').insert({
      week_id: weekId,
      player_a: player.id,
      player_b: opponentId,
    });
    setMatchBusy(false);
    if (error) {
      setError(error.message.includes('matches_unique_pair') ? 'That match already exists.' : error.message);
      return;
    }
    setMatchFor(null);
    void load();
  }

  async function removeMatch(id: string) {
    if (!supabase) return;
    const { error } = await supabase.from('matches').delete().eq('id', id);
    if (error) setError(error.message);
    else void load();
  }

  async function addCart(weekId: string) {
    if (!supabase || !player) return;
    setCartBusy(true);
    setError(null);
    const { error } = await supabase.from('carts').insert({
      week_id: weekId,
      player_id: player.id,
    });
    setCartBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    void load();
  }

  async function removeCart(id: string) {
    if (!supabase) return;
    const { error } = await supabase.from('carts').delete().eq('id', id);
    if (error) setError(error.message);
    else void load();
  }

  async function removeReserve(id: string) {
    if (!supabase) return;
    const { error } = await supabase.from('reserves').delete().eq('id', id);
    if (error) setError(error.message);
    else void load();
  }

  function groupName(weekId: string, groupId: string): string {
    return (drawGroups[weekId] ?? []).find((g) => g.id === groupId)?.name ?? 'a group';
  }

  async function confirmTee(d: Date, tee: number) {
    if (!pickerGroup) return;
    const pg = pickerGroup;
    setError(null);
    try {
      await bookGroup(pg.groupId, pg.weekId, d.toISOString(), tee);
      await logChange(
        pg.weekId,
        `Booked ${groupName(pg.weekId, pg.groupId)} — ${formatTeeTime(d.toISOString())}, ${
          tee === 11 ? '11th' : '1st'
        } tee`,
        player
      );
      setPickerGroup(null);
      await load();
    } catch (e) {
      setError(errMsg(e));
      setPickerGroup(null);
    }
  }

  async function unbook(groupId: string, weekId: string) {
    setError(null);
    try {
      await unbookGroup(groupId, weekId);
      await logChange(weekId, `Unbooked ${groupName(weekId, groupId)}`, player);
      await load();
    } catch (e) {
      setError(errMsg(e));
    }
  }

  async function randomize(weekId: string) {
    setDrawBusy(weekId);
    setError(null);
    try {
      const first = (drawGroups[weekId]?.length ?? 0) === 0;
      await runDraw(weekId);
      await logChange(weekId, first ? 'Randomised the groups' : 'Re-randomised the groups', player);
      await load();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setDrawBusy(null);
    }
  }

  async function openLog(weekId: string) {
    if (!supabase) return;
    setLogForWeek(weekId);
    setLogEntries([]);
    setLogLoading(true);
    const { data } = await supabase
      .from('change_log')
      .select('id, created_at, action, author_name')
      .eq('week_id', weekId)
      .order('created_at', { ascending: false });
    setLogEntries((data ?? []) as LogEntry[]);
    setLogLoading(false);
  }

  async function reset(weekId: string) {
    setDrawBusy(weekId);
    setError(null);
    try {
      await resetDraw(weekId);
      await logChange(weekId, 'Reset the draw', player);
      await load();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setDrawBusy(null);
    }
  }

  if (loading) {
    return (
      <View style={styles.scroll}>
        {header}
        <ActivityIndicator color="#7fffb0" size="large" style={{ marginTop: 40 }} />
      </View>
    );
  }

  // People you can start a match with (In this week, not you, not already matched).
  const opponents =
    matchFor && player
      ? (inByWeek[matchFor] ?? []).filter(
          (p) =>
            p.id !== player.id &&
            !(matches[matchFor] ?? []).some(
              (m) =>
                (m.playerA === player.id && m.playerB === p.id) ||
                (m.playerB === player.id && m.playerA === p.id)
            )
        )
      : [];

  const isAdmin = player?.is_admin ?? false;

  return (
    <>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#7fffb0" />
        }
      >
        {header}
        <RuntCard player={player} organiserName={organiserName} />
        <Text style={styles.heading}>Which Saturdays are you in?</Text>

        {error && !addingFor && <Text style={styles.error}>⚠️ {error}</Text>}

        {weeks.length === 0 ? (
          <Text style={styles.empty}>
            No upcoming Saturdays yet. (Ask the organiser to add some.)
          </Text>
        ) : (
          weeks.map((w) => {
            const inList = roster[w.id] ?? [];
            const guestArr = guests[w.id] ?? [];
            const total = inList.length + guestArr.length;
            const drawn = drawGroups[w.id] ?? [];
            const matchArr = matches[w.id] ?? [];
            const cartArr = carts[w.id] ?? [];
            const reserveArr = reserves[w.id] ?? [];
            const isIn = avail[w.id] ?? false;
            const busy = drawBusy === w.id;
            const isOpen = expanded.has(w.id);
            const isNonGolf = w.event_type === 'other';
            return (
              <View key={w.id} style={[styles.card, isNonGolf && styles.eventCard]}>
                <View style={styles.row}>
                  <TouchableOpacity
                    style={styles.rowText}
                    onPress={() => toggleExpand(w.id)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.date}>
                      {isNonGolf && w.emoji ? `${w.emoji} ` : ''}
                      {w.title || formatSaturday(w.start_date)}
                    </Text>
                    <Text style={styles.count}>
                      {w.event_type
                        ? `${formatSaturday(w.start_date)}${
                            w.event_time ? `, ${formatClock(w.event_time)}` : ''
                          } · `
                        : ''}
                      {total} in {isOpen ? '▲' : '▼'}
                      {w.status === 'booked' && (
                        <Text style={styles.bookedBadge}>  ✅ booked</Text>
                      )}
                    </Text>
                  </TouchableOpacity>
                  <Switch
                    value={avail[w.id] ?? false}
                    onValueChange={(v) => toggle(w.id, v)}
                    trackColor={{ false: '#ef4444', true: '#22c55e' }}
                    thumbColor="#ffffff"
                    ios_backgroundColor="#ef4444"
                    // activeThumbColor is a web-only prop (keeps the knob white when on)
                    {...({ activeThumbColor: '#ffffff' } as object)}
                  />
                </View>
                {isOpen && (
                  <View style={styles.rosterBox}>
                    {w.booking_deadline && drawn.length === 0 && (
                      <Text style={styles.deadline}>
                        Confirm by {formatDeadline(w.booking_deadline)}
                      </Text>
                    )}

                    {isNonGolf ? (
                      <>
                        {total === 0 ? (
                          <Text style={styles.rosterEmpty}>No one in yet.</Text>
                        ) : (
                          <>
                            {inList.map((nm, i) => (
                              <Text key={`nm-${i}`} style={styles.rosterName}>
                                {i + 1}. {nm}
                              </Text>
                            ))}
                            {guestArr.map((g, j) => (
                              <View key={g.id} style={styles.guestRow}>
                                <Text style={styles.rosterName}>
                                  {inList.length + j + 1}. {g.name}{' '}
                                  <Text style={styles.guestTag}>(guest of {g.hostName})</Text>
                                </Text>
                                {g.host_player_id === player?.id && (
                                  <TouchableOpacity onPress={() => removeGuest(g.id)} hitSlop={8}>
                                    <Text style={styles.remove}>✕</Text>
                                  </TouchableOpacity>
                                )}
                              </View>
                            ))}
                          </>
                        )}
                        {isIn && w.allow_guests && (
                          <View style={styles.actionLinks}>
                            <TouchableOpacity
                              onPress={() => {
                                setAddingFor(w.id);
                                setGuestName('');
                                setGuestGa('');
                                setAddNoGa(true);
                                setError(null);
                              }}
                            >
                              <Text style={styles.addGuestText}>+ Add guest</Text>
                            </TouchableOpacity>
                          </View>
                        )}
                      </>
                    ) : drawn.length > 0 ? (
                      <>
                        <View style={w.status === 'booked' ? styles.groupGrid : undefined}>
                          {drawn.map((grp) => {
                          const booked = grp.bookingStatus === 'confirmed' && grp.teeTime;
                          return (
                            <View
                              key={grp.id}
                              style={[
                                styles.groupBox,
                                w.status === 'booked' && styles.groupBoxHalf,
                              ]}
                            >
                              <Text style={styles.groupName}>{grp.name}</Text>
                              {booked && (
                                <Text style={styles.bookedText}>
                                  {formatTeeTime(grp.teeTime as string)} —{' '}
                                  {grp.startingTee === 11 ? '11th' : '1st'} tee
                                </Text>
                              )}
                              {grp.entries.map((e, i) => (
                                <Text key={i} style={styles.rosterName}>
                                  {i + 1}. {booked ? e.label : e.fullName}
                                  {!booked && e.memberNo != null && (
                                    <Text style={styles.memberNo}> · {e.memberNo}</Text>
                                  )}
                                  {e.kind === 'guest' && (
                                    <Text style={styles.guestTag}> (guest)</Text>
                                  )}
                                  {e.kind === 'blocker' && (
                                    <Text style={styles.blockerTag}> (blocker)</Text>
                                  )}
                                </Text>
                              ))}
                              {booked ? (
                                isAdmin && (
                                  <View style={styles.bookedActions}>
                                    <TouchableOpacity
                                      onPress={() =>
                                        setPickerGroup({
                                          groupId: grp.id,
                                          weekId: w.id,
                                          startDate: w.start_date,
                                          teeTime: grp.teeTime,
                                          startingTee: grp.startingTee,
                                        })
                                      }
                                    >
                                      <Text style={styles.addGuestText}>Edit</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity onPress={() => unbook(grp.id, w.id)}>
                                      <Text style={styles.resetLink}>Unbook</Text>
                                    </TouchableOpacity>
                                  </View>
                                )
                              ) : (
                                isAdmin && (
                                  <TouchableOpacity
                                    style={styles.bookBtn}
                                    onPress={() =>
                                      setPickerGroup({
                                        groupId: grp.id,
                                        weekId: w.id,
                                        startDate: w.start_date,
                                        teeTime: grp.teeTime,
                                        startingTee: grp.startingTee,
                                      })
                                    }
                                  >
                                    <Text style={styles.bookBtnText}>Set tee time &amp; book</Text>
                                  </TouchableOpacity>
                                )
                              )}
                            </View>
                          );
                          })}
                        </View>
                        <Text style={styles.bookSummary}>
                          Booked {drawn.filter((g) => g.bookingStatus === 'confirmed').length}/
                          {drawn.length} groups
                        </Text>
                        {matchArr.length > 0 && (
                          <View style={styles.matchList}>
                            {matchArr.map((m) => (
                              <Text key={m.id} style={styles.matchText}>
                                <MaterialCommunityIcons name="merge" size={14} color="#ffffff" />{' '}
                                {m.a} v {m.b}
                              </Text>
                            ))}
                          </View>
                        )}
                        {cartArr.length > 0 && (
                          <View style={styles.matchList}>
                            {cartArr.map((c) => (
                              <Text key={c.id} style={styles.matchText}>
                                <MaterialCommunityIcons
                                  name="golf-cart"
                                  size={14}
                                  color="#ffffff"
                                />{' '}
                                {c.name}
                              </Text>
                            ))}
                          </View>
                        )}
                        {reserveArr.length > 0 && (
                          <View style={styles.reserveBox}>
                            <Text style={styles.reserveTitle}>Reserves</Text>
                            {reserveArr.map((r, i) => (
                              <View key={r.id} style={styles.guestRow}>
                                <Text style={styles.rosterName}>
                                  {i + 1}. {r.name}
                                </Text>
                                {(isAdmin || r.playerId === player?.id) && (
                                  <TouchableOpacity onPress={() => removeReserve(r.id)} hitSlop={8}>
                                    <Text style={styles.remove}>✕</Text>
                                  </TouchableOpacity>
                                )}
                              </View>
                            ))}
                          </View>
                        )}
                        {isAdmin &&
                          (busy ? (
                            <ActivityIndicator color="#7fffb0" style={styles.drawSpinner} />
                          ) : (
                            <View style={styles.drawActions}>
                              <View style={styles.actionLinks}>
                                <TouchableOpacity onPress={() => randomize(w.id)}>
                                  <Text style={styles.addGuestText}>↻ Re-randomize</Text>
                                </TouchableOpacity>
                                <TouchableOpacity onPress={() => setEditorWeekId(w.id)}>
                                  <Text style={styles.addGuestText}>Edit groups</Text>
                                </TouchableOpacity>
                                <TouchableOpacity onPress={() => openLog(w.id)}>
                                  <Text style={styles.addGuestText}>Log</Text>
                                </TouchableOpacity>
                              </View>
                              <TouchableOpacity onPress={() => reset(w.id)}>
                                <Text style={styles.resetLink}>Reset</Text>
                              </TouchableOpacity>
                            </View>
                          ))}
                      </>
                    ) : (
                      <>
                        {total === 0 ? (
                          <Text style={styles.rosterEmpty}>No one in yet.</Text>
                        ) : (
                          <>
                            {inList.map((nm, i) => (
                              <Text key={`m-${i}`} style={styles.rosterName}>
                                {i + 1}. {nm}
                              </Text>
                            ))}
                            {guestArr.map((g, j) => (
                              <View key={g.id} style={styles.guestRow}>
                                <Text style={styles.rosterName}>
                                  {inList.length + j + 1}. {g.name}{' '}
                                  <Text style={styles.guestTag}>(guest of {g.hostName})</Text>
                                </Text>
                                {g.host_player_id === player?.id && (
                                  <TouchableOpacity onPress={() => removeGuest(g.id)} hitSlop={8}>
                                    <Text style={styles.remove}>✕</Text>
                                  </TouchableOpacity>
                                )}
                              </View>
                            ))}
                          </>
                        )}

                        {matchArr.length > 0 && (
                          <View style={styles.matchList}>
                            {matchArr.map((m) => (
                              <View key={m.id} style={styles.guestRow}>
                                <Text style={styles.matchText}>
                                  <MaterialCommunityIcons name="merge" size={14} color="#ffffff" />{' '}
                                  {m.a} v {m.b}
                                </Text>
                                {(m.playerA === player?.id || m.playerB === player?.id) && (
                                  <TouchableOpacity onPress={() => removeMatch(m.id)} hitSlop={8}>
                                    <Text style={styles.remove}>✕</Text>
                                  </TouchableOpacity>
                                )}
                              </View>
                            ))}
                          </View>
                        )}

                        {cartArr.length > 0 && (
                          <View style={styles.matchList}>
                            {cartArr.map((c) => (
                              <View key={c.id} style={styles.guestRow}>
                                <Text style={styles.matchText}>
                                  <MaterialCommunityIcons
                                    name="golf-cart"
                                    size={14}
                                    color="#ffffff"
                                  />{' '}
                                  {c.name} <Text style={styles.guestTag}>(cart)</Text>
                                </Text>
                                {c.playerId === player?.id && (
                                  <TouchableOpacity onPress={() => removeCart(c.id)} hitSlop={8}>
                                    <Text style={styles.remove}>✕</Text>
                                  </TouchableOpacity>
                                )}
                              </View>
                            ))}
                          </View>
                        )}

                        <View style={styles.drawActions}>
                          <View style={styles.actionLinks}>
                            {isIn && (
                              <>
                                {!cartArr.some((c) => c.playerId === player?.id) && (
                                  <TouchableOpacity
                                    onPress={() => {
                                      setError(null);
                                      void addCart(w.id);
                                    }}
                                    disabled={cartBusy}
                                  >
                                    <Text style={styles.addGuestText}>+ Cart</Text>
                                  </TouchableOpacity>
                                )}
                                <TouchableOpacity
                                  onPress={() => {
                                    setAddingFor(w.id);
                                    setGuestName('');
                                    setGuestGa('');
                                    setAddNoGa(false);
                                    setError(null);
                                  }}
                                >
                                  <Text style={styles.addGuestText}>+ Guest</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                  onPress={() => {
                                    setMatchFor(w.id);
                                    setError(null);
                                  }}
                                >
                                  <Text style={styles.addGuestText}>+ Match</Text>
                                </TouchableOpacity>
                              </>
                            )}
                          </View>
                          {isAdmin &&
                            (busy ? (
                              <ActivityIndicator color="#7fffb0" />
                            ) : (
                              total > 0 && (
                                <TouchableOpacity
                                  style={styles.randomizeBtn}
                                  onPress={() => randomize(w.id)}
                                >
                                  <Text style={styles.randomizeBtnText}>Randomize</Text>
                                </TouchableOpacity>
                              )
                            ))}
                        </View>
                      </>
                    )}
                  </View>
                )}
              </View>
            );
          })
        )}

        <Text style={styles.hint}>Pull down to refresh.</Text>
      </ScrollView>

      <Modal
        visible={addingFor !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setAddingFor(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Add a guest</Text>
            <TextInput
              style={styles.input}
              placeholder="Guest name"
              placeholderTextColor="#7fa392"
              value={guestName}
              onChangeText={setGuestName}
              editable={!guestBusy}
              autoFocus
            />
            {!addNoGa && (
              <TextInput
                style={styles.input}
                placeholder="Golf Australia number (optional)"
                placeholderTextColor="#7fa392"
                keyboardType="number-pad"
                value={guestGa}
                onChangeText={setGuestGa}
                editable={!guestBusy}
              />
            )}
            {error && addingFor && <Text style={styles.error}>⚠️ {error}</Text>}
            <View style={styles.modalButtons}>
              <TouchableOpacity onPress={() => setAddingFor(null)} disabled={guestBusy}>
                <Text style={styles.cancel}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.addBtn, guestBusy && styles.buttonDisabled]}
                onPress={addGuest}
                disabled={guestBusy}
              >
                {guestBusy ? (
                  <ActivityIndicator color="#0b3d2e" />
                ) : (
                  <Text style={styles.addBtnText}>Add guest</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={matchFor !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setMatchFor(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Add a match</Text>
            <Text style={styles.matchHelp}>
              Pick who you're playing — you'll be drawn into the same group.
            </Text>
            <ScrollView style={styles.opponentList}>
              {opponents.length === 0 ? (
                <Text style={styles.rosterEmpty}>No one else is In yet.</Text>
              ) : (
                opponents.map((p) => (
                  <TouchableOpacity
                    key={p.id}
                    style={styles.opponentRow}
                    onPress={() => matchFor && addMatch(matchFor, p.id)}
                    disabled={matchBusy}
                  >
                    <Text style={styles.opponentName}>{p.name}</Text>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
            {matchBusy && <ActivityIndicator color="#7fffb0" style={styles.drawSpinner} />}
            {error && matchFor && <Text style={styles.error}>⚠️ {error}</Text>}
            <TouchableOpacity onPress={() => setMatchFor(null)} disabled={matchBusy}>
              <Text style={styles.closeLink}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={logForWeek !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setLogForWeek(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Change log</Text>
            {logLoading ? (
              <ActivityIndicator color="#7fffb0" style={styles.drawSpinner} />
            ) : logEntries.length === 0 ? (
              <Text style={styles.rosterEmpty}>No changes recorded yet.</Text>
            ) : (
              <ScrollView style={styles.logList}>
                {logEntries.map((e) => (
                  <View key={e.id} style={styles.logRow}>
                    <Text style={styles.logAction}>{e.action}</Text>
                    <Text style={styles.logMeta}>
                      {formatLogTime(e.created_at)} · {e.author_name}
                    </Text>
                  </View>
                ))}
              </ScrollView>
            )}
            <TouchableOpacity onPress={() => setLogForWeek(null)}>
              <Text style={styles.closeLink}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <TeeTimeModal
        visible={pickerGroup !== null}
        initial={
          pickerGroup
            ? initialTee(pickerGroup.startDate, pickerGroup.teeTime)
            : new Date()
        }
        initialTee={pickerGroup?.startingTee ?? 1}
        onConfirm={confirmTee}
        onClose={() => setPickerGroup(null)}
      />

      {editorWeekId && (
        <GroupEditor
          weekId={editorWeekId}
          player={player}
          onClose={() => {
            setEditorWeekId(null);
            void load();
          }}
        />
      )}
    </>
  );
}

function initialTee(startDate: string, teeTime: string | null): Date {
  if (teeTime) return new Date(teeTime);
  return new Date(`${startDate}T07:00:00`);
}

function formatTeeTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' });
}

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object') {
    const o = e as { message?: unknown; details?: unknown; hint?: unknown };
    return String(o.message ?? o.details ?? o.hint ?? JSON.stringify(e));
  }
  return String(e);
}

function formatSaturday(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00`);
  return d.toLocaleDateString('en-AU', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  });
}

function formatDeadline(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  return `${formatTime(d)} ${date}`;
}

function formatTime(d: Date): string {
  let h = d.getHours();
  const ampm = h >= 12 ? 'pm' : 'am';
  h = h % 12 || 12;
  const m = d.getMinutes();
  return m === 0 ? `${h}${ampm}` : `${h}:${String(m).padStart(2, '0')}${ampm}`;
}

function formatClock(t: string): string {
  const [h, m] = t.split(':').map(Number);
  if (Number.isNaN(h)) return t;
  const ampm = h >= 12 ? 'pm' : 'am';
  const hr = h % 12 || 12;
  return m === 0 ? `${hr}${ampm}` : `${hr}:${String(m).padStart(2, '0')}${ampm}`;
}

function formatLogTime(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
  return `${date}, ${formatTime(d)}`;
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingBottom: 24 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  heading: { color: '#ffffff', fontSize: 18, fontWeight: '700', marginBottom: 16 },
  card: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  // Non-golf events keep the normal card background but get a green border.
  eventCard: {
    borderWidth: 1,
    borderColor: '#7fffb0',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowText: { flex: 1, paddingRight: 12 },
  date: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
  deadline: { color: '#9fc6b3', fontSize: 12, marginBottom: 8 },
  count: { color: '#7fffb0', fontSize: 12, marginTop: 4, fontWeight: '600' },
  rosterBox: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.12)',
  },
  rosterName: { color: '#dff3e8', fontSize: 14, paddingVertical: 2 },
  guestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  guestTag: { color: '#9fc6b3', fontSize: 12, fontStyle: 'italic' },
  memberNo: { color: '#7fffb0', fontSize: 13, fontWeight: '600' },
  remove: { color: '#ff9b9b', fontSize: 16, paddingHorizontal: 6 },
  rosterEmpty: { color: '#9fb0a8', fontSize: 13, fontStyle: 'italic' },
  addGuestBtn: { marginTop: 12, alignSelf: 'flex-start' },
  addGuestText: { color: '#7fffb0', fontSize: 14, fontWeight: '600' },
  drawActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
  },
  drawSpinner: { marginTop: 14 },
  randomizeBtn: {
    backgroundColor: '#7fffb0',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 18,
  },
  randomizeBtnText: { color: '#0b3d2e', fontSize: 14, fontWeight: '700' },
  resetLink: { color: '#ff9b9b', fontSize: 14, fontWeight: '600' },
  groupBox: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  // Once the week is booked the cards are compact, so show them two-up.
  groupGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  groupBoxHalf: { width: '48.5%' },
  groupName: { color: '#7fffb0', fontSize: 15, fontWeight: '700', marginBottom: 2 },
  blockerTag: { color: '#9fb0a8', fontSize: 12, fontStyle: 'italic' },
  bookedText: { color: '#ffffff', fontSize: 13, fontWeight: '600', marginBottom: 6 },
  bookedActions: { flexDirection: 'row', alignItems: 'center', gap: 18, marginTop: 10 },
  bookBtn: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#7fffb0',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  bookBtnText: { color: '#7fffb0', fontSize: 14, fontWeight: '600' },
  bookSummary: { color: '#9fc6b3', fontSize: 12, marginTop: 4 },
  reserveBox: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.12)',
  },
  reserveTitle: { color: '#7fffb0', fontSize: 13, fontWeight: '700', marginBottom: 4 },
  logList: { maxHeight: 320, marginBottom: 8 },
  logRow: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  logAction: { color: '#ffffff', fontSize: 14 },
  logMeta: { color: '#9fc6b3', fontSize: 12, marginTop: 2 },
  bookedBadge: { color: '#7fffb0', fontSize: 12, fontWeight: '700' },
  actionLinks: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  matchList: { marginTop: 10 },
  matchText: { color: '#ffd9a8', fontSize: 14, paddingVertical: 2 },
  matchHelp: { color: '#9fc6b3', fontSize: 13, marginBottom: 12, lineHeight: 18 },
  opponentList: { maxHeight: 280, marginBottom: 8 },
  opponentRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  opponentName: { color: '#ffffff', fontSize: 16 },
  closeLink: { color: '#bfe3d0', fontSize: 15, textAlign: 'center', marginTop: 12 },
  empty: { color: '#bfe3d0', fontSize: 15, marginTop: 8 },
  error: { color: '#ffd2d2', fontSize: 14, marginBottom: 12 },
  hint: { color: '#6f9684', fontSize: 12, textAlign: 'center', marginTop: 8 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: '#0f4a39',
    borderRadius: 14,
    padding: 20,
    width: '100%',
    maxWidth: 360,
  },
  modalTitle: { color: '#ffffff', fontSize: 18, fontWeight: '700', marginBottom: 16 },
  input: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 16,
    color: '#0b3d2e',
    marginBottom: 12,
  },
  modalButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 18,
    marginTop: 4,
  },
  cancel: { color: '#bfe3d0', fontSize: 15 },
  addBtn: {
    backgroundColor: '#7fffb0',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 18,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  addBtnText: { color: '#0b3d2e', fontSize: 15, fontWeight: '700' },
});
