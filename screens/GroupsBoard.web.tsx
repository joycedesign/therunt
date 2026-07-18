// Group editing board — web (HTML5 drag-and-drop).
// Drag a player onto a group to move them, or onto a player to reorder. ✕ removes.

import type { DragEvent as RDragEvent } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Group, Ungrouped } from './GroupEditor';

type Props = {
  groups: Group[];
  ungrouped: Ungrouped[];
  onMove: (gmId: string, targetGroupId: string, beforeGmId?: string) => void;
  onAdd: (groupId: string, playerId: string) => void;
  onRemove: (gmId: string) => void;
  onRequestAdd: (groupId: string) => void;
};

export default function GroupsBoard({ groups, ungrouped, onMove, onRemove, onRequestAdd }: Props) {
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.hint}>
        Drag a player onto a group to move them, or onto a player to reorder. ✕ removes.
      </Text>

      {groups.map((g) => (
        <div
          key={g.id}
          onDragOver={(e: RDragEvent<HTMLDivElement>) => e.preventDefault()}
          onDrop={(e: RDragEvent<HTMLDivElement>) => {
            e.preventDefault();
            const gmId = e.dataTransfer.getData('text');
            if (gmId) onMove(gmId, g.id);
          }}
          style={webGroup}
        >
          <div style={webHeader}>
            <span style={webGroupName}>{g.name}</span>
            <span style={webAdd} onClick={() => onRequestAdd(g.id)}>
              + Add
            </span>
          </div>
          {g.members.map((m) => (
            <div
              key={m.gmId}
              draggable
              onDragStart={(e: RDragEvent<HTMLDivElement>) => e.dataTransfer.setData('text', m.gmId)}
              onDragOver={(e: RDragEvent<HTMLDivElement>) => e.preventDefault()}
              onDrop={(e: RDragEvent<HTMLDivElement>) => {
                e.preventDefault();
                e.stopPropagation();
                const gmId = e.dataTransfer.getData('text');
                if (gmId && gmId !== m.gmId) onMove(gmId, g.id, m.gmId);
              }}
              style={webRow}
            >
              <span>
                {m.name}
                {m.isBlocker ? ' (blocker)' : ''}
              </span>
              <span style={webRemove} onClick={() => onRemove(m.gmId)}>
                ✕
              </span>
            </div>
          ))}
          {g.guests.map((gn, i) => (
            <div key={`gu-${i}`} style={webGuest}>
              {gn} (guest)
            </div>
          ))}
        </div>
      ))}

      {ungrouped.length > 0 && (
        <View style={styles.ungroupedBox}>
          <Text style={styles.groupName}>Not in a group</Text>
          {ungrouped.map((u) => (
            <Text key={u.playerId} style={styles.ungroupedName}>
              {u.name}
            </Text>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const webGroup = {
  backgroundColor: 'rgba(255,255,255,0.08)',
  borderRadius: 12,
  padding: 12,
  marginBottom: 12,
} as const;
const webHeader = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
} as const;
const webGroupName = { color: '#7fffb0', fontSize: 15, fontWeight: 700 } as const;
const webAdd = { color: '#7fffb0', fontSize: 14, fontWeight: 600, cursor: 'pointer' } as const;
const webRow = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  backgroundColor: 'rgba(255,255,255,0.14)',
  borderRadius: 8,
  padding: 12,
  marginTop: 8,
  color: '#ffffff',
  fontSize: 15,
  cursor: 'grab',
} as const;
const webRemove = { color: '#ff9b9b', fontSize: 15, cursor: 'pointer', paddingLeft: 12 } as const;
const webGuest = { color: '#9fc6b3', fontSize: 13, fontStyle: 'italic', marginTop: 8 } as const;

const styles = StyleSheet.create({
  content: { paddingBottom: 40 },
  hint: { color: '#9fc6b3', fontSize: 13, marginBottom: 12 },
  ungroupedBox: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  groupName: { color: '#7fffb0', fontSize: 15, fontWeight: '700' },
  ungroupedName: { color: '#dff3e8', fontSize: 15, paddingVertical: 6 },
});
