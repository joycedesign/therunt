// Admin group editor for a week.
//
// Each player has an ✕ to remove them; each group has "+ Add" to add an
// ungrouped player or a guest. Same on web and phone (no drag). Admin-only,
// enforced by RLS.

import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { supabase } from '../lib/supabase';
import type { Player } from '../lib/useAuth';

type NamePart = { preferred_name: string | null; name: string };
type Member = { gmId: string; playerId: string; name: string; isBlocker: boolean };
type Guest = { id: string; name: string };
type Group = { id: string; name: string; members: Member[]; guests: Guest[] };
type Ungrouped = { playerId: string; name: string };

function nameOf(p: NamePart | NamePart[] | null): string {
  const x = Array.isArray(p) ? p[0] : p;
  return x?.preferred_name || x?.name || 'player';
}

export default function GroupEditor({
  weekId,
  player,
  onClose,
}: {
  weekId: string;
  player: Player | null;
  onClose: () => void;
}) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [ungrouped, setUngrouped] = useState<Ungrouped[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [addFor, setAddFor] = useState<string | null>(null);
  const [guestName, setGuestName] = useState('');
  const [guestGa, setGuestGa] = useState('');

  const load = useCallback(async () => {
    if (!supabase) return;
    setError(null);
    const { data: grp } = await supabase
      .from('groups')
      .select('id, group_name')
      .eq('week_id', weekId)
      .order('group_name');
    const groupIds = (grp ?? []).map((g: { id: string }) => g.id);

    const gmByGroup: Record<string, Member[]> = {};
    const grouped = new Set<string>();
    if (groupIds.length) {
      const { data: gm } = await supabase
        .from('group_members')
        .select('id, group_id, player_id, is_blocker, position, players(preferred_name, name)')
        .in('group_id', groupIds)
        .order('position');
      (gm ?? []).forEach(
        (r: {
          id: string;
          group_id: string;
          player_id: string;
          is_blocker: boolean;
          players: NamePart | NamePart[] | null;
        }) => {
          (gmByGroup[r.group_id] ??= []).push({
            gmId: r.id,
            playerId: r.player_id,
            name: nameOf(r.players),
            isBlocker: r.is_blocker,
          });
          grouped.add(r.player_id);
        }
      );
    }

    const guestByGroup: Record<string, Guest[]> = {};
    const { data: gst } = await supabase
      .from('guests')
      .select('id, name, group_id')
      .eq('week_id', weekId);
    (gst ?? []).forEach((g: { id: string; name: string; group_id: string | null }) => {
      if (g.group_id) (guestByGroup[g.group_id] ??= []).push({ id: g.id, name: g.name });
    });

    setGroups(
      (grp ?? []).map((g: { id: string; group_name: string }) => ({
        id: g.id,
        name: g.group_name,
        members: gmByGroup[g.id] ?? [],
        guests: guestByGroup[g.id] ?? [],
      }))
    );

    const { data: av } = await supabase
      .from('availability')
      .select('player_id, players(preferred_name, name)')
      .eq('week_id', weekId)
      .eq('is_available', true);
    setUngrouped(
      (av ?? [])
        .filter((r: { player_id: string }) => !grouped.has(r.player_id))
        .map((r: { player_id: string; players: NamePart | NamePart[] | null }) => ({
          playerId: r.player_id,
          name: nameOf(r.players),
        }))
    );
  }, [weekId]);

  useEffect(() => {
    setLoading(true);
    void load().finally(() => setLoading(false));
  }, [load]);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function removeMember(gmId: string) {
    if (!supabase) return;
    await supabase.from('group_members').delete().eq('id', gmId);
  }

  async function removeGuest(guestId: string) {
    if (!supabase) return;
    await supabase.from('guests').delete().eq('id', guestId);
  }

  async function addMember(groupId: string, playerId: string) {
    if (!supabase) return;
    const g = groups.find((x) => x.id === groupId);
    const pos = g ? g.members.length : 0;
    await supabase
      .from('group_members')
      .insert({ group_id: groupId, player_id: playerId, is_blocker: false, position: pos });
  }

  async function addGuest(groupId: string, name: string, ga: string) {
    if (!supabase || !player) return;
    await supabase.from('guests').insert({
      week_id: weekId,
      group_id: groupId,
      host_player_id: player.id,
      name: name.trim(),
      ga_number: ga.trim() || null,
      source: 'manual',
    });
  }

  function openAdd(groupId: string) {
    setGuestName('');
    setGuestGa('');
    setError(null);
    setAddFor(groupId);
  }

  if (loading) {
    return (
      <Modal visible transparent animationType="slide">
        <View style={styles.screen}>
          <ActivityIndicator color="#7fffb0" size="large" style={{ marginTop: 80 }} />
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <Text style={styles.title}>Edit groups</Text>
          <TouchableOpacity onPress={onClose} disabled={busy}>
            <Text style={styles.done}>Done</Text>
          </TouchableOpacity>
        </View>
        {busy && <ActivityIndicator color="#7fffb0" />}
        {error && <Text style={styles.error}>⚠️ {error}</Text>}

        <ScrollView contentContainerStyle={styles.content}>
          {groups.map((g) => (
            <View key={g.id} style={styles.group}>
              <View style={styles.groupHeader}>
                <Text style={styles.groupName}>{g.name}</Text>
                <TouchableOpacity onPress={() => openAdd(g.id)}>
                  <Text style={styles.add}>+ Add</Text>
                </TouchableOpacity>
              </View>
              {g.members.map((m) => (
                <View key={m.gmId} style={styles.row}>
                  <Text style={styles.name}>
                    {m.name}
                    {m.isBlocker ? ' (blocker)' : ''}
                  </Text>
                  <TouchableOpacity onPress={() => run(() => removeMember(m.gmId))} hitSlop={8}>
                    <Text style={styles.remove}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
              {g.guests.map((gu) => (
                <View key={gu.id} style={styles.row}>
                  <Text style={styles.name}>
                    {gu.name} <Text style={styles.guestTag}>(guest)</Text>
                  </Text>
                  <TouchableOpacity onPress={() => run(() => removeGuest(gu.id))} hitSlop={8}>
                    <Text style={styles.remove}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          ))}

          {ungrouped.length > 0 && (
            <View style={styles.group}>
              <Text style={styles.groupName}>Not in a group</Text>
              {ungrouped.map((u) => (
                <Text key={u.playerId} style={styles.ung}>
                  {u.name}
                </Text>
              ))}
            </View>
          )}
        </ScrollView>

        {addFor !== null && (
          <View style={styles.overlay}>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Add to group</Text>

              <Text style={styles.dim}>Add a player</Text>
              <ScrollView style={{ maxHeight: 220 }}>
                {ungrouped.length === 0 ? (
                  <Text style={styles.dim}>No ungrouped players.</Text>
                ) : (
                  ungrouped.map((u) => (
                    <TouchableOpacity
                      key={u.playerId}
                      style={styles.pick}
                      onPress={() => {
                        const gid = addFor;
                        setAddFor(null);
                        if (gid) run(() => addMember(gid, u.playerId));
                      }}
                    >
                      <Text style={styles.pickName}>{u.name}</Text>
                    </TouchableOpacity>
                  ))
                )}
              </ScrollView>

              <View style={styles.divider} />
              <Text style={styles.dim}>Or add a guest</Text>
              <TextInput
                style={styles.input}
                placeholder="Guest name"
                placeholderTextColor="#7fa392"
                value={guestName}
                onChangeText={setGuestName}
                editable={!busy}
              />
              <TextInput
                style={styles.input}
                placeholder="Golf Australia number (optional)"
                placeholderTextColor="#7fa392"
                keyboardType="number-pad"
                value={guestGa}
                onChangeText={setGuestGa}
                editable={!busy}
              />
              <TouchableOpacity
                style={[styles.addGuestBtn, !guestName.trim() && styles.disabled]}
                disabled={!guestName.trim()}
                onPress={() => {
                  const gid = addFor;
                  const nm = guestName;
                  const ga = guestGa;
                  setAddFor(null);
                  if (gid) run(() => addGuest(gid, nm, ga));
                }}
              >
                <Text style={styles.addGuestText}>Add guest</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={() => setAddFor(null)}>
                <Text style={styles.close}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0b3d2e', paddingTop: 56, paddingHorizontal: 20 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  title: { color: '#ffffff', fontSize: 22, fontWeight: '800' },
  done: { color: '#7fffb0', fontSize: 16, fontWeight: '700' },
  error: { color: '#ffd2d2', fontSize: 14, marginBottom: 8 },
  content: { paddingBottom: 40 },
  group: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  groupHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  groupName: { color: '#7fffb0', fontSize: 15, fontWeight: '700' },
  add: { color: '#7fffb0', fontSize: 14, fontWeight: '600' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
  },
  name: { color: '#ffffff', fontSize: 15, flex: 1, paddingRight: 12 },
  guestTag: { color: '#9fc6b3', fontSize: 12, fontStyle: 'italic' },
  remove: { color: '#ff9b9b', fontSize: 16, paddingHorizontal: 6 },
  ung: { color: '#dff3e8', fontSize: 15, paddingVertical: 6 },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#0f4a39',
    borderRadius: 14,
    padding: 20,
    width: '100%',
    maxWidth: 340,
  },
  cardTitle: { color: '#ffffff', fontSize: 18, fontWeight: '700', marginBottom: 8 },
  dim: { color: '#9fc6b3', fontSize: 13, marginTop: 8, marginBottom: 4 },
  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.15)', marginVertical: 12 },
  pick: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)' },
  pickName: { color: '#ffffff', fontSize: 16 },
  input: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 16,
    color: '#0b3d2e',
    marginBottom: 10,
  },
  addGuestBtn: {
    backgroundColor: '#7fffb0',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  disabled: { opacity: 0.6 },
  addGuestText: { color: '#0b3d2e', fontSize: 15, fontWeight: '700' },
  close: { color: '#bfe3d0', fontSize: 15, textAlign: 'center', marginTop: 14 },
});
