// Sign-in for The Runt — membership number + password.
//
// Members log in with their Manly GC membership number and password. Under the
// hood this maps to a synthetic email (<number>@therunt.app) and uses Supabase
// email+password auth. First-time password is their last name (lowercase),
// changeable in Profile.

import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { emailForMembership } from '../lib/config';

export default function SignInScreen() {
  const [number, setNumber] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    if (!supabase) return;
    const num = number.trim();
    if (!num) return setError('Enter your membership number.');
    if (!password) return setError('Enter your password.');
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({
      email: emailForMembership(num),
      password,
    });
    setBusy(false);
    if (error) {
      setError(
        error.message.toLowerCase().includes('invalid')
          ? 'Wrong membership number or password.'
          : error.message
      );
    }
    // On success the auth listener swaps us onward.
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>The Runt 🐐</Text>
        <Text style={styles.subtitle}>Saturday golf, sorted.</Text>

        <View style={styles.card}>
          <Text style={styles.label}>Membership number</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. 2383"
            placeholderTextColor="#7fa392"
            keyboardType="number-pad"
            value={number}
            onChangeText={setNumber}
            editable={!busy}
          />
          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor="#7fa392"
            secureTextEntry
            autoCapitalize="none"
            value={password}
            onChangeText={setPassword}
            editable={!busy}
            onSubmitEditing={signIn}
          />
          <TouchableOpacity
            style={[styles.button, busy && styles.buttonDisabled]}
            onPress={signIn}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator color="#0b3d2e" />
            ) : (
              <Text style={styles.buttonText}>Sign in</Text>
            )}
          </TouchableOpacity>

          <Text style={styles.help}>
            First time? Your password is your last name in lowercase. Change it in
            Profile after signing in.
          </Text>
          <Text style={styles.help}>Forgotten it? Ask the organiser to reset it.</Text>

          {error && <Text style={styles.error}>⚠️ {error}</Text>}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#0b3d2e' },
  container: {
    flexGrow: 1,
    backgroundColor: '#0b3d2e',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: { fontSize: 40, fontWeight: '800', color: '#ffffff' },
  subtitle: { fontSize: 16, color: '#bfe3d0', marginTop: 4, marginBottom: 28 },
  card: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 14,
    padding: 20,
    width: '100%',
    maxWidth: 360,
  },
  label: { color: '#ffffff', fontSize: 14, marginBottom: 6 },
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
  help: { color: '#9fc6b3', fontSize: 12, marginTop: 14, lineHeight: 17 },
  error: { color: '#ffd2d2', marginTop: 14, fontSize: 14 },
});
