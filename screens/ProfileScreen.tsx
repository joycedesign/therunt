// Profile editor for The Runt (shown under the "Profile" tab).
//
// The profile row was auto-created from your email on first sign-in;
// here you set your display name / preferred name.

import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { supabase } from '../lib/supabase';
import type { Player } from '../lib/useAuth';

type Props = {
  player: Player | null;
  email: string;
  onProfileSaved: () => void;
};

export default function ProfileScreen({ player, email, onProfileSaved }: Props) {
  const [name, setName] = useState('');
  const [preferredName, setPreferredName] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setName(player?.name ?? '');
    setPreferredName(player?.preferred_name ?? '');
  }, [player]);

  async function save() {
    if (!supabase || !player) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    const { error } = await supabase
      .from('players')
      .update({ name: name.trim(), preferred_name: preferredName.trim() })
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
      {error && <Text style={styles.error}>⚠️ {error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
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
});
