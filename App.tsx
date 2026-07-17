import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { isSupabaseConfigured } from './lib/supabase';
import { useAuth } from './lib/useAuth';
import { useBiometricLock } from './lib/useBiometricLock';
import SignInScreen from './screens/SignInScreen';
import OnboardingScreen from './screens/OnboardingScreen';
import SetPasswordScreen from './screens/SetPasswordScreen';
import LockScreen from './screens/LockScreen';
import SignedIn from './screens/SignedIn';

export default function App() {
  const { loading, checkingProfile, recovery, endRecovery, session, player, refreshPlayer } =
    useAuth();
  const lock = useBiometricLock(loading, !!session);

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
  container: {
    flex: 1,
    backgroundColor: '#0b3d2e',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  notice: { color: '#ffffff', fontSize: 15, textAlign: 'center', maxWidth: 360 },
});
