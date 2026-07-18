// Group editing board — native (react-native-draggable-flatlist).
// One list with group headers; long-press a player and drag to another group
// or reorder. Drag into "Not in a group" to remove; drag an ungrouped player
// into a group to add.

import { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import DraggableFlatList, {
  type RenderItemParams,
} from 'react-native-draggable-flatlist';
import type { Group, Ungrouped } from './GroupEditor';

type Props = {
  groups: Group[];
  ungrouped: Ungrouped[];
  onMove: (gmId: string, targetGroupId: string, beforeGmId?: string) => void;
  onAdd: (groupId: string, playerId: string) => void;
  onRemove: (gmId: string) => void;
  onRequestAdd: (groupId: string) => void;
};

type Row =
  | { type: 'header'; key: string; groupId: string | null; title: string }
  | {
      type: 'player';
      key: string;
      groupId: string | null;
      gmId: string | null;
      playerId: string;
      name: string;
      isBlocker: boolean;
    };

export default function GroupsBoard({ groups, ungrouped, onMove, onAdd, onRemove }: Props) {
  const data: Row[] = useMemo(() => {
    const rows: Row[] = [];
    groups.forEach((g) => {
      rows.push({ type: 'header', key: `h-${g.id}`, groupId: g.id, title: g.name });
      g.members.forEach((m) =>
        rows.push({
          type: 'player',
          key: `p-${m.gmId}`,
          groupId: g.id,
          gmId: m.gmId,
          playerId: m.playerId,
          name: m.name,
          isBlocker: m.isBlocker,
        })
      );
    });
    rows.push({ type: 'header', key: 'h-ungrouped', groupId: null, title: 'Not in a group' });
    ungrouped.forEach((u) =>
      rows.push({
        type: 'player',
        key: `u-${u.playerId}`,
        groupId: null,
        gmId: null,
        playerId: u.playerId,
        name: u.name,
        isBlocker: false,
      })
    );
    return rows;
  }, [groups, ungrouped]);

  function handleDragEnd({ data: nd, to }: { data: Row[]; from: number; to: number }) {
    const moved = nd[to];
    if (!moved || moved.type !== 'player') return;

    let targetGroupId: string | null = null;
    for (let i = to - 1; i >= 0; i--) {
      if (nd[i].type === 'header') {
        targetGroupId = nd[i].groupId;
        break;
      }
    }
    let beforeGmId: string | undefined;
    for (let i = to + 1; i < nd.length; i++) {
      const r = nd[i];
      if (r.type === 'header') break;
      if (r.type === 'player' && r.gmId) {
        beforeGmId = r.gmId;
        break;
      }
    }

    if (targetGroupId === null) {
      if (moved.gmId) onRemove(moved.gmId);
      return;
    }
    if (moved.gmId) onMove(moved.gmId, targetGroupId, beforeGmId);
    else onAdd(targetGroupId, moved.playerId);
  }

  function renderItem({ item, drag, isActive }: RenderItemParams<Row>) {
    if (item.type === 'header') {
      return (
        <View style={styles.header}>
          <Text style={styles.headerText}>{item.title}</Text>
        </View>
      );
    }
    return (
      <TouchableOpacity
        onLongPress={drag}
        disabled={isActive}
        style={[styles.row, isActive && styles.rowActive]}
      >
        <Text style={styles.name}>
          {item.name}
          {item.isBlocker ? ' (blocker)' : ''}
        </Text>
        <Text style={styles.grip}>≡</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.fill}>
      <Text style={styles.hint}>
        Long-press a player and drag to a group or to reorder. Drag to "Not in a group" to remove.
      </Text>
      <DraggableFlatList
        data={data}
        keyExtractor={(r) => r.key}
        renderItem={renderItem}
        onDragEnd={handleDragEnd}
        activationDistance={12}
        containerStyle={styles.fill}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  hint: { color: '#9fc6b3', fontSize: 13, marginBottom: 8 },
  header: { paddingTop: 14, paddingBottom: 4 },
  headerText: { color: '#7fffb0', fontSize: 15, fontWeight: '700' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: 8,
    padding: 14,
    marginTop: 8,
  },
  rowActive: { backgroundColor: '#0f4a39', opacity: 0.9 },
  name: { color: '#ffffff', fontSize: 15 },
  grip: { color: '#9fc6b3', fontSize: 18 },
});
