// Admin group editor for a week (shell).
//
// Loads the week's groups + ungrouped In-players, owns the Supabase operations,
// and renders a platform-specific board:
//   - GroupsBoard.web.tsx    → HTML5 drag-and-drop
//   - GroupsBoard.native.tsx → tap-to-move (Expo Go can't run the drag libs)
// Both call the same operations (admins only, enforced by RLS).

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
import GroupsBoard from './GroupsBoard';

type NamePart = { preferred_name: string | null; name: string };
export type Member = { gmId: string; playerId: string; name: string; isBlocker: boolean };
export type Group = { id: string; name: string; members: Member[]; guests: string[] };
export type Ungrouped = { playerId: string; name: string };

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

  async function moveMember(gmId: string, targetGroupId: string, beforeGmId?: string) {
    if (!supabase) return;
    const target = groups.find((g) => g.id === targetGroupId);
    if (!target) return;
    const ids = target.members.filter((m) => m.gmId !== gmId).map((m) => m.gmId);
    const idx = beforeGmId ? ids.indexOf(beforeGmId) : ids.length;
    ids.splice(idx < 0 ? ids.length : idx, 0, gmId);
    await supabase.from('group_members').update({ group_id: targetGroupId }).eq('id', gmId);
    for (let i = 0; i < ids.length; i++) {
      await supabase.from('group_members').update({ position: i }).eq('id', ids[i]);
    }
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

        <GroupsBoard
          groups={groups}
          ungrouped={ungrouped}
          onMove={(gmId, tg, before) => run(() => moveMember(gmId, tg, before))}
          onAdd={(gid, pid) => run(() => addMember(gid, pid))}
          onRemove={(gmId) => run(() => removeMember(gmId))}
          onRequestAdd={(gid) => setAddFor(gid)}
        />

        {addFor !== null && (
          <View style={styles.overlay}>
            <View style={styles.pickerCard}>
              <Text style={styles.pickerTitle}>Add player</Text>
              <ScrollView style={{ maxHeight: 320 }}>
                {ungrouped.length === 0 ? (
                  <Text style={styles.dim}>No ungrouped players.</Text>
                ) : (
                  ungrouped.map((u) => (
                    <TouchableOpacity
                      key={u.playerId}
                      style={styles.pickRow}
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
  pickerCard: {
    backgroundColor: '#0f4a39',
    borderRadius: 14,
    padding: 20,
    width: '100%',
    maxWidth: 340,
  },
  pickerTitle: { color: '#ffffff', fontSize: 18, fontWeight: '700', marginBottom: 12 },
  dim: { color: '#9fc6b3', fontSize: 13, marginTop: 6, marginBottom: 4 },
  pickRow: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)' },
  pickName: { color: '#ffffff', fontSize: 16 },
  close: { color: '#bfe3d0', fontSize: 15, textAlign: 'center', marginTop: 14 },
});
