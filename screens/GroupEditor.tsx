// Admin group editor for a week.
//
// Web: HTML5 drag-and-drop — drag a player onto another group (move) or onto a
// player (drop before, to reorder). Phone: tap a player for a move/remove/reorder
// menu. Both call the same Supabase operations (admins only, enforced by RLS).

import { useCallback, useEffect, useState } from 'react';
import type { DragEvent as RDragEvent } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
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
  const [addFor, setAddFor] = useState<string | null>(null); // group id to add to
  const [menuFor, setMenuFor] = useState<Member | null>(null); // native move menu

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

    // In players not currently in any group.
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

  // Move a member before `beforeGmId` in target group (or to the end).
  async function moveMember(gmId: string, targetGroupId: string, beforeGmId?: string) {
    if (!supabase) return;
    const target = groups.find((g) => g.id === targetGroupId);
    if (!target) return;
    const moving =
      groups.flatMap((g) => g.members).find((m) => m.gmId === gmId) ?? null;
    if (!moving) return;
    // New ordered list of gmIds for the target group.
    const ids = target.members.filter((m) => m.gmId !== gmId).map((m) => m.gmId);
    const idx = beforeGmId ? ids.indexOf(beforeGmId) : ids.length;
    ids.splice(idx < 0 ? ids.length : idx, 0, gmId);
    // Point the moved row at the target group, then reindex positions.
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
        <Text style={styles.hint}>
          {Platform.OS === 'web'
            ? 'Drag a player onto a group to move them, or onto another player to reorder.'
            : 'Tap a player to move, reorder, or remove them.'}
        </Text>

        <ScrollView contentContainerStyle={styles.content}>
          {groups.map((g) => (
            <WebOr
              key={g.id}
              web={
                <div
                  onDragOver={(e: RDragEvent<HTMLDivElement>) => e.preventDefault()}
                  onDrop={(e: RDragEvent<HTMLDivElement>) => {
                    e.preventDefault();
                    const gmId = e.dataTransfer.getData('text');
                    if (gmId) void run(() => moveMember(gmId, g.id));
                  }}
                  style={webGroupStyle}
                >
                  {groupInner(g)}
                </div>
              }
              native={<View style={styles.group}>{groupInner(g)}</View>}
            />
          ))}

          {ungrouped.length > 0 && (
            <View style={styles.group}>
              <Text style={styles.groupName}>Not in a group</Text>
              {ungrouped.map((u) => (
                <Text key={u.playerId} style={styles.ungroupedName}>
                  {u.name}
                </Text>
              ))}
            </View>
          )}
        </ScrollView>
      </View>

      {/* Native: add-to-group picker */}
      <Modal visible={addFor !== null} transparent animationType="fade" onRequestClose={() => setAddFor(null)}>
        <View style={styles.pickerBackdrop}>
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
                      if (gid) void run(() => addMember(gid, u.playerId));
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
      </Modal>

      {/* Native: per-player move/remove menu */}
      <Modal visible={menuFor !== null} transparent animationType="fade" onRequestClose={() => setMenuFor(null)}>
        <View style={styles.pickerBackdrop}>
          <View style={styles.pickerCard}>
            <Text style={styles.pickerTitle}>{menuFor?.name}</Text>
            <Text style={styles.dim}>Move to group:</Text>
            {groups.map((g) => (
              <TouchableOpacity
                key={g.id}
                style={styles.pickRow}
                onPress={() => {
                  const m = menuFor;
                  setMenuFor(null);
                  if (m) void run(() => moveMember(m.gmId, g.id));
                }}
              >
                <Text style={styles.pickName}>{g.name}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={styles.pickRow}
              onPress={() => {
                const m = menuFor;
                setMenuFor(null);
                if (m) void run(() => removeMember(m.gmId));
              }}
            >
              <Text style={[styles.pickName, { color: '#ff9b9b' }]}>Remove from group</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setMenuFor(null)}>
              <Text style={styles.close}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </Modal>
  );

  function groupInner(g: Group) {
    return (
      <>
        <View style={styles.groupHeader}>
          <Text style={styles.groupName}>{g.name}</Text>
          <TouchableOpacity onPress={() => setAddFor(g.id)}>
            <Text style={styles.addLink}>+ Add</Text>
          </TouchableOpacity>
        </View>
        {g.members.map((m) => (
          <WebOr
            key={m.gmId}
            web={
              <div
                draggable
                onDragStart={(e: RDragEvent<HTMLDivElement>) =>
                  e.dataTransfer.setData('text', m.gmId)
                }
                onDragOver={(e: RDragEvent<HTMLDivElement>) => e.preventDefault()}
                onDrop={(e: RDragEvent<HTMLDivElement>) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const gmId = e.dataTransfer.getData('text');
                  if (gmId && gmId !== m.gmId) void run(() => moveMember(gmId, g.id, m.gmId));
                }}
                style={webRowStyle}
              >
                {m.name}
                {m.isBlocker ? ' (blocker)' : ''}
              </div>
            }
            native={
              <TouchableOpacity style={styles.memberRow} onPress={() => setMenuFor(m)}>
                <Text style={styles.memberName}>
                  {m.name}
                  {m.isBlocker ? ' (blocker)' : ''}
                </Text>
                <Text style={styles.grip}>⋮⋮</Text>
              </TouchableOpacity>
            }
          />
        ))}
        {g.guests.map((gn, i) => (
          <Text key={`guest-${i}`} style={styles.guestName}>
            {gn} (guest)
          </Text>
        ))}
      </>
    );
  }
}

// Render a raw DOM node on web, a RN node on native.
function WebOr({ web, native }: { web: React.ReactNode; native: React.ReactNode }) {
  return Platform.OS === 'web' ? <>{web}</> : <>{native}</>;
}

const webGroupStyle = {
  backgroundColor: 'rgba(255,255,255,0.08)',
  borderRadius: 12,
  padding: 12,
  marginBottom: 12,
} as const;

const webRowStyle = {
  backgroundColor: 'rgba(255,255,255,0.12)',
  borderRadius: 8,
  padding: 12,
  marginTop: 8,
  color: '#ffffff',
  fontSize: 15,
  cursor: 'grab',
} as const;

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
  hint: { color: '#9fc6b3', fontSize: 13, marginBottom: 12 },
  error: { color: '#ffd2d2', fontSize: 14, marginBottom: 8 },
  content: { paddingBottom: 40 },
  group: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  groupName: { color: '#7fffb0', fontSize: 15, fontWeight: '700' },
  addLink: { color: '#7fffb0', fontSize: 14, fontWeight: '600' },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
  },
  memberName: { color: '#ffffff', fontSize: 15 },
  grip: { color: '#9fc6b3', fontSize: 16 },
  guestName: { color: '#9fc6b3', fontSize: 13, fontStyle: 'italic', marginTop: 8, paddingLeft: 4 },
  ungroupedName: { color: '#dff3e8', fontSize: 15, paddingVertical: 6 },
  pickerBackdrop: {
    flex: 1,
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
