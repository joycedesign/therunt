// Profile editor for The Runt (shown under the "Profile" tab).
//
// The profile row was auto-created from your email on first sign-in;
// here you set your display name / preferred name.

import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
};

export default function ProfileScreen({ player, email, onProfileSaved }: Props) {
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
        membership_number: membershipNumber.trim() || null,
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
      <View style={styles.card}>
      <Text style={styles.label}>Your profile</Text>
      <Text style={styles.email}>{email}</Text>

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

      <Text style={styles.fieldLabel}>Manly GC membership number</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. 6221"
        placeholderTextColor="#7fa392"
        keyboardType="number-pad"
        value={membershipNumber}
        onChangeText={setMembershipNumber}
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
      </View>
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
  defaultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
  },
  defaultState: { color: '#ffffff', fontSize: 15, flex: 1, paddingRight: 12 },
  pwInput: { marginTop: 8 },
});
