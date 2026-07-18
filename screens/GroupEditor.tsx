// Admin group editor for a week.
//
// Each player has an "Edit" button → Remove from group, Move to another group,
// or Replace with an ungrouped player. Plus "+ Add" per group. Works the same
// on web and phone (no drag libraries). Admin-only, enforced by RLS.

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

type NamePart = { preferred_name: string | null; name: string };
type Member = { gmId: string; playerId: string; name: string; isBlocker: boolean };
type Group = { id: string; name: string; members: Member[]; guests: string[] };
type Ungrouped = { playerId: string; name: string };

function nameOf(p: NamePart | NamePart[] | null): string {
  const x = Array.isArray(p) ? p[0] : p;
  return x?.preferred_name || x?.name || 'player';
}

export default function GroupEditor({
  weekId,
  onClose,
}: {
  weekId: string;
  onClose: () => void;
}) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [ungrouped, setUngrouped] = useState<Ungrouped[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addFor, setAddFor] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ m: Member; groupId: string } | null>(null);

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

    const guestByGroup: Record<string, string[]> = {};
    const { data: gst } = await supabase
      .from('guests')
      .select('name, group_id')
      .eq('week_id', weekId);
    (gst ?? []).forEach((g: { name: string; group_id: string | null }) => {
      if (g.group_id) (guestByGroup[g.group_id] ??= []).push(g.name);
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

  async function moveMember(gmId: string, targetGroupId: string) {
    if (!supabase) return;
    const target = groups.find((g) => g.id === targetGroupId);
    const pos = target ? target.members.length : 0;
    await supabase
      .from('group_members')
      .update({ group_id: targetGroupId, position: pos })
      .eq('id', gmId);
  }

  async function removeMember(gmId: string) {
    if (!supabase) return;
    await supabase.from('group_members').delete().eq('id', gmId);
  }

  async function addMember(groupId: string, playerId: string) {
    if (!supabase) return;
    const g = groups.find((x) => x.id === groupId);
    const pos = g ? g.members.length : 0;
    await supabase
      .from('group_members')
      .insert({ group_id: groupId, player_id: playerId, is_blocker: false, position: pos });
  }

  async function replaceMember(gmId: string, newPlayerId: string) {
    if (!supabase) return;
    await supabase
      .from('group_members')
      .update({ player_id: newPlayerId, is_blocker: false })
      .eq('id', gmId);
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

  const otherGroups = editing ? groups.filter((g) => g.id !== editing.groupId) : [];

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
                <TouchableOpacity onPress={() => setAddFor(g.id)}>
                  <Text style={styles.add}>+ Add</Text>
                </TouchableOpacity>
              </View>
              {g.members.map((m) => (
                <View key={m.gmId} style={styles.row}>
                  <Text style={styles.name}>
                    {m.name}
                    {m.isBlocker ? ' (blocker)' : ''}
                  </Text>
                  <TouchableOpacity onPress={() => setEditing({ m, groupId: g.id })}>
                    <Text style={styles.edit}>Edit</Text>
                  </TouchableOpacity>
                </View>
              ))}
              {g.guests.map((gn, i) => (
                <Text key={`gu-${i}`} style={styles.guest}>
                  {gn} (guest)
                </Text>
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

        {/* Add player */}
        {addFor !== null && (
          <View style={styles.overlay}>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Add player</Text>
              <ScrollView style={{ maxHeight: 320 }}>
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
              <TouchableOpacity onPress={() => setAddFor(null)}>
                <Text style={styles.close}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Edit player */}
        {editing && (
          <View style={styles.overlay}>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{editing.m.name}</Text>

              <TouchableOpacity
                style={styles.pick}
                onPress={() => {
                  const gm = editing.m.gmId;
                  setEditing(null);
                  run(() => removeMember(gm));
                }}
              >
                <Text style={[styles.pickName, { color: '#ff9b9b' }]}>Remove from group</Text>
              </TouchableOpacity>

              {otherGroups.length > 0 && <Text style={styles.dim}>Move to group:</Text>}
              {otherGroups.map((g) => (
                <TouchableOpacity
                  key={g.id}
                  style={styles.pick}
                  onPress={() => {
                    const gm = editing.m.gmId;
                    setEditing(null);
                    run(() => moveMember(gm, g.id));
                  }}
                >
                  <Text style={styles.pickName}>{g.name}</Text>
                </TouchableOpacity>
              ))}

              <Text style={styles.dim}>Replace with:</Text>
              <ScrollView style={{ maxHeight: 200 }}>
                {ungrouped.length === 0 ? (
                  <Text style={styles.dim}>No available players.</Text>
                ) : (
                  ungrouped.map((u) => (
                    <TouchableOpacity
                      key={u.playerId}
                      style={styles.pick}
                      onPress={() => {
                        const gm = editing.m.gmId;
                        setEditing(null);
                        run(() => replaceMember(gm, u.playerId));
                      }}
                    >
                      <Text style={styles.pickName}>{u.name}</Text>
                    </TouchableOpacity>
                  ))
                )}
              </ScrollView>

              <TouchableOpacity onPress={() => setEditing(null)}>
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
  edit: { color: '#7fffb0', fontSize: 14, fontWeight: '700' },
  guest: { color: '#9fc6b3', fontSize: 13, fontStyle: 'italic', marginTop: 8 },
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
  cardTitle: { color: '#ffffff', fontSize: 18, fontWeight: '700', marginBottom: 12 },
  dim: { color: '#9fc6b3', fontSize: 13, marginTop: 10, marginBottom: 2 },
  pick: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)' },
  pickName: { color: '#ffffff', fontSize: 16 },
  close: { color: '#bfe3d0', fontSize: 15, textAlign: 'center', marginTop: 14 },
});
