// Set a new password after following a reset link (recovery mode).

import { useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { supabase } from '../lib/supabase';

export default function SetPasswordScreen({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!supabase) return;
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    onDone();
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Set a new password</Text>
      <View style={styles.card}>
        <TextInput
          style={styles.input}
          placeholder="New password"
          placeholderTextColor="#7fa392"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          editable={!busy}
          autoFocus
        />
        <TouchableOpacity
          style={[styles.button, busy && styles.buttonDisabled]}
          onPress={save}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color="#0b3d2e" />
          ) : (
            <Text style={styles.buttonText}>Save password</Text>
          )}
        </TouchableOpacity>
        {error && <Text style={styles.error}>⚠️ {error}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b3d2e',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: { fontSize: 26, fontWeight: '800', color: '#ffffff', marginBottom: 24 },
  card: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 14,
    padding: 20,
    width: '100%',
    maxWidth: 360,
  },
  input: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 16,
    color: '#0b3d2e',
    marginBottom: 12,
  },
  button: {
    backgroundColor: '#7fffb0',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#0b3d2e', fontSize: 16, fontWeight: '700' },
  error: { color: '#ffd2d2', marginTop: 14, fontSize: 14 },
});
