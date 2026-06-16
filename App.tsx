import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { isSupabaseConfigured } from './lib/supabase';
import { useAuth } from './lib/useAuth';
import SignInScreen from './screens/SignInScreen';
import SignedIn from './screens/SignedIn';

export default function App() {
  const { loading, session, player, refreshPlayer } = useAuth();

  if (!isSupabaseConfigured) {
    return (
      <Centered>
        <Text style={styles.notice}>
          ⚠️ Supabase not configured — copy .env.example to .env and add your keys.
        </Text>
      </Centered>
    );
  }

  if (loading) {
    return (
      <Centered>
        <ActivityIndicator color="#7fffb0" size="large" />
      </Centered>
    );
  }

  return (
    <>
      {session ? (
        <SignedIn
          player={player}
          email={session.user.email ?? ''}
          refreshPlayer={refreshPlayer}
        />
      ) : (
        <SignInScreen />
      )}
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
