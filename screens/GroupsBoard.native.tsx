// Group editing board — native (tap to move/remove).
// (Native drag-and-drop needs libraries incompatible with Expo Go SDK 54, so
// on the phone we use a reliable tap menu; web keeps HTML5 drag-and-drop.)

import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { Group, Member, Ungrouped } from './GroupEditor';

type Props = {
  groups: Group[];
  ungrouped: Ungrouped[];
  onMove: (gmId: string, targetGroupId: string, beforeGmId?: string) => void;
  onAdd: (groupId: string, playerId: string) => void;
  onRemove: (gmId: string) => void;
  onRequestAdd: (groupId: string) => void;
};

export default function GroupsBoard({ groups, ungrouped, onMove, onRemove, onRequestAdd }: Props) {
  const [menuFor, setMenuFor] = useState<Member | null>(null);

  return (
    <View style={styles.fill}>
      <Text style={styles.hint}>Tap a player to move them to another group or remove them.</Text>
      <ScrollView contentContainerStyle={styles.content}>
        {groups.map((g) => (
          <View key={g.id} style={styles.group}>
            <View style={styles.groupHeader}>
              <Text style={styles.groupName}>{g.name}</Text>
              <TouchableOpacity onPress={() => onRequestAdd(g.id)}>
                <Text style={styles.add}>+ Add</Text>
              </TouchableOpacity>
            </View>
            {g.members.map((m) => (
              <TouchableOpacity key={m.gmId} style={styles.row} onPress={() => setMenuFor(m)}>
                <Text style={styles.name}>
                  {m.name}
                  {m.isBlocker ? ' (blocker)' : ''}
                </Text>
                <Text style={styles.chev}>›</Text>
              </TouchableOpacity>
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

      {menuFor && (
        <View style={styles.overlay}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{menuFor.name}</Text>
            <Text style={styles.dim}>Move to group:</Text>
            {groups.map((g) => (
              <TouchableOpacity
                key={g.id}
                style={styles.pick}
                onPress={() => {
                  const m = menuFor;
                  setMenuFor(null);
                  if (m) onMove(m.gmId, g.id);
                }}
              >
                <Text style={styles.pickName}>{g.name}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={styles.pick}
              onPress={() => {
                const m = menuFor;
                setMenuFor(null);
                if (m) onRemove(m.gmId);
              }}
            >
              <Text style={[styles.pickName, { color: '#ff9b9b' }]}>Remove from group</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setMenuFor(null)}>
              <Text style={styles.close}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  hint: { color: '#9fc6b3', fontSize: 13, marginBottom: 8 },
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
    padding: 14,
    marginTop: 8,
  },
  name: { color: '#ffffff', fontSize: 15 },
  chev: { color: '#7fffb0', fontSize: 20, fontWeight: '700' },
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
  dim: { color: '#9fc6b3', fontSize: 13, marginBottom: 4 },
  pick: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)' },
  pickName: { color: '#ffffff', fontSize: 16 },
  close: { color: '#bfe3d0', fontSize: 15, textAlign: 'center', marginTop: 14 },
});
