// Organiser ("Runt") status + rotation controls, shown atop the Availability tab.
//
// Everyone sees who the organiser (and helper) is this week. The current
// organiser or an admin can set next week's organiser; the organiser can
// nominate a helper. Both get admin rights for their tenure (via is_admin()).

import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { supabase } from '../lib/supabase';
import type { Player } from '../lib/useAuth';

type NamePart = { preferred_name: string | null; name: string };
type Tenure = {
  id: string;
  runt_player_id: string;
  helper_player_id: string | null;
  starts_on: string;
  ends_on: string;
};
type Pick = { id: string; name: string };

export default function RuntCard({
  player,
  organiserName,
}: {
  player: Player | null;
  organiserName: string;
}) {
  const [tenures, setTenures] = useState<Tenure[]>([]);
  const [nameById, setNameById] = useState<Record<string, string>>({});
  const [picks, setPicks] = useState<Pick[]>([]);
  const [mode, setMode] = useState<'runt' | 'helper' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    const today = new Date().toISOString().slice(0, 10);
    const { data: pl } = await supabase
      .from('players')
      .select('id, preferred_name, name')
      .eq('status', 'active')
      .order('preferred_name', { nullsFirst: false })
      .order('name');
    const map: Record<string, string> = {};
    const list: Pick[] = [];
    ((pl ?? []) as ({ id: string } & NamePart)[]).forEach((p) => {
      const nm = p.preferred_name || p.name;
      map[p.id] = nm;
      list.push({ id: p.id, name: nm });
    });
    setNameById(map);
    setPicks(list);

    const { data: tn } = await supabase
      .from('runt_tenures')
      .select('id, runt_player_id, helper_player_id, starts_on, ends_on')
      .gt('ends_on', today)
      .order('starts_on');
    setTenures((tn ?? []) as Tenure[]);
  }, []);

  useEffect(() => {
    void load();
    const client = supabase;
    if (!client) return;
    const channel = client
      .channel('runt-tenures')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'runt_tenures' }, () =>
        void load()
      )
      .subscribe();
    return () => {
      void client.removeChannel(channel);
    };
  }, [load]);

  const today = new Date().toISOString().slice(0, 10);
  const active = tenures.find((t) => t.starts_on <= today && today < t.ends_on) ?? null;
  const upcoming = tenures.find((t) => t.starts_on > today) ?? null;

  const isAdmin = (player?.is_admin || player?.is_super_admin) ?? false;
  const isActiveRunt = !!active && active.runt_player_id === player?.id;
  const isRuntSomewhere = tenures.some((t) => t.runt_player_id === player?.id);
  const canManage = isAdmin || isActiveRunt;

  async function run(rpc: 'assign_runt' | 'set_runt_helper', arg: string | null) {
    if (!supabase) return;
    setBusy(true);
    setError(null);
    const params =
      rpc === 'assign_runt' ? { p_player_id: arg } : { p_helper_id: arg };
    const { error: e } = await supabase.rpc(rpc, params);
    setBusy(false);
    setMode(null);
    if (e) setError(e.message);
    else void load();
  }

  const line = (t: Tenure) => {
    const rn = nameById[t.runt_player_id] ?? 'someone';
    const hn = t.helper_player_id ? nameById[t.helper_player_id] : null;
    return hn ? `${rn}  ·  helper ${hn}` : rn;
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>🐐 {organiserName}</Text>
      <Text style={styles.status}>
        {active ? (
          <>
            <Text style={styles.strong}>{line(active)}</Text> — this week
          </>
        ) : (
          `No ${organiserName} set yet.`
        )}
      </Text>
      {upcoming && (
        <Text style={styles.next}>Next week: {line(upcoming)}</Text>
      )}

      {error && <Text style={styles.error}>⚠️ {error}</Text>}

      {(canManage || isRuntSomewhere) && (
        <View style={styles.actions}>
          {canManage && (
            <TouchableOpacity onPress={() => setMode('runt')} disabled={busy}>
              <Text style={styles.action}>Set next {organiserName}</Text>
            </TouchableOpacity>
          )}
          {isRuntSomewhere && (
            <TouchableOpacity onPress={() => setMode('helper')} disabled={busy}>
              <Text style={styles.action}>
                {tenures.some((t) => t.runt_player_id === player?.id && t.helper_player_id)
                  ? 'Change helper'
                  : 'Nominate helper'}
              </Text>
            </TouchableOpacity>
          )}
          {busy && <ActivityIndicator color="#7fffb0" />}
        </View>
      )}

      <Modal visible={mode !== null} transparent animationType="fade" onRequestClose={() => setMode(null)}>
        <View style={styles.backdrop}>
          <View style={styles.picker}>
            <Text style={styles.pickerTitle}>
              {mode === 'runt' ? `Who's the next ${organiserName}?` : 'Nominate a helper'}
            </Text>
            <ScrollView style={{ maxHeight: 320 }}>
              {mode === 'helper' && (
                <TouchableOpacity style={styles.pick} onPress={() => run('set_runt_helper', null)}>
                  <Text style={styles.pickName}>No helper</Text>
                </TouchableOpacity>
              )}
              {picks.map((p) => (
                <TouchableOpacity
                  key={p.id}
                  style={styles.pick}
                  onPress={() =>
                    run(mode === 'runt' ? 'assign_runt' : 'set_runt_helper', p.id)
                  }
                >
                  <Text style={styles.pickName}>{p.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity onPress={() => setMode(null)} disabled={busy}>
              <Text style={styles.close}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(127,255,176,0.1)',
    borderWidth: 1,
    borderColor: '#7fffb0',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  title: { color: '#7fffb0', fontSize: 14, fontWeight: '800', marginBottom: 4 },
  status: { color: '#ffffff', fontSize: 15 },
  strong: { fontWeight: '700' },
  next: { color: '#bfe3d0', fontSize: 13, marginTop: 4 },
  error: { color: '#ffd2d2', fontSize: 13, marginTop: 8 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 18, marginTop: 12 },
  action: { color: '#7fffb0', fontSize: 14, fontWeight: '700' },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  picker: {
    backgroundColor: '#0f4a39',
    borderRadius: 14,
    padding: 20,
    width: '100%',
    maxWidth: 340,
  },
  pickerTitle: { color: '#ffffff', fontSize: 17, fontWeight: '700', marginBottom: 10 },
  pick: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)' },
  pickName: { color: '#ffffff', fontSize: 16 },
  close: { color: '#bfe3d0', fontSize: 15, textAlign: 'center', marginTop: 14 },
});
