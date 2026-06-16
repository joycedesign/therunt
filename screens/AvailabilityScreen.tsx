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
  View,
} from 'react-native';
import { supabase } from '../lib/supabase';
import type { Player } from '../lib/useAuth';

type Week = { id: string; start_date: string; booking_deadline: string | null };
type AvailMap = Record<string, boolean>;

export default function AvailabilityScreen({ player }: { player: Player | null }) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [weeks, setWeeks] = useState<Week[]>([]);
  const [avail, setAvail] = useState<AvailMap>({});
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
  }, [player]);

  useEffect(() => {
    setLoading(true);
    void load().finally(() => setLoading(false));
  }, [load]);

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
        { week_id: weekId, player_id: player.id, is_available: value },
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
        weeks.map((w) => (
          <View key={w.id} style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.date}>{formatSaturday(w.start_date)}</Text>
              {w.booking_deadline && (
                <Text style={styles.deadline}>
                  Confirm by {formatDeadline(w.booking_deadline)}
                </Text>
              )}
            </View>
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
        ))
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  rowText: { flex: 1, paddingRight: 12 },
  date: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
  deadline: { color: '#9fc6b3', fontSize: 12, marginTop: 2 },
  empty: { color: '#bfe3d0', fontSize: 15, marginTop: 8 },
  error: { color: '#ffd2d2', fontSize: 14, marginBottom: 12 },
  hint: { color: '#6f9684', fontSize: 12, textAlign: 'center', marginTop: 8 },
});
