// Email one-time-code sign-in for The Runt.
//
// Step 1: enter email -> Supabase emails a 6-digit code.
// Step 2: enter the code -> verifyOtp signs you in.
// Works identically on web and native (no deep-linking needed).

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

type Stage = 'email' | 'code';

export default function SignInScreen() {
  const [stage, setStage] = useState<Stage>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode() {
    if (!supabase) return;
    const cleaned = email.trim().toLowerCase();
    if (!cleaned.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: cleaned,
      options: { shouldCreateUser: true },
    });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setEmail(cleaned);
    setStage('code');
  }

  async function verifyCode() {
    if (!supabase) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: code.trim(),
      type: 'email',
    });
    setBusy(false);
    if (error) setError(error.message);
    // On success, the auth listener in useAuth swaps us to the home screen.
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>The Runt 🐐</Text>
      <Text style={styles.subtitle}>Saturday golf, sorted.</Text>

      <View style={styles.card}>
        {stage === 'email' ? (
          <>
            <Text style={styles.label}>Sign in with your email</Text>
            <Text style={styles.help}>
              We&apos;ll email you a 6-digit code to sign in.
            </Text>
            <TextInput
              style={styles.input}
              placeholder="you@example.com"
              placeholderTextColor="#7fa392"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              editable={!busy}
            />
            <TouchableOpacity
              style={[styles.button, busy && styles.buttonDisabled]}
              onPress={sendCode}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator color="#0b3d2e" />
              ) : (
                <Text style={styles.buttonText}>Email me a code</Text>
              )}
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.label}>Enter the 6-digit code we emailed to</Text>
            <Text style={styles.email}>{email}</Text>
            <Text style={styles.help}>
              Can&apos;t see it? Check your spam folder. On a computer you can
              also just tap the link in that email to sign in.
            </Text>
            <TextInput
              style={[styles.input, styles.codeInput]}
              placeholder="123456"
              placeholderTextColor="#7fa392"
              keyboardType="number-pad"
              maxLength={6}
              value={code}
              onChangeText={setCode}
              editable={!busy}
            />
            <TouchableOpacity
              style={[styles.button, busy && styles.buttonDisabled]}
              onPress={verifyCode}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator color="#0b3d2e" />
              ) : (
                <Text style={styles.buttonText}>Verify &amp; sign in</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                setStage('email');
                setCode('');
                setError(null);
              }}
              disabled={busy}
            >
              <Text style={styles.link}>Use a different email</Text>
            </TouchableOpacity>
          </>
        )}

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
  title: { fontSize: 40, fontWeight: '800', color: '#ffffff' },
  subtitle: { fontSize: 16, color: '#bfe3d0', marginTop: 4, marginBottom: 32 },
  card: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 14,
    padding: 20,
    width: '100%',
    maxWidth: 360,
  },
  label: { color: '#ffffff', fontSize: 15, marginBottom: 6 },
  help: { color: '#9fc6b3', fontSize: 13, marginBottom: 14, lineHeight: 18 },
  email: { color: '#bfe3d0', fontSize: 15, marginBottom: 12, fontWeight: '600' },
  input: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 16,
    color: '#0b3d2e',
    marginBottom: 14,
  },
  codeInput: { letterSpacing: 8, textAlign: 'center', fontSize: 22 },
  button: {
    backgroundColor: '#7fffb0',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#0b3d2e', fontSize: 16, fontWeight: '700' },
  link: { color: '#bfe3d0', textAlign: 'center', marginTop: 14, fontSize: 14 },
  error: { color: '#ffd2d2', marginTop: 14, fontSize: 14 },
});
