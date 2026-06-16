// Weekly availability for The Runt (shown under the "Availability" tab).
//
// Lists upcoming Saturdays and lets the signed-in player toggle whether
// they're in for each one. Saves to the `availability` table (one row per
// player per week, upserted on the (week_id, player_id) unique key).

import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { supabase } from '../lib/supabase';
import type { Player } from '../lib/useAuth';

type Week = { id: string; start_date: string; booking_deadline: string | null };
type AvailMap = Record<string, boolean>;
type RosterMap = Record<string, string[]>;

type NamePart = { preferred_name: string | null; name: string };
type RosterRow = { week_id: string; players: NamePart | NamePart[] | null };

export default function AvailabilityScreen({ player }: { player: Player | null }) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [weeks, setWeeks] = useState<Week[]>([]);
  const [avail, setAvail] = useState<AvailMap>({});
  const [roster, setRoster] = useState<RosterMap>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

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
    const weekIds = ((wk ?? []) as Week[]).map((w) => w.id);
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
  }, [player]);

  useEffect(() => {
    setLoading(true);
    void load().finally(() => setLoading(false));
  }, [load]);

  // Live sync: reload whenever anyone's availability changes (keeps both your
  // own toggles and the who's-in roster current across devices).
  useEffect(() => {
    const client = supabase;
    if (!client || !player) return;
    const channel = client
      .channel('availability-roster')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'availability' },
        () => {
          void load();
        }
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

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#7fffb0" size="large" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#7fffb0" />
      }
    >
      <Text style={styles.heading}>Which Saturdays are you in?</Text>

      {error && <Text style={styles.error}>⚠️ {error}</Text>}

      {weeks.length === 0 ? (
        <Text style={styles.empty}>
          No upcoming Saturdays yet. (Ask the organiser to add some.)
        </Text>
      ) : (
        weeks.map((w) => {
          const inList = roster[w.id] ?? [];
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
                    {inList.length} in {isOpen ? '▲' : '▼'}
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
                  {inList.length === 0 ? (
                    <Text style={styles.rosterEmpty}>No one in yet.</Text>
                  ) : (
                    inList.map((nm, i) => (
                      <Text key={i} style={styles.rosterName}>
                        {i + 1}. {nm}
                      </Text>
                    ))
                  )}
                </View>
              )}
            </View>
          );
        })
      )}

      <Text style={styles.hint}>Pull down to refresh.</Text>
    </ScrollView>
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
  rosterEmpty: { color: '#9fb0a8', fontSize: 13, fontStyle: 'italic' },
  empty: { color: '#bfe3d0', fontSize: 15, marginTop: 8 },
  error: { color: '#ffd2d2', fontSize: 14, marginBottom: 12 },
  hint: { color: '#6f9684', fontSize: 12, textAlign: 'center', marginTop: 8 },
});
