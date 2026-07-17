// Sign-in for The Runt — password or emailed one-time code.
//
// Password: email + password sign-in / create account, with a "forgot
// password" email reset. Code: enter email -> 6-digit code -> verify.
// Works on web and native.

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

type Mode = 'password' | 'code';
type Stage = 'email' | 'code';

export default function SignInScreen() {
  const [mode, setMode] = useState<Mode>('password');

  // Shared
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Password
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);

  // Code
  const [stage, setStage] = useState<Stage>('email');
  const [code, setCode] = useState('');

  function reset() {
    setError(null);
    setNotice(null);
  }

  async function passwordSubmit() {
    if (!supabase) return;
    const e = email.trim().toLowerCase();
    if (!e.includes('@')) return setError('Please enter a valid email address.');
    if (password.length < 6) return setError('Password must be at least 6 characters.');
    setBusy(true);
    reset();
    const { error } = isSignUp
      ? await supabase.auth.signUp({ email: e, password })
      : await supabase.auth.signInWithPassword({ email: e, password });
    setBusy(false);
    if (error) setError(error.message);
    // On success the auth listener swaps us onward.
  }

  async function forgotPassword() {
    if (!supabase) return;
    const e = email.trim().toLowerCase();
    if (!e.includes('@')) return setError('Enter your email first, then tap "Forgot password".');
    setBusy(true);
    reset();
    const { error } = await supabase.auth.resetPasswordForEmail(e, {
      redirectTo: Platform.OS === 'web' ? window.location.origin : undefined,
    });
    setBusy(false);
    if (error) setError(error.message);
    else setNotice(`Password reset email sent to ${e}.`);
  }

  async function sendCode() {
    if (!supabase) return;
    const e = email.trim().toLowerCase();
    if (!e.includes('@')) return setError('Please enter a valid email address.');
    setBusy(true);
    reset();
    const { error } = await supabase.auth.signInWithOtp({
      email: e,
      options: { shouldCreateUser: true },
    });
    setBusy(false);
    if (error) return setError(error.message);
    setEmail(e);
    setStage('code');
  }

  async function verifyCode() {
    if (!supabase) return;
    setBusy(true);
    reset();
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: code.trim(),
      type: 'email',
    });
    setBusy(false);
    if (error) setError(error.message);
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

      <View style={styles.tabs}>
        <Tab
          label="Password"
          active={mode === 'password'}
          onPress={() => {
            setMode('password');
            reset();
          }}
        />
        <Tab
          label="Email code"
          active={mode === 'code'}
          onPress={() => {
            setMode('code');
            setStage('email');
            reset();
          }}
        />
      </View>

      <View style={styles.card}>
        {mode === 'password' ? (
          <>
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
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor="#7fa392"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              editable={!busy}
            />
            <TouchableOpacity
              style={[styles.button, busy && styles.buttonDisabled]}
              onPress={passwordSubmit}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator color="#0b3d2e" />
              ) : (
                <Text style={styles.buttonText}>
                  {isSignUp ? 'Create account' : 'Sign in'}
                </Text>
              )}
            </TouchableOpacity>

            <View style={styles.links}>
              <TouchableOpacity
                onPress={() => {
                  setIsSignUp((v) => !v);
                  reset();
                }}
                disabled={busy}
              >
                <Text style={styles.link}>
                  {isSignUp ? 'Have an account? Sign in' : 'Create an account'}
                </Text>
              </TouchableOpacity>
              {!isSignUp && (
                <TouchableOpacity onPress={forgotPassword} disabled={busy}>
                  <Text style={styles.link}>Forgot password?</Text>
                </TouchableOpacity>
              )}
            </View>
          </>
        ) : stage === 'email' ? (
          <>
            <Text style={styles.help}>We'll email you a 6-digit code to sign in.</Text>
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
            <Text style={styles.help}>Enter the 6-digit code we emailed to</Text>
            <Text style={styles.email}>{email}</Text>
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
                reset();
              }}
              disabled={busy}
            >
              <Text style={styles.link}>Use a different email</Text>
            </TouchableOpacity>
          </>
        )}

        {notice && <Text style={styles.notice}>✅ {notice}</Text>}
        {error && <Text style={styles.error}>⚠️ {error}</Text>}
      </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Tab({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={[styles.tab, active && styles.tabActive]} onPress={onPress}>
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
    </TouchableOpacity>
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
  tabs: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  tab: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  tabActive: { backgroundColor: '#7fffb0' },
  tabText: { color: '#bfe3d0', fontSize: 14, fontWeight: '600' },
  tabTextActive: { color: '#0b3d2e' },
  card: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 14,
    padding: 20,
    width: '100%',
    maxWidth: 360,
  },
  help: { color: '#9fc6b3', fontSize: 13, marginBottom: 12 },
  email: { color: '#bfe3d0', fontSize: 15, marginBottom: 12, fontWeight: '600' },
  input: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 16,
    color: '#0b3d2e',
    marginBottom: 12,
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
  links: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14,
    flexWrap: 'wrap',
    gap: 8,
  },
  link: { color: '#bfe3d0', fontSize: 14 },
  notice: { color: '#7fffb0', marginTop: 14, fontSize: 14 },
  error: { color: '#ffd2d2', marginTop: 14, fontSize: 14 },
});
