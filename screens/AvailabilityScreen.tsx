// Weekly availability for The Runt (shown under the "Availability" tab).
//
// Lists upcoming Saturdays, lets the signed-in player toggle whether they're
// In (availability table), shows the who's-in roster, and lets a member add
// guests (guests table) — each guest takes a slot in the host's group.

import { useCallback, useEffect, useState } from 'react';
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
import { supabase } from '../lib/supabase';
import type { Player } from '../lib/useAuth';

type Week = { id: string; start_date: string; booking_deadline: string | null };
type AvailMap = Record<string, boolean>;
type RosterMap = Record<string, string[]>;
type Guest = { id: string; name: string; hostName: string; host_player_id: string };
type GuestsMap = Record<string, Guest[]>;

type NamePart = { preferred_name: string | null; name: string };
type RosterRow = { week_id: string; players: NamePart | NamePart[] | null };
type GuestRow = {
  id: string;
  week_id: string;
  name: string;
  host_player_id: string;
  players: NamePart | NamePart[] | null;
};

export default function AvailabilityScreen({ player }: { player: Player | null }) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [weeks, setWeeks] = useState<Week[]>([]);
  const [avail, setAvail] = useState<AvailMap>({});
  const [roster, setRoster] = useState<RosterMap>({});
  const [guests, setGuests] = useState<GuestsMap>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  // Add-guest modal state.
  const [addingFor, setAddingFor] = useState<string | null>(null);
  const [guestName, setGuestName] = useState('');
  const [guestGa, setGuestGa] = useState('');
  const [guestBusy, setGuestBusy] = useState(false);

  const load = useCallback(async () => {
    if (!supabase || !player) return;
    setError(null);
    const today = new Date().toISOString().slice(0, 10);
    const { data: wk, error: wErr } = await supabase
      .from('weeks')
      .select('id, start_date, booking_deadline')
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

    // Roster: everyone who is In for each visible week.
    const { data: rost, error: rErr } = await supabase
      .from('availability')
      .select('week_id, players(preferred_name, name)')
      .in('week_id', weekIds)
      .eq('is_available', true);
    if (rErr) {
      setError(rErr.message);
      return;
    }
    const rmap: RosterMap = {};
    ((rost ?? []) as unknown as RosterRow[]).forEach((r) => {
      const p = Array.isArray(r.players) ? r.players[0] : r.players;
      const nm = p?.preferred_name || p?.name;
      if (!nm) return;
      (rmap[r.week_id] ??= []).push(nm);
    });
    Object.values(rmap).forEach((list) => list.sort((a, b) => a.localeCompare(b)));
    setRoster(rmap);

    // Guests for each visible week (with host name).
    const { data: gst, error: gErr } = await supabase
      .from('guests')
      .select('id, week_id, name, host_player_id, players(preferred_name, name)')
      .in('week_id', weekIds);
    if (gErr) {
      setError(gErr.message);
      return;
    }
    const gmap: GuestsMap = {};
    ((gst ?? []) as unknown as GuestRow[]).forEach((g) => {
      const h = Array.isArray(g.players) ? g.players[0] : g.players;
      (gmap[g.week_id] ??= []).push({
        id: g.id,
        name: g.name,
        hostName: h?.preferred_name || h?.name || 'member',
        host_player_id: g.host_player_id,
      });
    });
    Object.values(gmap).forEach((list) => list.sort((a, b) => a.name.localeCompare(b.name)));
    setGuests(gmap);
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
    }
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
      ga_number: guestGa.trim() || null,
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

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#7fffb0" size="large" />
      </View>
    );
  }

  return (
    <>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#7fffb0" />
        }
      >
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
            const isOpen = expanded.has(w.id);
            return (
              <View key={w.id} style={styles.card}>
                <View style={styles.row}>
                  <TouchableOpacity
                    style={styles.rowText}
                    onPress={() => toggleExpand(w.id)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.date}>{formatSaturday(w.start_date)}</Text>
                    <Text style={styles.count}>
                      {total} in {isOpen ? '▲' : '▼'}
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
                    {w.booking_deadline && (
                      <Text style={styles.deadline}>
                        Confirm by {formatDeadline(w.booking_deadline)}
                      </Text>
                    )}
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

                    <TouchableOpacity
                      style={styles.addGuestBtn}
                      onPress={() => {
                        setAddingFor(w.id);
                        setGuestName('');
                        setGuestGa('');
                        setError(null);
                      }}
                    >
                      <Text style={styles.addGuestText}>+ Add guest</Text>
                    </TouchableOpacity>
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
            <TextInput
              style={styles.input}
              placeholder="Golf Australia number (optional)"
              placeholderTextColor="#7fa392"
              keyboardType="number-pad"
              value={guestGa}
              onChangeText={setGuestGa}
              editable={!guestBusy}
            />
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
    </>
  );
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
  remove: { color: '#ff9b9b', fontSize: 16, paddingHorizontal: 6 },
  rosterEmpty: { color: '#9fb0a8', fontSize: 13, fontStyle: 'italic' },
  addGuestBtn: { marginTop: 12, alignSelf: 'flex-start' },
  addGuestText: { color: '#7fffb0', fontSize: 14, fontWeight: '600' },
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
