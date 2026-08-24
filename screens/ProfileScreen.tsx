// Profile editor for The Runt (shown under the "Profile" tab).
//
// The profile row was auto-created from your email on first sign-in;
// here you set your display name / preferred name.

import { useEffect, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { supabase } from '../lib/supabase';
import {
  authenticate,
  biometricAvailable,
  biometricEnabled,
  biometricLabel,
  setBiometricEnabled,
} from '../lib/biometrics';
import type { Player } from '../lib/useAuth';

type Props = {
  player: Player | null;
  email: string;
  onProfileSaved: () => void;
  header?: ReactNode;
};

export default function ProfileScreen({ player, email, onProfileSaved, header }: Props) {
  const [name, setName] = useState('');
  const [preferredName, setPreferredName] = useState('');
  const [membershipNumber, setMembershipNumber] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [defaultAvail, setDefaultAvail] = useState(false);
  const [defBusy, setDefBusy] = useState(false);

  const [faceAvailable, setFaceAvailable] = useState(false);
  const [faceOn, setFaceOn] = useState(false);
  const [faceLabel, setFaceLabel] = useState('Face ID');
  const [faceBusy, setFaceBusy] = useState(false);

  const [newPassword, setNewPassword] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [pwSaved, setPwSaved] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  useEffect(() => {
    setName(player?.name ?? '');
    setPreferredName(player?.preferred_name ?? '');
    setMembershipNumber(player?.membership_number ?? '');
    setDefaultAvail(player?.default_available ?? false);
  }, [player]);

  useEffect(() => {
    let active = true;
    (async () => {
      const avail = await biometricAvailable();
      if (!active) return;
      setFaceAvailable(avail);
      if (avail) {
        setFaceLabel(await biometricLabel());
        setFaceOn(await biometricEnabled());
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  async function changeFace(value: boolean) {
    setFaceBusy(true);
    setError(null);
    if (value) {
      // Confirm biometrics work before enabling.
      const ok = await authenticate();
      if (!ok) {
        setFaceBusy(false);
        return;
      }
    }
    await setBiometricEnabled(value);
    setFaceOn(value);
    setFaceBusy(false);
  }

  async function savePassword() {
    if (!supabase) return;
    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setPwBusy(true);
    setError(null);
    setPwSaved(false);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setPwBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setPwSaved(true);
    setNewPassword('');
  }

  async function deleteAccount() {
    if (!supabase) return;
    setDeleteBusy(true);
    setError(null);
    const { error } = await supabase.rpc('delete_my_account');
    if (error) {
      setDeleteBusy(false);
      setDeleteOpen(false);
      setError(error.message);
      return;
    }
    // Account (incl. auth user) is gone — sign out returns to the sign-in screen.
    await supabase.auth.signOut();
  }

  async function changeDefault(value: boolean) {
    if (!supabase) return;
    setDefBusy(true);
    setError(null);
    setDefaultAvail(value); // optimistic
    const { error } = await supabase.rpc('set_default_availability', {
      p_default: value,
    });
    setDefBusy(false);
    if (error) {
      setError(error.message);
      setDefaultAvail(!value); // revert
      return;
    }
    onProfileSaved();
  }

  async function save() {
    if (!supabase || !player) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    const { error } = await supabase
      .from('players')
      .update({
        name: name.trim(),
        preferred_name: preferredName.trim(),
      })
      .eq('id', player.id);
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setSaved(true);
    onProfileSaved();
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
      showsVerticalScrollIndicator={false}
    >
      {header}
      <View style={styles.card}>
      <Text style={styles.label}>Your profile</Text>
      <Text style={styles.email}>Member #{membershipNumber || '—'}</Text>

      <Text style={styles.fieldLabel}>Full name</Text>
      <TextInput
        style={styles.input}
        placeholder="Henry Joyce"
        placeholderTextColor="#7fa392"
        value={name}
        onChangeText={setName}
        editable={!busy}
      />

      <Text style={styles.fieldLabel}>Preferred name (shown in the app)</Text>
      <TextInput
        style={styles.input}
        placeholder="Henry"
        placeholderTextColor="#7fa392"
        value={preferredName}
        onChangeText={setPreferredName}
        editable={!busy}
      />

      <TouchableOpacity
        style={[styles.button, busy && styles.buttonDisabled]}
        onPress={save}
        disabled={busy}
      >
        {busy ? (
          <ActivityIndicator color="#0b3d2e" />
        ) : (
          <Text style={styles.buttonText}>Save profile</Text>
        )}
      </TouchableOpacity>

      {saved && <Text style={styles.saved}>✅ Saved.</Text>}

      <View style={styles.divider} />

      <Text style={styles.label}>Default availability</Text>
      <Text style={styles.help}>
        {defaultAvail
          ? "You're In by default — this sets all upcoming Saturdays to In. Just switch off the dates you can't make."
          : "You're Out by default — switch this on if you play most weeks, then deselect the dates you can't make."}
      </Text>
      <View style={styles.defaultRow}>
        <Text style={styles.defaultState}>
          {defaultAvail ? 'Playing most weeks' : 'Not playing by default'}
        </Text>
        {defBusy ? (
          <ActivityIndicator color="#7fffb0" />
        ) : (
          <Switch
            value={defaultAvail}
            onValueChange={changeDefault}
            trackColor={{ false: '#ef4444', true: '#22c55e' }}
            thumbColor="#ffffff"
            ios_backgroundColor="#ef4444"
            {...({ activeThumbColor: '#ffffff' } as object)}
          />
        )}
      </View>

      <View style={styles.divider} />
      <Text style={styles.label}>Password</Text>
      <Text style={styles.help}>Set or change your password for email + password sign-in.</Text>
      <TextInput
        style={[styles.input, styles.pwInput]}
        placeholder="New password (min 6 characters)"
        placeholderTextColor="#7fa392"
        secureTextEntry
        value={newPassword}
        onChangeText={setNewPassword}
        editable={!pwBusy}
      />
      <TouchableOpacity
        style={[styles.button, (pwBusy || !newPassword) && styles.buttonDisabled]}
        onPress={savePassword}
        disabled={pwBusy || !newPassword}
      >
        {pwBusy ? (
          <ActivityIndicator color="#0b3d2e" />
        ) : (
          <Text style={styles.buttonText}>Save password</Text>
        )}
      </TouchableOpacity>
      {pwSaved && <Text style={styles.saved}>✅ Password saved.</Text>}

      {faceAvailable && (
        <>
          <View style={styles.divider} />
          <Text style={styles.label}>{faceLabel} unlock</Text>
          <Text style={styles.help}>
            Require {faceLabel} to open the app on this device.
          </Text>
          <View style={styles.defaultRow}>
            <Text style={styles.defaultState}>
              {faceOn ? `${faceLabel} on` : `${faceLabel} off`}
            </Text>
            {faceBusy ? (
              <ActivityIndicator color="#7fffb0" />
            ) : (
              <Switch
                value={faceOn}
                onValueChange={changeFace}
                trackColor={{ false: '#8a9a92', true: '#22c55e' }}
                thumbColor="#ffffff"
                ios_backgroundColor="#8a9a92"
                {...({ activeThumbColor: '#ffffff' } as object)}
              />
            )}
          </View>
        </>
      )}

      {error && <Text style={styles.error}>⚠️ {error}</Text>}

      <View style={styles.divider} />
      <Text style={styles.label}>Delete account</Text>
      <Text style={styles.help}>
        Permanently remove your profile and all your data. This cannot be undone.
      </Text>
      <TouchableOpacity style={styles.deleteBtn} onPress={() => setDeleteOpen(true)}>
        <Text style={styles.deleteBtnText}>Delete my account</Text>
      </TouchableOpacity>
      </View>

      <Modal
        visible={deleteOpen}
        transparent
        animationType="fade"
        onRequestClose={() => !deleteBusy && setDeleteOpen(false)}
      >
        <View style={styles.backdrop}>
          <View style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>Delete your account?</Text>
            <Text style={styles.confirmBody}>
              This permanently deletes your profile, availability, and login. It can’t be undone.
            </Text>
            <View style={styles.confirmRow}>
              <TouchableOpacity onPress={() => setDeleteOpen(false)} disabled={deleteBusy}>
                <Text style={styles.cancel}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.deleteBtn, styles.confirmDelete, deleteBusy && styles.disabled]}
                onPress={deleteAccount}
                disabled={deleteBusy}
              >
                {deleteBusy ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={[styles.deleteBtnText, styles.confirmDeleteText]}>Delete forever</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 32 },
  card: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 14,
    padding: 20,
  },
  label: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
  email: { color: '#bfe3d0', fontSize: 14, marginBottom: 16 },
  fieldLabel: { color: '#bfe3d0', fontSize: 13, marginBottom: 6 },
  input: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 16,
    color: '#0b3d2e',
    marginBottom: 16,
  },
  button: {
    backgroundColor: '#7fffb0',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#0b3d2e', fontSize: 16, fontWeight: '700' },
  saved: { color: '#7fffb0', marginTop: 14, fontSize: 14 },
  error: { color: '#ffd2d2', marginTop: 14, fontSize: 14 },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.15)',
    marginVertical: 20,
  },
  help: { color: '#9fc6b3', fontSize: 13, lineHeight: 18, marginTop: 6 },
  deleteBtn: {
    borderWidth: 1,
    borderColor: '#ff9b9b',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginTop: 12,
  },
  deleteBtnText: { color: '#ff9b9b', fontSize: 15, fontWeight: '700' },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  confirmCard: {
    backgroundColor: '#0f4a39',
    borderRadius: 14,
    padding: 20,
    width: '100%',
    maxWidth: 360,
  },
  confirmTitle: { color: '#ffffff', fontSize: 18, fontWeight: '700', marginBottom: 8 },
  confirmBody: { color: '#dff3e8', fontSize: 14, lineHeight: 20 },
  confirmRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 18,
    marginTop: 20,
  },
  cancel: { color: '#bfe3d0', fontSize: 15 },
  confirmDelete: { marginTop: 0, backgroundColor: '#c0392b', borderColor: '#c0392b' },
  confirmDeleteText: { color: '#ffffff' },
  disabled: { opacity: 0.6 },
  defaultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
  },
  defaultState: { color: '#ffffff', fontSize: 15, flex: 1, paddingRight: 12 },
  pwInput: { marginTop: 8 },
});
