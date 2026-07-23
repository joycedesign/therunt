// Members management for The Runt (shown under the "Members" tab).
//
// Add/edit/remove members (name, shortname, Manly GC number), and invite people
// to the app via email or a QR code. Members who have signed up ("claimed")
// are read-only here — they manage their own profile.

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
import { Switch } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { supabase } from '../lib/supabase';
import { INVITE_URL } from '../lib/config';
import type { Player } from '../lib/useAuth';

type Member = {
  id: string;
  name: string;
  preferred_name: string | null;
  membership_number: string | null;
  auth_user_id: string | null;
  is_admin: boolean;
};

export default function MembersScreen({ player }: { player: Player | null }) {
  const isAdmin = player?.is_admin ?? false;
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Add / edit modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fName, setFName] = useState('');
  const [fShort, setFShort] = useState('');
  const [fNumber, setFNumber] = useState('');
  const [fAdmin, setFAdmin] = useState(false);
  const [busy, setBusy] = useState(false);

  // Invite modal
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteMsg, setInviteMsg] = useState<string | null>(null);
  const [inviteErr, setInviteErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    setError(null);
    const { data, error } = await supabase
      .from('players')
      .select('id, name, preferred_name, membership_number, auth_user_id, is_admin')
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
    setFAdmin(false);
    setError(null);
    setModalOpen(true);
  }

  function openEdit(m: Member) {
    setEditingId(m.id);
    setFName(m.name);
    setFShort(m.preferred_name ?? '');
    setFNumber(m.membership_number ?? '');
    setFAdmin(m.is_admin);
    setError(null);
    setModalOpen(true);
  }

  function openInvite() {
    setInviteEmail('');
    setInviteMsg(null);
    setInviteErr(null);
    setInviteOpen(true);
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
    const fields: Record<string, unknown> = {
      name: name || short,
      preferred_name: short || name,
      membership_number: number || null,
    };
    if (isAdmin) fields.is_admin = fAdmin; // only admins send this (DB also enforces)
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

  async function sendEmailInvite() {
    if (!supabase) return;
    const email = inviteEmail.trim().toLowerCase();
    if (!email.includes('@')) {
      setInviteErr('Enter a valid email.');
      return;
    }
    setInviteBusy(true);
    setInviteErr(null);
    setInviteMsg(null);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });
    setInviteBusy(false);
    if (error) {
      setInviteErr(error.message);
      return;
    }
    setInviteMsg(`Invite sent to ${email}.`);
    setInviteEmail('');
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
          <View style={styles.headerButtons}>
            <TouchableOpacity style={styles.ghostBtn} onPress={openInvite}>
              <Text style={styles.ghostBtnText}>Invite</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.addBtn} onPress={openAdd}>
              <Text style={styles.addBtnText}>+ Add</Text>
            </TouchableOpacity>
          </View>
        </View>

        {error && !modalOpen && <Text style={styles.error}>⚠️ {error}</Text>}

        {members.map((m) => {
          const claimed = m.auth_user_id != null;
          const editable = isAdmin || !claimed;
          return (
            <TouchableOpacity
              key={m.id}
              style={styles.row}
              activeOpacity={editable ? 0.7 : 1}
              onPress={() => (editable ? openEdit(m) : undefined)}
              disabled={!editable}
            >
              <View style={styles.rowText}>
                <Text style={styles.name}>
                  {m.preferred_name || m.name}
                  <Text style={styles.numInline}>
                    {m.membership_number ? `  ·  #${m.membership_number}` : '  ·  no number'}
                  </Text>
                  {m.is_admin && <Text style={styles.adminBadge}>  admin</Text>}
                </Text>
                <Text style={styles.sub}>
                  {m.name}
                  {claimed ? '  ·  signed up' : ''}
                </Text>
              </View>
              {editable && <Text style={styles.chevron}>›</Text>}
            </TouchableOpacity>
          );
        })}

        <Text style={styles.hint}>
          Tap a member to edit. Members who've signed up manage their own profile.
        </Text>
      </ScrollView>

      {/* Add / edit member */}
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
            {isAdmin && (
              <View style={styles.adminRow}>
                <Text style={styles.adminLabel}>Admin (can run the draw)</Text>
                <Switch
                  value={fAdmin}
                  onValueChange={setFAdmin}
                  trackColor={{ false: '#8a9a92', true: '#22c55e' }}
                  thumbColor="#ffffff"
                  ios_backgroundColor="#8a9a92"
                  {...({ activeThumbColor: '#ffffff' } as object)}
                  disabled={busy}
                />
              </View>
            )}
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

      {/* Invite */}
      <Modal
        visible={inviteOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setInviteOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Invite a member</Text>

            <View style={styles.qrWrap}>
              <QRCode value={INVITE_URL} size={172} backgroundColor="#ffffff" color="#0b3d2e" />
            </View>
            <Text style={styles.qrCaption}>Scan to join The Runt</Text>

            <View style={styles.orRow}>
              <View style={styles.orLine} />
              <Text style={styles.orText}>or invite by email</Text>
              <View style={styles.orLine} />
            </View>

            <TextInput
              style={styles.input}
              placeholder="their@email.com"
              placeholderTextColor="#7fa392"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              value={inviteEmail}
              onChangeText={setInviteEmail}
              editable={!inviteBusy}
            />
            <TouchableOpacity
              style={[styles.saveBtn, styles.fullBtn, inviteBusy && styles.disabled]}
              onPress={sendEmailInvite}
              disabled={inviteBusy}
            >
              {inviteBusy ? (
                <ActivityIndicator color="#0b3d2e" />
              ) : (
                <Text style={styles.saveBtnText}>Send email invite</Text>
              )}
            </TouchableOpacity>

            {inviteMsg && <Text style={styles.invited}>✅ {inviteMsg}</Text>}
            {inviteErr && <Text style={styles.error}>⚠️ {inviteErr}</Text>}

            <TouchableOpacity onPress={() => setInviteOpen(false)} disabled={inviteBusy}>
              <Text style={styles.closeLink}>Close</Text>
            </TouchableOpacity>
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
  heading: { color: '#ffffff', fontSize: 18, fontWeight: '700', flexShrink: 1 },
  headerButtons: { flexDirection: 'row', gap: 8 },
  ghostBtn: {
    borderWidth: 1,
    borderColor: '#7fffb0',
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  ghostBtnText: { color: '#7fffb0', fontSize: 14, fontWeight: '700' },
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
  numInline: { color: '#9fc6b3', fontSize: 14, fontWeight: '400' },
  sub: { color: '#9fc6b3', fontSize: 12, marginTop: 2 },
  chevron: { color: '#7fffb0', fontSize: 22, fontWeight: '700' },
  adminBadge: { color: '#7fffb0', fontSize: 12, fontWeight: '700' },
  adminRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  adminLabel: { color: '#ffffff', fontSize: 14, flex: 1, paddingRight: 12 },
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
    alignItems: 'center',
  },
  fullBtn: { marginBottom: 4 },
  disabled: { opacity: 0.6 },
  saveBtnText: { color: '#0b3d2e', fontSize: 15, fontWeight: '700' },
  qrWrap: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    alignSelf: 'center',
  },
  qrCaption: {
    color: '#bfe3d0',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 10,
  },
  orRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 16 },
  orLine: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.15)' },
  orText: { color: '#9fc6b3', fontSize: 12 },
  invited: { color: '#7fffb0', fontSize: 13, marginTop: 4 },
  closeLink: { color: '#bfe3d0', fontSize: 15, textAlign: 'center', marginTop: 16 },
});
