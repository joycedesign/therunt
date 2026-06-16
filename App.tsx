import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { isSupabaseConfigured, supabase } from './lib/supabase';

type ConnState =
  | { kind: 'unconfigured' }
  | { kind: 'checking' }
  | { kind: 'connected' }
  | { kind: 'error'; message: string };

export default function App() {
  const [conn, setConn] = useState<ConnState>(
    isSupabaseConfigured ? { kind: 'checking' } : { kind: 'unconfigured' }
  );

  useEffect(() => {
    if (!supabase) return;
    // A lightweight round-trip that proves the client can reach Supabase.
    supabase.auth
      .getSession()
      .then(({ error }) =>
        setConn(error ? { kind: 'error', message: error.message } : { kind: 'connected' })
      )
      .catch((e: unknown) =>
        setConn({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
      );
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>The Runt 🐐</Text>
      <Text style={styles.subtitle}>Saturday golf, sorted.</Text>
      <View style={styles.statusBox}>
        <Text style={styles.statusText}>{statusLabel(conn)}</Text>
      </View>
      <StatusBar style="auto" />
    </View>
  );
}

function statusLabel(conn: ConnState): string {
  switch (conn.kind) {
    case 'unconfigured':
      return '⚠️  Supabase not configured — copy .env.example to .env and add your keys.';
    case 'checking':
      return '⏳  Checking Supabase connection…';
    case 'connected':
      return '✅  Connected to Supabase.';
    case 'error':
      return `❌  Supabase error: ${conn.message}`;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b3d2e',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 40,
    fontWeight: '800',
    color: '#ffffff',
  },
  subtitle: {
    fontSize: 16,
    color: '#bfe3d0',
    marginTop: 4,
    marginBottom: 32,
  },
  statusBox: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 18,
    maxWidth: 360,
  },
  statusText: {
    color: '#ffffff',
    fontSize: 15,
    textAlign: 'center',
  },
});
