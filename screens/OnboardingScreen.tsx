// First-run onboarding for The Runt.
//
// Shown when a signed-in user has no linked profile yet. They enter their
// Manly GC membership number to claim their pre-added member profile; if the
// number isn't found, a fresh profile is created (new members / non-members).

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

export default function OnboardingScreen({ onDone }: { onDone: () => void }) {
  const [number, setNumber] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(skip: boolean) {
    if (!supabase) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc('claim_or_create_member', {
      p_number: skip ? null : number.trim(),
    });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    onDone();
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome to The Runt 🐐</Text>
      <Text style={styles.subtitle}>Let's find your profile.</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Your Manly GC membership number</Text>
        <Text style={styles.help}>
          Enter it to link your existing profile. Not a member yet? Skip and we'll
          set up a new one.
        </Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. 6221"
          placeholderTextColor="#7fa392"
          keyboardType="number-pad"
          value={number}
          onChangeText={setNumber}
          editable={!busy}
        />
        <TouchableOpacity
          style={[styles.button, (busy || !number.trim()) && styles.buttonDisabled]}
          onPress={() => submit(false)}
          disabled={busy || !number.trim()}
        >
          {busy ? (
            <ActivityIndicator color="#0b3d2e" />
          ) : (
            <Text style={styles.buttonText}>Find my profile</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity onPress={() => submit(true)} disabled={busy}>
          <Text style={styles.link}>I'm new — skip for now</Text>
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
  title: { fontSize: 32, fontWeight: '800', color: '#ffffff', textAlign: 'center' },
  subtitle: { fontSize: 16, color: '#bfe3d0', marginTop: 4, marginBottom: 28 },
  card: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 14,
    padding: 20,
    width: '100%',
    maxWidth: 360,
  },
  label: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
  help: { color: '#9fc6b3', fontSize: 13, lineHeight: 18, marginTop: 6, marginBottom: 14 },
  input: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 16,
    color: '#0b3d2e',
    marginBottom: 14,
  },
  button: {
    backgroundColor: '#7fffb0',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#0b3d2e', fontSize: 16, fontWeight: '700' },
  link: { color: '#bfe3d0', textAlign: 'center', marginTop: 16, fontSize: 14 },
  error: { color: '#ffd2d2', marginTop: 14, fontSize: 14 },
});
