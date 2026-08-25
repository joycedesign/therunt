import { Component, useEffect, useState, type ReactNode } from 'react';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { isSupabaseConfigured } from './lib/supabase';
import { useAuth } from './lib/useAuth';
import { registerForPush } from './lib/push';
import { useBiometricLock } from './lib/useBiometricLock';
import SignInScreen from './screens/SignInScreen';
import OnboardingScreen from './screens/OnboardingScreen';
import SetPasswordScreen from './screens/SetPasswordScreen';
import LockScreen from './screens/LockScreen';
import SignedIn from './screens/SignedIn';
import { SettingsProvider } from './lib/useSettings';

// TEMPORARY: surface any startup error on-screen (render errors via the
// boundary, uncaught errors via the polled global catcher). Remove once fixed.
function ErrorView({ msg }: { msg: string }) {
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#3a0d0d' }}
      contentContainerStyle={{ padding: 24, paddingTop: 80 }}
    >
      <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800', marginBottom: 12 }}>
        Startup error
      </Text>
      <Text selectable style={{ color: '#ffd2d2', fontSize: 12, lineHeight: 18 }}>
        {msg}
      </Text>
    </ScrollView>
  );
}

class ErrorBoundary extends Component<{ children: ReactNode }, { msg: string | null }> {
  state = { msg: null as string | null };
  static getDerivedStateFromError(e: unknown) {
    const err = e as { stack?: string; message?: string };
    return { msg: err?.stack || err?.message || String(e) };
  }
  render() {
    if (this.state.msg) return <ErrorView msg={this.state.msg} />;
    return this.props.children;
  }
}

function GlobalErrorWatcher({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    const id = setInterval(() => {
      const g = global as unknown as { __STARTUP_ERROR__?: string };
      if (g.__STARTUP_ERROR__) setMsg(g.__STARTUP_ERROR__);
    }, 1000);
    return () => clearInterval(id);
  }, []);
  if (msg) return <ErrorView msg={msg} />;
  return <>{children}</>;
}

export default function App() {
  return (
    <ErrorBoundary>
      <GlobalErrorWatcher>
        <SettingsProvider>
          <AppInner />
        </SettingsProvider>
      </GlobalErrorWatcher>
    </ErrorBoundary>
  );
}

function AppInner() {
  const { loading, checkingProfile, recovery, endRecovery, session, player, refreshPlayer } =
    useAuth();
  const lock = useBiometricLock(loading, !!session);

  // Register this device for push once the member is signed in (native only).
  useEffect(() => {
    if (player?.id) void registerForPush(player.id);
  }, [player?.id]);

  if (!isSupabaseConfigured) {
    return (
      <Centered>
        <Text style={styles.notice}>
          ⚠️ Supabase not configured — copy .env.example to .env and add your keys.
        </Text>
      </Centered>
    );
  }

  if (loading || (session && (checkingProfile || !lock.ready))) {
    return (
      <Centered>
        <ActivityIndicator color="#7fffb0" size="large" />
      </Centered>
    );
  }

  function content() {
    if (recovery) return <SetPasswordScreen onDone={endRecovery} />;
    if (!session) return <SignInScreen />;
    if (lock.locked) return <LockScreen onUnlock={lock.unlock} />;
    if (!player) return <OnboardingScreen onDone={refreshPlayer} />;
    return (
      <SignedIn
        player={player}
        email={session.user.email ?? ''}
        refreshPlayer={refreshPlayer}
      />
    );
  }

  return (
    <>
      {content()}
      <StatusBar style="light" />
    </>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.container}>
      {children}
      <StatusBar style="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  container: {
    flex: 1,
    backgroundColor: '#0b3d2e',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  notice: { color: '#ffffff', fontSize: 15, textAlign: 'center', maxWidth: 360 },
});
