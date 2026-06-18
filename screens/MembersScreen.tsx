// Members management for The Runt (shown under the "Members" tab).
//
// Add/edit/remove members (name, shortname, Manly GC number) so the organiser
// doesn't need SQL. Members who have signed up ("claimed") are shown read-only
// here — they manage their own profile.

import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { supabase } from '../lib/supabase';

type Member = {
  id: string;
  name: string;
  preferred_name: string | null;
  membership_number: string | null;
  auth_user_id: string | null;
};

export default function MembersScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fName, setFName] = useState('');
  const [fShort, setFShort] = useState('');
  const [fNumber, setFNumber] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!supabase) return;
    setError(null);
    const { data, error } = await supabase
      .from('players')
      .select('id, name, preferred_name, membership_number, auth_user_id')
      .order('preferred_name', { nullsFirst: false })
      .order('name');
    if (error) {
      setError(error.message);
      return;
    }
    setMembers((data ?? []) as Member[]);
  }, []);

  useEffect(() => {
    setLoading(true);
    void load().finally(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    const client = supabase;
    if (!client) return;
    const channel = client
      .channel('members-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, () =>
        void load()
      )
      .subscribe();
    return () => {
      void client.removeChannel(channel);
    };
  }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  function openAdd() {
    setEditingId(null);
    setFName('');
    setFShort('');
    setFNumber('');
    setError(null);
    setModalOpen(true);
  }

  function openEdit(m: Member) {
    setEditingId(m.id);
    setFName(m.name);
    setFShort(m.preferred_name ?? '');
    setFNumber(m.membership_number ?? '');
    setError(null);
    setModalOpen(true);
  }

  async function save() {
    if (!supabase) return;
    const name = fName.trim();
    const short = fShort.trim();
    const number = fNumber.trim();
    if (!name && !short) {
      setError('Enter a name.');
      return;
    }
    setBusy(true);
    setError(null);
    const fields = {
      name: name || short,
      preferred_name: short || name,
      membership_number: number || null,
    };
    const resp = editingId
      ? await supabase.from('players').update(fields).eq('id', editingId)
      : await supabase.from('players').insert({ ...fields, status: 'active' });
    setBusy(false);
    if (resp.error) {
      setError(
        resp.error.message.includes('membership_number')
          ? 'That membership number is already used.'
          : resp.error.message
      );
      return;
    }
    setModalOpen(false);
    void load();
  }

  async function remove() {
    if (!supabase || !editingId) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase.from('players').delete().eq('id', editingId);
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setModalOpen(false);
    void load();
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#7fffb0" size="large" />
      </View>
    );
  }

  const editingClaimed = members.find((m) => m.id === editingId)?.auth_user_id != null;

  return (
    <>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#7fffb0" />
        }
      >
        <View style={styles.headerRow}>
          <Text style={styles.heading}>Members ({members.length})</Text>
          <TouchableOpacity style={styles.addBtn} onPress={openAdd}>
            <Text style={styles.addBtnText}>+ Add</Text>
          </TouchableOpacity>
        </View>

        {error && !modalOpen && <Text style={styles.error}>⚠️ {error}</Text>}

        {members.map((m) => {
          const claimed = m.auth_user_id != null;
          return (
            <TouchableOpacity
              key={m.id}
              style={styles.row}
              activeOpacity={claimed ? 1 : 0.7}
              onPress={() => (claimed ? undefined : openEdit(m))}
              disabled={claimed}
            >
              <View style={styles.rowText}>
                <Text style={styles.name}>{m.preferred_name || m.name}</Text>
                <Text style={styles.sub}>
                  {m.membership_number ? `#${m.membership_number}` : 'no number'}
                  {claimed ? '  ·  signed up' : ''}
                </Text>
              </View>
              {!claimed && <Text style={styles.chevron}>›</Text>}
            </TouchableOpacity>
          );
        })}

        <Text style={styles.hint}>
          Tap a member to edit. Members who've signed up manage their own profile.
        </Text>
      </ScrollView>

      <Modal
        visible={modalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{editingId ? 'Edit member' : 'Add member'}</Text>
            <TextInput
              style={styles.input}
              placeholder="Shortname (e.g. Stevo)"
              placeholderTextColor="#7fa392"
              value={fShort}
              onChangeText={setFShort}
              editable={!busy}
              autoFocus
            />
            <TextInput
              style={styles.input}
              placeholder="Full name (optional)"
              placeholderTextColor="#7fa392"
              value={fName}
              onChangeText={setFName}
              editable={!busy}
            />
            <TextInput
              style={styles.input}
              placeholder="Manly GC number"
              placeholderTextColor="#7fa392"
              keyboardType="number-pad"
              value={fNumber}
              onChangeText={setFNumber}
              editable={!busy}
            />
            {error && modalOpen && <Text style={styles.error}>⚠️ {error}</Text>}
            <View style={styles.modalButtons}>
              {editingId && !editingClaimed && (
                <TouchableOpacity onPress={remove} disabled={busy}>
                  <Text style={styles.delete}>Delete</Text>
                </TouchableOpacity>
              )}
              <View style={styles.flexSpacer} />
              <TouchableOpacity onPress={() => setModalOpen(false)} disabled={busy}>
                <Text style={styles.cancel}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, busy && styles.disabled]}
                onPress={save}
                disabled={busy}
              >
                {busy ? (
                  <ActivityIndicator color="#0b3d2e" />
                ) : (
                  <Text style={styles.saveBtnText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingBottom: 24 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  heading: { color: '#ffffff', fontSize: 18, fontWeight: '700' },
  addBtn: {
    backgroundColor: '#7fffb0',
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  addBtnText: { color: '#0b3d2e', fontSize: 14, fontWeight: '700' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  rowText: { flex: 1, paddingRight: 12 },
  name: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
  sub: { color: '#9fc6b3', fontSize: 12, marginTop: 2 },
  chevron: { color: '#7fffb0', fontSize: 22, fontWeight: '700' },
  hint: { color: '#6f9684', fontSize: 12, textAlign: 'center', marginTop: 12 },
  error: { color: '#ffd2d2', fontSize: 14, marginBottom: 12 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: '#0f4a39',
    borderRadius: 14,
    padding: 20,
    width: '100%',
    maxWidth: 360,
  },
  modalTitle: { color: '#ffffff', fontSize: 18, fontWeight: '700', marginBottom: 16 },
  input: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 16,
    color: '#0b3d2e',
    marginBottom: 12,
  },
  modalButtons: { flexDirection: 'row', alignItems: 'center', gap: 18, marginTop: 4 },
  flexSpacer: { flex: 1 },
  delete: { color: '#ff9b9b', fontSize: 15, fontWeight: '600' },
  cancel: { color: '#bfe3d0', fontSize: 15 },
  saveBtn: {
    backgroundColor: '#7fffb0',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 18,
  },
  disabled: { opacity: 0.6 },
  saveBtnText: { color: '#0b3d2e', fontSize: 15, fontWeight: '700' },
});
